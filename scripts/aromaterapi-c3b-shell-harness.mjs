// ============================================================
// Aromaterapi C3B — Görsel modül kabuğu sözleşme harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB/Supabase'e bağlanmaz, mutation yapmaz.
// C3A'da kilitlenen 7-bölüm mimarisini, registry-güdümlü navigasyon/kart
// yapısını ve C3B kapsam sınırlarını (API/migration/SQL/C2T değişmez) doğrular.
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

function read(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) { bad(`dosya var: ${rel}`); return ""; }
  return readFileSync(p, "utf8");
}
function fileExists(rel) { return existsSync(resolve(ROOT, rel)); }

// ------------------------------------------------------------
const REG = read("lib/aromaterapi/aromaterapiModules.ts");
const ACCENT = read("lib/aromaterapi/aromaterapiAccent.ts");
const NAV = read("app/aromaterapi/_components/AromaterapiModuleNav.tsx");
const SHELL = read("app/aromaterapi/_components/AromaterapiSectionShell.tsx");
const CARD = read("app/aromaterapi/_components/AromaterapiModuleCard.tsx");
const HUB = read("app/aromaterapi/page.tsx");

// Registry içindeki AROMATERAPI_MODULES dizisini ayrıştır.
function extractModulesArray(src) {
  const marker = "AROMATERAPI_MODULES: AromaterapiModule[] = [";
  const start = src.indexOf(marker);
  if (start < 0) return [];
  // marker "["  ile biter; dizinin açılış köşeli parantezine sabitlen
  // (AromaterapiModule[] içindeki "[]" ile karışmasın).
  const from = start + marker.length - 1;
  // Basit denge sayacı ile kapanış "]" bul.
  let depth = 0, end = -1;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  const body = src.slice(from + 1, end);
  // Üst düzey nesneleri "id:" başlangıçlarına göre böl.
  const blocks = [];
  const idRe = /\bid:\s*"([^"]+)"/g;
  let m;
  const idxs = [];
  while ((m = idRe.exec(body))) idxs.push({ i: m.index, id: m[1] });
  for (let k = 0; k < idxs.length; k++) {
    const s = idxs[k].i;
    const e = k + 1 < idxs.length ? idxs[k + 1].i : body.length;
    const chunk = body.slice(s, e);
    const label = (chunk.match(/\blabel:\s*"([^"]+)"/) || [])[1] ?? "";
    const href = (chunk.match(/\bhref:\s*"([^"]+)"/) || [])[1] ?? "";
    const status = (chunk.match(/\bstatus:\s*"([^"]+)"/) || [])[1] ?? "";
    blocks.push({ id: idxs[k].id, label, href, status });
  }
  return blocks;
}

const modules = extractModulesArray(REG);
const ids = modules.map((m) => m.id);
const labels = modules.map((m) => m.label);
const hrefs = modules.map((m) => m.href);

const EXPECTED = [
  { id: "ana-ekran", label: "Ana Ekran", href: "/aromaterapi" },
  { id: "yaglar", label: "Yağlar", href: "/aromaterapi/yaglar" },
  { id: "karisimlar", label: "Karışımlar", href: "/aromaterapi/karisim-olusturucu" },
  { id: "bilgi-kayitlari", label: "Bilgi Kayıtları", href: "/aromaterapi/bilgi-kayitlari" },
  { id: "kaynaklar", label: "Kaynaklar", href: "/aromaterapi/kaynaklar" },
  { id: "katalog", label: "Bitki & Preparat Kataloğu", href: "/aromaterapi/katalog" },
  { id: "bilgi-bankasi", label: "Bilgi Bankası & Sözlük", href: "/aromaterapi/bilgi-bankasi" },
];

function uniq(arr) { return new Set(arr).size === arr.length; }

// ============================================================
console.log("\n[C3B-1] Registry — yedi birincil bölüm");
// ============================================================
check("R01 registry ayrıştırıldı", modules.length > 0, "AROMATERAPI_MODULES bulunamadı");
check("R02 exact 7 bölüm", modules.length === 7, `bulunan: ${modules.length}`);
check("R03 id değerleri benzersiz", uniq(ids), ids.join(","));
check("R04 label değerleri benzersiz", uniq(labels), labels.join(","));
check("R05 href değerleri benzersiz", uniq(hrefs), hrefs.join(","));
for (const e of EXPECTED) {
  const mod = modules.find((m) => m.id === e.id);
  check(`R06 bölüm mevcut: ${e.id}`, !!mod);
  if (mod) {
    check(`R07 label doğru: ${e.id} = "${e.label}"`, mod.label === e.label, `bulunan: "${mod.label}"`);
    check(`R08 href doğru: ${e.id} = ${e.href}`, mod.href === e.href, `bulunan: ${mod.href}`);
  }
}
check("R09 tam olarak beklenen 7 href kümesi",
  hrefs.length === EXPECTED.length && EXPECTED.every((e) => hrefs.includes(e.href)),
  hrefs.join(","));

// ============================================================
console.log("\n[C3B-2] Kullanıcı terminolojisi");
// ============================================================
check("T01 claim adı 'Bilgi Kayıtları'",
  modules.some((m) => m.id === "bilgi-kayitlari" && m.label === "Bilgi Kayıtları"));
check("T02 menü etiketlerinde 'claim' teknik dili YOK",
  labels.every((l) => !/claim/i.test(l)), labels.join(","));
check("T03 menü etiketlerinde RPC/migration teknik dili YOK",
  labels.every((l) => !/\b(rpc|migration|sql)\b/i.test(l)));

// ============================================================
console.log("\n[C3B-3] Mevcut route'lar korunmuş");
// ============================================================
check("P01 Yağlar liste (yaglar) route", fileExists("app/aromaterapi/yaglar/page.tsx"));
check("P02 facet: ucucu-yaglar", fileExists("app/aromaterapi/ucucu-yaglar/page.tsx"));
check("P03 facet: sabit-yaglar", fileExists("app/aromaterapi/sabit-yaglar/page.tsx"));
check("P04 facet: maserasyon-yaglari", fileExists("app/aromaterapi/maserasyon-yaglari/page.tsx"));
check("P05 dinamik yağ detay [id]", fileExists("app/aromaterapi/yaglar/[id]/page.tsx"));
check("P06 Karışım Oluşturucu", fileExists("app/aromaterapi/karisim-olusturucu/page.tsx"));
check("P07 Bilgi Bankası", fileExists("app/aromaterapi/bilgi-bankasi/page.tsx"));

// ============================================================
console.log("\n[C3B-4] Yeni bölüm route'ları + iskeletler");
// ============================================================
check("N01 Bilgi Kayıtları route", fileExists("app/aromaterapi/bilgi-kayitlari/page.tsx"));
check("N02 Kaynaklar route", fileExists("app/aromaterapi/kaynaklar/page.tsx"));
check("N03 Katalog route", fileExists("app/aromaterapi/katalog/page.tsx"));
check("N04 Bilgi Kayıtları loading", fileExists("app/aromaterapi/bilgi-kayitlari/loading.tsx"));
check("N05 Kaynaklar loading", fileExists("app/aromaterapi/kaynaklar/loading.tsx"));
check("N06 Katalog loading", fileExists("app/aromaterapi/katalog/loading.tsx"));

const NEW_PAGES = [
  read("app/aromaterapi/bilgi-kayitlari/page.tsx"),
  read("app/aromaterapi/kaynaklar/page.tsx"),
  read("app/aromaterapi/katalog/page.tsx"),
];
NEW_PAGES.forEach((src, i) => {
  const name = ["bilgi-kayitlari", "kaynaklar", "katalog"][i];
  check(`N07 ${name}: SectionShell kullanır`, src.includes("AromaterapiSectionShell"));
  check(`N08 ${name}: API/fetch çağrısı YOK`, !/\bfetch\s*\(|supabase|\.rpc\(/.test(src));
  check(`N09 ${name}: sahte canonical veri YOK`,
    !/mock|fixture|sampleClaim|dummyClaim/i.test(src));
  check(`N10 ${name}: kullanıcıya 'claim/RPC/migration' teknik dili YOK`,
    !/\bclaim\b|\brpc\b|migration/i.test(src));
});

// ============================================================
console.log("\n[C3B-5] Registry-güdümlü navigasyon ve kartlar");
// ============================================================
check("G01 hub kartları registry'den (AROMATERAPI_HUB_MODULES)",
  HUB.includes("AROMATERAPI_HUB_MODULES") && HUB.includes("AromaterapiModuleCard"));
check("G02 hub .map ile kart üretir (hard-code YOK)",
  /AROMATERAPI_HUB_MODULES\.map/.test(HUB));
check("G03 navigasyon registry'den (AROMATERAPI_NAV_MODULES)",
  NAV.includes("AROMATERAPI_NAV_MODULES"));
check("G04 nav .map ile pill üretir",
  /AROMATERAPI_NAV_MODULES\.map/.test(NAV));
check("G05 nav aria-current ile aktif bölüm",
  NAV.includes('aria-current'));
check("G06 nav min-h-[44px] dokunma hedefi", NAV.includes("min-h-[44px]"));
check("G07 shell breadcrumb + nav içerir",
  SHELL.includes("AromaterapiBreadcrumb") && SHELL.includes("AromaterapiModuleNav"));

// ============================================================
console.log("\n[C3B-6] Admin/uzman ayrımı YOK (eşit modül)");
// ============================================================
const SHELL_LAYER = REG + NAV + SHELL + CARD;
check("E01 registry/nav/shell rol/admin dallanması YOK",
  !/\bisAdmin\b|verifyAdmin|requireAdmin|is_admin\b/.test(SHELL_LAYER));
check("E02 tek AROMATERAPI_MODULES tanımı (ikinci hard-coded liste yok)",
  (REG.match(/AROMATERAPI_MODULES\s*:/g) || []).length === 1);
check("E03 accent buton sistemi kurmaz (.btn-* global korunur)",
  !/\.btn-[a-z]+\s*\{/.test(ACCENT));

// ============================================================
console.log("\n[C3B-7] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    // "old -> new" rename biçimini ele al
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l))
    .map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) {
  bad("S00 git status alınamadı", String(e));
}

const apiChanges = changed.filter((f) => f.startsWith("app/api/"));
const migChanges = changed.filter((f) => f.startsWith("supabase/migrations/"));
const sqlChanges = changed.filter((f) => f.endsWith(".sql"));
const C2T_FILES = [
  "lib/aromaterapi/service/claimMutations.ts",
  "app/api/aromaterapi/claims/route.ts",
  "app/api/aromaterapi/claims/[id]/route.ts",
];
const c2tChanges = changed.filter((f) => C2T_FILES.includes(f));
const deleteBackend = changed.filter(
  (f) => f.startsWith("app/api/") && /delete|purge/i.test(f),
);

check("S01 API route değişikliği = 0", apiChanges.length === 0, apiChanges.join(","));
check("S02 migration değişikliği = 0", migChanges.length === 0, migChanges.join(","));
check("S03 SQL değişikliği = 0", sqlChanges.length === 0, sqlChanges.join(","));
check("S04 C2T mutation dosyaları değişmedi = 0", c2tChanges.length === 0, c2tChanges.join(","));
check("S05 DELETE/RPC backend eklenmedi", deleteBackend.length === 0, deleteBackend.join(","));
check("S06 değişen dosyalar app/aromaterapi + lib/aromaterapi + scripts ile sınırlı",
  changed.every((f) =>
    f.startsWith("app/aromaterapi/") ||
    f.startsWith("lib/aromaterapi/") ||
    f.startsWith("scripts/"),
  ),
  changed.filter((f) =>
    !(f.startsWith("app/aromaterapi/") || f.startsWith("lib/aromaterapi/") || f.startsWith("scripts/")),
  ).join(","));

// ============================================================
console.log(`\n──────────── C3B HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("Başarısızlar:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm C3B sözleşme kontrolleri geçti.\n");
