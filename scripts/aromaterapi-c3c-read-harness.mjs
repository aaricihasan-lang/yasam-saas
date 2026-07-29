// ============================================================
// Aromaterapi C3C — Tenant-kapsamlı okuma sözleşme harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB/Supabase'e bağlanmaz, mutation yapmaz.
// Route + method sözleşmesi, tenant güvenliği, validation, veri katmanı
// ayrımı, UI gerçek-veri bağlaması ve C3C kapsam sınırlarını doğrular.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function has(rel) { return existsSync(resolve(ROOT, rel)); }
function read(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

// Dosya listeleri --------------------------------------------------
const READ_ROUTES = [
  "app/api/aromaterapi/plant-taxa/route.ts",
  "app/api/aromaterapi/plant-taxa/[id]/route.ts",
  "app/api/aromaterapi/preparations/route.ts",
  "app/api/aromaterapi/preparations/[id]/route.ts",
  "app/api/aromaterapi/sources/route.ts",
  "app/api/aromaterapi/sources/[id]/route.ts",
  "app/api/aromaterapi/sources/[id]/passages/route.ts",
  "app/api/aromaterapi/passages/[id]/route.ts",
  "app/api/aromaterapi/claims/[id]/audit/route.ts",
  "app/api/aromaterapi/glossary/route.ts",
];
const CLAIM_ROUTES = [
  "app/api/aromaterapi/claims/route.ts",
  "app/api/aromaterapi/claims/[id]/route.ts",
];
const SERVICES = [
  "lib/aromaterapi/service/catalogReads.ts",
  "lib/aromaterapi/service/sourceReads.ts",
  "lib/aromaterapi/service/claimReads.ts",
  "lib/aromaterapi/service/glossaryReads.ts",
];
const CLIENT_WRAPPERS = [
  "lib/aromaterapi/catalogData.ts",
  "lib/aromaterapi/sourceData.ts",
  "lib/aromaterapi/claimData.ts",
  "lib/aromaterapi/glossaryData.ts",
  "lib/aromaterapi/readClient.ts",
];

// ============================================================
console.log("\n[C3C-1] Route ve method sözleşmesi");
// ============================================================
for (const r of READ_ROUTES) {
  check(`R route var: ${r}`, has(r), "yok");
  const src = read(r);
  check(`R GET export: ${r}`, /export\s+async\s+function\s+GET\s*\(/.test(src));
  check(`R DELETE yok: ${r}`, !/export\s+async\s+function\s+DELETE/.test(src));
  check(`R POST/PATCH yok: ${r}`,
    !/export\s+async\s+function\s+(POST|PATCH|PUT)/.test(src));
}
// Mevcut C2T mutation route'ları: POST/PATCH KORUNMUŞ + GET EKLENMİŞ.
const claimsList = read("app/api/aromaterapi/claims/route.ts");
const claimsId = read("app/api/aromaterapi/claims/[id]/route.ts");
check("M claims POST korunmuş", /export\s+async\s+function\s+POST\s*\(/.test(claimsList));
check("M claims GET eklendi", /export\s+async\s+function\s+GET\s*\(/.test(claimsList));
check("M claims/[id] PATCH korunmuş", /export\s+async\s+function\s+PATCH\s*\(/.test(claimsId));
check("M claims/[id] GET eklendi", /export\s+async\s+function\s+GET\s*\(/.test(claimsId));
check("M claims create RPC çağrısı korunmuş", /createClaim\s*\(/.test(claimsList));
check("M claims update RPC çağrısı korunmuş", /updateClaim\s*\(/.test(claimsId));

// ============================================================
console.log("\n[C3C-2] Tenant güvenliği (değişmez read sözleşmesi)");
// ============================================================
for (const r of [...READ_ROUTES, ...CLAIM_ROUTES]) {
  const src = read(r);
  check(`T verifyUserRequest: ${r}`, src.includes("verifyUserRequest"));
  // tenant istemciden alınmamalı: query/body'den tenant okuma yok.
  check(`T tenant query/body'den alınmıyor: ${r}`,
    !/searchParams\.get\(\s*["'](tenant_id|tenantId|p_tenant_id)["']/.test(src) &&
    !/\btenant_id\b\s*:\s*(body|obj|req)/.test(src));
}
for (const s of SERVICES) {
  const src = read(s);
  check(`T service server-only: ${s}`, /^import\s+["']server-only["'];/m.test(src));
  check(`T service tenant filtresi (.eq tenant_id): ${s}`,
    /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(src));
  check(`T service tenantId zorunlu parametre: ${s}`,
    /tenantId\s*:\s*string/.test(src));
  check(`T service mutation yok (insert/update/delete/upsert): ${s}`,
    !/\.(insert|update|delete|upsert|rpc)\s*\(/.test(src));
}
// İstemci sarmalayıcıları service_role/secret taşımaz + server-only import ETMEZ.
for (const c of CLIENT_WRAPPERS) {
  const src = read(c);
  check(`T client service_role yok: ${c}`, !/service_role|SERVICE_ROLE|getServerDb/.test(src));
  check(`T client server-only import etmez: ${c}`, !/["']server-only["']/.test(src));
  check(`T client canonical tabloya doğrudan erişmez: ${c}`,
    !/aromatherapy_(sources|claims|plant_taxa|preparations|glossary)/.test(src));
}

// ============================================================
console.log("\n[C3C-3] Validation ve hata sözleşmesi");
// ============================================================
const VAL = read("lib/aromaterapi/service/readValidation.ts");
check("V UUID doğrulaması", /export\s+function\s+isUuid/.test(VAL) && /UUID_RE/.test(VAL));
check("V parseListParams", /export\s+function\s+parseListParams/.test(VAL));
check("V limit üst sınırı (MAX_LIMIT)", /READ_MAX_LIMIT/.test(VAL));
check("V page/limit stabil 400 kodları",
  /AROMA_INVALID_PAGE/.test(VAL) && /AROMA_INVALID_LIMIT/.test(VAL));
check("V uzun sorgu reddi", /AROMA_QUERY_TOO_LONG/.test(VAL) && /READ_MAX_Q_LEN/.test(VAL));
check("V filtre allowlist reddi", /AROMA_INVALID_FILTER/.test(VAL));
check("V ilike enjeksiyon sanitizasyonu (buildOrIlike/safeIlikePattern)",
  /safeIlikePattern/.test(VAL) && /replace\(\/\[,\(\)\*%/.test(VAL));

const ERR = read("lib/aromaterapi/service/readErrors.ts");
check("E readErrors server-only", /^import\s+["']server-only["'];/m.test(ERR));
check("E ham DB hatası sızmaz (readServerError stabil kod)",
  /AROMA_READ_FAILED/.test(ERR) && /console\.error/.test(ERR));
check("E 404 notFound sözleşmesi", /AROMA_NOT_FOUND/.test(ERR) && /readNotFound/.test(ERR));
// Read route'ları ham hatayı değil güvenli helper'ı döner.
for (const r of READ_ROUTES) {
  const src = read(r);
  check(`E route güvenli hata helper'ı kullanır: ${r}`,
    /readServerError|readFail|readNotFound|readListOk/.test(src));
}

// ============================================================
console.log("\n[C3C-4] Veri katmanı ayrımı");
// ============================================================
const SRC_READS = read("lib/aromaterapi/service/sourceReads.ts");
check("D pasaj katmanları AYRI (original/translations/explanations/interpretations)",
  /original_text/.test(SRC_READS) &&
  /editorial_explanations/.test(SRC_READS) &&
  /editorial_interpretations/.test(SRC_READS) &&
  /translations/.test(SRC_READS));
check("D editoryal ayrım editorial_class ile",
  /editorial_class\s*===\s*["']editorial_interpretation["']/.test(SRC_READS));
const CLAIM_READS = read("lib/aromaterapi/service/claimReads.ts");
check("D claim detay ayrı diziler (routes/populations/sources/passages/relations)",
  /routes/.test(CLAIM_READS) && /populations/.test(CLAIM_READS) &&
  /sources/.test(CLAIM_READS) && /passages/.test(CLAIM_READS) && /relations/.test(CLAIM_READS));
check("D audit salt-okunur (audit tablosuna insert/update/delete yok)",
  !/aromatherapy_claim_audit_events["'][^]*\.(insert|update|delete)/.test(CLAIM_READS));
check("D deterministik sıralama (id tie-breaker)",
  SERVICES.every((s) => /\.order\(\s*["']id["']/.test(read(s))));
check("D toplam/sayfalama sözleşmesi (count exact + total)",
  SERVICES.every((s) => /count:\s*["']exact["']/.test(read(s))));

// ============================================================
console.log("\n[C3C-5] UI gerçek-veri bağlaması");
// ============================================================
const PAGE_TAXA = read("app/aromaterapi/katalog/page.tsx");
const PAGE_KAY = read("app/aromaterapi/kaynaklar/page.tsx");
const PAGE_BK = read("app/aromaterapi/bilgi-kayitlari/page.tsx");
check("U katalog page View bağlar", /KatalogView/.test(PAGE_TAXA));
check("U kaynaklar page View bağlar", /KaynaklarView/.test(PAGE_KAY));
check("U bilgi-kayitlari page View bağlar", /BilgiKayitlariView/.test(PAGE_BK));
check("U placeholder 'hazırlanıyor/pending' KALDIRILDI",
  !/variant="pending"|hazırlanıyor/i.test(PAGE_TAXA) &&
  !/variant="pending"|hazırlanıyor/i.test(PAGE_KAY) &&
  !/variant="pending"|hazırlanıyor/i.test(PAGE_BK));
check("U sayfa ince kabuk (page.tsx'te doğrudan fetch yok)",
  !/\bfetch\s*\(|supabase|\.rpc\(/.test(PAGE_TAXA) &&
  !/\bfetch\s*\(|supabase|\.rpc\(/.test(PAGE_KAY) &&
  !/\bfetch\s*\(|supabase|\.rpc\(/.test(PAGE_BK));

const KATALOG_VIEW = read("app/aromaterapi/katalog/_components/KatalogView.tsx");
check("U katalog gerçek data wrapper kullanır",
  /fetchPlantTaxaList/.test(KATALOG_VIEW) && /fetchPreparationList/.test(KATALOG_VIEW));
const KAY_VIEW = read("app/aromaterapi/kaynaklar/_components/KaynaklarView.tsx");
check("U kaynaklar gerçek data wrapper kullanır", /fetchSourceList/.test(KAY_VIEW));
const BK_VIEW = read("app/aromaterapi/bilgi-kayitlari/_components/BilgiKayitlariView.tsx");
check("U bilgi-kayitlari gerçek data wrapper kullanır", /fetchKnowledgeRecordList/.test(BK_VIEW));

// "claim" teknik terimi kullanıcı yüzeyinde görünmez. Kod tanımlayıcıları
// (claim_type gibi, alt-çizgiyle) ve import/yorum satırları kapsam dışı; yalnız
// tırnak içi SERBEST "claim" kelimesi (kullanıcıya gösterilebilecek metin) aranır.
const bkUserText = BK_VIEW
  .replace(/\/\*[\s\S]*?\*\//g, "")   // blok yorum
  .replace(/\/\/[^\n]*/g, "")          // satır yorum
  .replace(/^import[^\n]*$/gm, "");    // import
check("U menü/kullanıcı dilinde serbest 'claim' kelimesi yok (View)",
  !/["'>][^"'<]*\bclaim\b(?!_)[^"'<]*["'<]/i.test(bkUserText),
  "kullanıcı metninde 'claim' bulundu");
check("U 'Bilgi Kayıtları' terimi kullanılıyor", /Bilgi Kayıtları|Bilgi Kaydı/.test(BK_VIEW));

// Preparat detay "Üretim ve Elde Ediliş" sözleşmesi (şema boşluğu boş-durum).
const PREP_DETAIL = read("app/aromaterapi/katalog/preparatlar/[id]/page.tsx");
check("U preparat detay 'Üretim ve Elde Ediliş' bölümü var",
  /Üretim ve Elde Ediliş/.test(PREP_DETAIL));
check("U preparat detay sahte yöntem üretmez (şema boşluğu boş-durum)",
  /SchemaGapNote|henüz.*girilmemiş/i.test(PREP_DETAIL));

// Pasaj katmanları ayrı gösterilir.
const PASSAGE_UI = read("app/aromaterapi/_components/read/PassageAccordionItem.tsx");
check("U pasaj katmanları ayrı (özgün/sadık çeviri/açıklama/yorum)",
  /Özgün Kaynak Metni/.test(PASSAGE_UI) &&
  /Sadık Çeviriler/.test(PASSAGE_UI) &&
  /Editoryal Açıklamalar/.test(PASSAGE_UI) &&
  /Editoryal Yorum/.test(PASSAGE_UI));
check("U sadık çeviri editoryalle fallback ETMEZ (boşsa dürüst not)",
  /çeviri girilmemiş/.test(PASSAGE_UI));

// Bilgi Kaydı detay "Değişiklik Geçmişi".
const BK_DETAIL = read("app/aromaterapi/bilgi-kayitlari/[id]/page.tsx");
check("U bilgi kaydı detayında Değişiklik Geçmişi var", /Değişiklik Geçmişi/.test(BK_DETAIL));
check("U detay create/update/delete butonu yok (C3D)",
  !/Yeni Bilgi Kaydı|Düzenle|Sil<\/button>|onDelete|handleDelete/.test(BK_DETAIL));

// Erişilebilirlik/responsive sözleşme (primitifler).
const PRIM = read("app/aromaterapi/_components/read/ReadPrimitives.tsx");
check("U 44px dokunma hedefi", /min-h-\[44px\]/.test(PRIM));
check("U focus-visible halkası", /focus-visible:ring/.test(PRIM));
check("U label↔input ilişkisi (htmlFor/useId)", /htmlFor=\{id\}/.test(PRIM) && /useId/.test(PRIM));

// ============================================================
console.log("\n[C3C-6] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l))
    .map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) {
  bad("S00 git status alınamadı", String(e));
}
const migChanges = changed.filter((f) => f.startsWith("supabase/migrations/"));
const sqlChanges = changed.filter((f) => f.endsWith(".sql"));
const c2sChanges = changed.filter((f) => f === "lib/aromaterapi/service/claimMutations.ts");
const deletePurge = changed.filter(
  (f) => f.startsWith("app/api/") && /delete|purge|bulk/i.test(f),
);
const allowedRoots = (f) =>
  f.startsWith("app/aromaterapi/") ||
  f.startsWith("app/api/aromaterapi/") ||
  f.startsWith("lib/aromaterapi/") ||
  f.startsWith("scripts/");
const outside = changed.filter((f) => !allowedRoots(f));

check("S01 migration değişikliği = 0", migChanges.length === 0, migChanges.join(","));
check("S02 SQL değişikliği = 0", sqlChanges.length === 0, sqlChanges.join(","));
check("S03 C2S/C2T RPC servisi (claimMutations.ts) değişmedi",
  c2sChanges.length === 0, c2sChanges.join(","));
check("S04 DELETE/purge/bulk backend eklenmedi", deletePurge.length === 0, deletePurge.join(","));
check("S05 değişen dosyalar aromaterapi kapsamında",
  outside.length === 0, outside.join(","));

// ============================================================
console.log(`\n──────────── C3C HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("Başarısızlar:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm C3C okuma sözleşme kontrolleri geçti.\n");
