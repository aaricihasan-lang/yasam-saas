// ============================================================
// Aromaterapi C3D-B2B — Katalog + Üretim Yöntemi UI/UX harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz, SQL/RPC çalıştırmaz. C3D-B2B kilitli
// sözleşmesini repo içeriğinden doğrular: eksik method READ katmanı eklendi;
// istemci yazımı forbidden alan (tenant/actor/note_hash/canonical_name/status/id)
// GÖNDERMEZ; browser service_role yok; full-width varyantı backward-compatible;
// kapsam dışı (Oils/claims/glossary/Android/migration/package) DOKUNULMADI.
// FAIL → process.exit(1).
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
const ok = (n) => {
  pass++;
  console.log(`  PASS  ${n}`);
};
const bad = (n, d) => {
  fail++;
  failures.push(n);
  console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
};
const check = (n, c, d) => (c ? ok(n) : bad(n, d));
const read = (rel) => {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
};
/** Tek bir `type Name = ... };` bloğunu (ilk `};`e kadar) döndürür — blok-sınırlı denetim. */
const typeBlock = (src, name) => {
  const start = src.indexOf(`type ${name} =`);
  if (start < 0) return "";
  const end = src.indexOf("};", start);
  return end < 0 ? src.slice(start) : src.slice(start, end + 2);
};
/** Bir tip bloğunda yasak ALAN adı (satır-başı `ad:` / `ad?:`) var mı? */
const blockHasField = (block, fields) =>
  new RegExp(`(^|\\n)\\s*(${fields.join("|")})\\s*[?:]`).test(block);
const has = (rel) => existsSync(resolve(ROOT, rel));

// ── A) Method READ katmanı (B2A'da eksikti) ──
console.log("\n[B2B-A] Method read katmanı");
const reads = read("lib/aromaterapi/service/methodReads.ts");
check("A01 methodReads.ts mevcut", reads.length > 0);
check("A02 server-only", /^import\s+"server-only";/m.test(reads));
for (const fn of ["listMethodSeries", "getMethodSeries", "listMethodRevisions", "getMethodRevision", "preparationExists"]) {
  check(`A:${fn} export`, new RegExp(`export async function ${fn}\\b`).test(reads));
}
check("A03 tenant-scoped (.eq tenant_id)", /\.eq\("tenant_id",\s*tenantId\)/.test(reads));
check("A04 mutation YOK (rpc/insert/update/delete/upsert)", !/\.(rpc|insert|update|delete|upsert)\s*\(/.test(reads));

const routeSeries = read("app/api/aromaterapi/methods/[seriesId]/route.ts");
const routeMethods = read("app/api/aromaterapi/preparations/[id]/methods/route.ts");
const routeRevs = read("app/api/aromaterapi/methods/[seriesId]/revisions/route.ts");
const routeRev = read("app/api/aromaterapi/methods/[seriesId]/revisions/[revisionId]/route.ts");
check("A05 seri detay route GET", has("app/api/aromaterapi/methods/[seriesId]/route.ts") && /export async function GET\b/.test(routeSeries));
check("A06 preparat methods GET (seri listesi)", /export async function GET\b/.test(routeMethods));
check("A07 revisions GET (geçmiş)", /export async function GET\b/.test(routeRevs));
check("A08 revision detay GET", /export async function GET\b/.test(routeRev));
check("A09 GET'ler guard'lı (verifyUserRequest)", [routeSeries, routeMethods, routeRevs, routeRev].every((s) => /verifyUserRequest\(req\)/.test(s)));
check("A10 out-of-tenant 404 (readNotFound)", [routeSeries, routeRevs, routeRev].every((s) => /readNotFound\(\)/.test(s)));
check("A11 mevcut write POST/PATCH korundu", /export async function POST\b/.test(routeMethods) && /export async function PATCH\b/.test(routeRev));

// ── B) İstemci yazma/okuma güvenlik sözleşmesi ──
console.log("\n[B2B-B] İstemci yazma/okuma");
const cw = read("lib/aromaterapi/catalogWrite.ts");
const mw = read("lib/aromaterapi/methodWrite.ts");
const md = read("lib/aromaterapi/methodData.ts");
check("B01 catalogWrite server-only import ETMEZ", cw.length > 0 && !/from\s+"server-only"/.test(cw) && !/service\/catalog(Reads|MethodMutations|WriteHttp)/.test(cw));
check("B02 auth header x-user-id + x-session-token", /"x-user-id"/.test(cw) && /"x-session-token"/.test(cw));
check("B03 browser service_role YOK", !/service_role|SERVICE_ROLE/i.test(cw) && !/service_role|SERVICE_ROLE/i.test(mw) && !/service_role|SERVICE_ROLE/i.test(md));
// create body tipleri forbidden alan içermez (blok-sınırlı; Update/Transition tipleri status TAŞIYABİLİR)
const FORBIDDEN_CREATE = ["tenant_id", "actor", "actor_user_id", "note_hash", "canonical_name", "status", "id"];
const cptb = typeBlock(cw, "CreatePlantTaxonBody");
const cprb = typeBlock(cw, "CreatePreparationBody");
check("B04 CreatePlantTaxonBody tenant/actor/id/canonical/status YOK", cptb.length > 0 && !blockHasField(cptb, FORBIDDEN_CREATE));
check("B05 CreatePreparationBody tenant/actor/status YOK (taxon_id hariç)", cprb.length > 0 && !blockHasField(cprb, ["tenant_id", "actor", "note_hash", "canonical_name", "status"]));
// method yazımı: note_hash/tenant/actor/canonical/p_ HİÇ geçmez; target_status (geçiş hedefi) ALLOWED.
// Yorum satırları (sözleşmeyi AÇIKLAYAN docstring) hariç tutulur → yalnız GERÇEK kod denetlenir.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const mwCode = stripComments(mw);
check("B06 method yazımı note_hash/tenant/actor GÖNDERMEZ", mwCode.length > 0 && !/note_hash|tenant_id|actor|canonical_name|p_[a-z]/.test(mwCode));
check("B07 methodWrite ortak sonuç sözleşmesini reuse eder", /catalogWriteRequest/.test(mw));
check("B08 methodData yalnız GET (getDetail)", /getDetail/.test(md) && !/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(md));

// ── C) Türkçe etiketler ──
console.log("\n[B2B-C] Türkçe method etiketleri");
const labels = read("lib/aromaterapi/readLabels.ts");
check("C01 METHOD_KIND_TR", /faithful_source:\s*"Kaynağa Sadık Yöntem"/.test(labels) && /editorial:\s*"Editoryal Yöntem"/.test(labels) && /expert:\s*"Uzman Yöntemi"/.test(labels));
check("C02 MATERIAL_STATE_TR", /fresh:\s*"Taze"/.test(labels) && /dried:\s*"Kurutulmuş"/.test(labels) && /other:\s*"Diğer"/.test(labels));
check("C03 METHOD_STATUS_TR (archived var, approved yok)", /METHOD_STATUS_TR[\s\S]*?archived:\s*"Arşivlenmiş"/.test(labels) && !/METHOD_STATUS_TR[\s\S]*?approved:/.test(labels));

// ── D) Full-width form shell (backward compatible) ──
console.log("\n[B2B-D] Full-width form varyantı");
const shell = read("app/aromaterapi/_components/write/AromaterapiFormShell.tsx");
check("D01 wide prop opsiyonel", /wide\?:\s*boolean/.test(shell));
check("D02 varsayılan max-w-2xl korunur (backward compat)", /wide \? "max-w-4xl" : "max-w-2xl"/.test(shell));

// ── E) UI yüzeyi mevcut ──
console.log("\n[B2B-E] UI dosyaları");
const pages = [
  "app/aromaterapi/katalog/bitkiler/yeni/page.tsx",
  "app/aromaterapi/katalog/bitkiler/[id]/duzenle/page.tsx",
  "app/aromaterapi/katalog/preparatlar/yeni/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/duzenle/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/yontemler/yeni/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/yontemler/[seriesId]/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/yontemler/[seriesId]/yeni-revizyon/page.tsx",
];
for (const p of pages) check(`E:${p.split("/").slice(-2).join("/")} mevcut`, has(p));
const comps = [
  "PlantTaxonForm",
  "PreparationForm",
  "MethodSeriesForm",
  "MethodRevisionForm",
  "MethodStepsEditor",
  "MethodContentSections",
  "MethodStatusActions",
  "MethodSeriesDetail",
  "PreparationMethodList",
];
for (const c of comps) check(`E:${c} bileşeni mevcut`, has(`app/aromaterapi/katalog/_components/${c}.tsx`));

// ── F) UI davranış değişmezleri ──
console.log("\n[B2B-F] UI değişmezleri");
const steps = read("app/aromaterapi/katalog/_components/MethodStepsEditor.tsx");
check("F01 steps order deterministik (1..N yeniden atanır)", /order:\s*i \+ 1/.test(steps));
const prepForm = read("app/aromaterapi/katalog/_components/PreparationForm.tsx");
check("F02 identity-lock UI (yöntem varsa kilitli)", /identityLocked/.test(prepForm) && /disabled=\{isDemo \|\| identityLocked\}/.test(prepForm));
const seriesForm = read("app/aromaterapi/katalog/_components/MethodSeriesForm.tsx");
check("F03 faithful_source koşullu kaynak/pasaj", /isFaithful/.test(seriesForm) && /fetchSourcePassageList/.test(seriesForm));
const detailPage = read("app/aromaterapi/katalog/preparatlar/[id]/page.tsx");
check("F04 preparat detayı placeholder yerine gerçek yöntem bölümü", /PreparationMethodList/.test(detailPage) && !/SchemaGapNote/.test(detailPage));
const katalog = read("app/aromaterapi/katalog/_components/KatalogView.tsx");
check("F05 KatalogView Yeni CTA (bitki+preparat)", /bitkiler\/yeni/.test(katalog) && /preparatlar\/yeni/.test(katalog));
const seriesDetail = read("app/aromaterapi/katalog/_components/MethodSeriesDetail.tsx");
check("F06 series 'düzenle' değil 'Yeni Revizyon'", /Yeni Revizyon/.test(seriesDetail) && /yeni-revizyon/.test(seriesDetail));
check("F07 demo read-only (isDemo gate formlarda)", [prepForm, seriesForm].every((s) => /isDemo/.test(s)));

// ── G) Kapsam guard ──
console.log("\n[B2B-G] Kapsam / forbidden-path");
let changed = [];
try {
  // Fork-point (merge-base) ile karşılaştır: origin/main sonradan ilerlemiş olabilir
  // (ör. paralel YH BF-12B). Yalnız BU branch'in değişiklikleri sayılır.
  let base = "";
  try {
    base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    /* yok */
  }
  if (!base) base = "origin/main";
  changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  /* karşılaştırma tabanı yoksa boş */
}
const allowed =
  /^(app\/aromaterapi\/katalog\/|app\/aromaterapi\/_components\/write\/AromaterapiFormShell\.tsx$|app\/api\/aromaterapi\/methods\/|app\/api\/aromaterapi\/preparations\/\[id\]\/methods\/route\.ts$|lib\/aromaterapi\/|scripts\/aromaterapi-c3d-b2b-ui-harness\.mjs$)/;
const forbidden = /(oils|glossary|android|supabase\/migrations\/|package\.json|package-lock|pnpm-lock|yarn\.lock)/i;
const outOfScope = changed.filter((f) => !allowed.test(f));
const forbiddenHits = changed.filter((f) => forbidden.test(f));
check("G01 kapsam dışı dosya = 0", outOfScope.length === 0, outOfScope.join(", "));
check("G02 forbidden path (oils/glossary/android/migration/package) = 0", forbiddenHits.length === 0, forbiddenHits.join(", "));
check("G03 yeni migration YOK", !changed.some((f) => /supabase\/migrations\//.test(f)));
check("G04 claims yazma motoru DEĞİŞMEDİ", !changed.some((f) => /aromaterapi\/(claims|bilgi-kayitlari)\//.test(f) || /claim(Mutations|Write|Data)\.ts$/.test(f)));
check("G05 method WRITE mutation servisi DEĞİŞMEDİ (B2A kilidi)", !changed.some((f) => /catalogMethodMutations\.ts$|methodCanonical\.ts$|catalogWriteHttp\.ts$/.test(f)));

// ── Özet ──
const total = pass + fail;
console.log(`\n──────────── C3D-B2B UI HARNESS: ${pass} PASS / ${fail} FAIL (${total}) ────────────`);
if (fail > 0) {
  console.log("Başarısız kontroller:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm C3D-B2B UI/UX sözleşme kontrolleri geçti.");
