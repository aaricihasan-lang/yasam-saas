// ============================================================
// Aromaterapi — Satış Öncesi FAZ 1 (presale) statik güvenlik/sözleşme harness'i.
//
// SALT-OKUNUR / STATİK. Canlı DB'ye/Supabase'e bağlanmaz, mutation yapmaz.
// Kaynak metni üzerinden FAZ 1 düzeltmelerinin (ARO-001/026/027/003/004/008/010/
// 011/016/024/006) kilitli sözleşmelerini doğrular.
// Herhangi bir FAIL → process.exit(1).
//   node scripts/aromaterapi-presale-faz1-harness.mjs
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
};
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
const has = (p) => existsSync(resolve(ROOT, p));

// Yorumları (blok /* */ ve satır //) çıkar — "yalnız kodda" kontrolleri için.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// app/api/aromaterapi altındaki tüm route.ts dosyalarını topla.
function collectRoutes(dir) {
  const out = [];
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...collectRoutes(join(dir, name)));
    else if (name === "route.ts") out.push(join(dir, name));
  }
  return out;
}

console.log("Aromaterapi — Satış Öncesi FAZ 1 harness'i\n");

// ============================================================
console.log("[ARO-001] Modül-kapılı guard (requireModuleAccess) — tüm route'lar");
// ============================================================
const ROUTES = collectRoutes("app/api/aromaterapi");
// P1-D: +3 route (articles/route, articles/[id]/route, glossary/[id]/route) → 37→40.
check("A00 route.ts sayısı = 40", ROUTES.length === 40, `bulunan: ${ROUTES.length}`);
let guarded = 0, leaks = [];
for (const r of ROUTES) {
  const src = read(r);
  const code = stripComments(src);
  const hasGuard = /requireModuleAccess\(\s*req\s*,\s*["']aromatherapy["']/.test(code);
  if (hasGuard) guarded++;
  // Kodda (yorum hariç) doğrudan verifyUserRequest( çağrısı KALMAMALI.
  if (/verifyUserRequest\s*\(/.test(code)) leaks.push(r);
}
check("A01 tüm route'lar requireModuleAccess(req,'aromatherapy') ile kapılı",
  guarded === ROUTES.length, `kapılı: ${guarded}/${ROUTES.length}`);
check("A02 kodda (yorum hariç) verifyUserRequest( çağrısı YOK",
  leaks.length === 0, leaks.join(", "));

// ============================================================
console.log("\n[ARO-026/027] reference/route.ts — tenant izolasyonu (paylaşım YOK)");
// ============================================================
const REF = read("app/api/aromaterapi/reference/route.ts");
const REFCODE = stripComments(REF);
check("B01 reference/route.ts mevcut", REF.length > 0);
check("B02 .eq('tenant_id', ...) tenant-scope", /\.eq\(\s*["']tenant_id["']/.test(REFCODE));
check("B03 paylaşımlı 'is.null' branch YOK (kodda)", !/is\.null/.test(REFCODE));
check("B04 '.or(' tenant sharing YOK (kodda)", !/\.or\s*\(/.test(REFCODE));

// ============================================================
console.log("\n[ARO-003] oilFields.pickWritableOilFields — kısmi (PATCH) birleştirme");
// ============================================================
const OF = read("lib/aromaterapi/oilFields.ts");
check("C01 pickWritableOilFields partial opsiyonu",
  /pickWritableOilFields\([\s\S]*?opts\?:\s*\{\s*partial\?:\s*boolean\s*\}/.test(OF));
check("C02 kısmi modda yalnız gövdede olan anahtarlar (k in b guard)",
  /partial\s*&&\s*!\(\s*k in b\s*\)\)\s*continue/.test(OF));
const OILID = read("app/api/aromaterapi/oils/[id]/route.ts");
check("C03 oils/[id] PATCH pickWritableOilFields(..., { partial: true })",
  /pickWritableOilFields\([^)]*\{\s*partial:\s*true\s*\}\s*\)/.test(stripComments(OILID)));

// ============================================================
console.log("\n[ARO-004] Fotosensitivite üçlü durum (yes/no/unknown)");
// ============================================================
check("D01 PhotosensitivityStatus tipi export", /export type PhotosensitivityStatus\s*=/.test(OF));
check("D02 derivePhotosensitivity export", /export function derivePhotosensitivity/.test(OF));
check("D03 OIL_LIST_SELECT photosensitivity_status içerir",
  /OIL_LIST_SELECT[\s\S]*?photosensitivity_status/.test(OF));
const MIG0 = read("supabase/migrations/20270111000000_aromatherapy_oils_photosensitivity_status.sql");
check("D04 migration 20270111000000 mevcut", MIG0.length > 0);
check("D05 kolon DEFAULT 'unknown'", /DEFAULT\s+'unknown'/.test(MIG0));
check("D06 backfill true → 'yes'", /SET\s+photosensitivity_status\s*=\s*'yes'[\s\S]*?is_photosensitive\s*=\s*true/i.test(MIG0));
check("D07 blanket false → 'no' backfill YOK", !/SET\s+photosensitivity_status\s*=\s*'no'/i.test(MIG0));

// ============================================================
console.log("\n[ARO-008] blends/[id] PATCH — optimistic lock (409 AROMA_STALE_BLEND)");
// ============================================================
const BID = read("app/api/aromaterapi/blends/[id]/route.ts");
const BIDCODE = stripComments(BID);
check("E01 expected_updated_at okunur", /expected_updated_at/.test(BIDCODE));
check("E02 .eq('updated_at', ...) koşullu filtre", /\.eq\(\s*["']updated_at["']/.test(BIDCODE));
check("E03 AROMA_STALE_BLEND kodu", /AROMA_STALE_BLEND/.test(BIDCODE));
check("E04 status 409", /status:\s*409/.test(BIDCODE));
const BD = read("lib/aromaterapi/blendData.ts");
check("E05 updateBlend expected_updated_at gönderir", /export async function updateBlend[\s\S]*?expected_updated_at/.test(BD));
check("E06 updateBlend stale surface eder (return stale:true)", /stale:\s*true/.test(BD));

// ============================================================
console.log("\n[ARO-024] Taşıyıcı (carrier) yağ güvenliği");
// ============================================================
const MIG1 = read("supabase/migrations/20270111000100_aromatherapy_blends_carrier_safety.sql");
check("F01 migration 20270111000100 mevcut", MIG1.length > 0);
check("F02 carrier_photosensitivity_status kolonu", /carrier_photosensitivity_status/.test(MIG1));
check("F03 carrier_contraindications kolonu", /carrier_contraindications/.test(MIG1));
check("F04 carrier_safety_notes kolonu", /carrier_safety_notes/.test(MIG1));
check("F05 collectSafetyWarnings carrier argümanı alır",
  /export function collectSafetyWarnings\(\s*items:[\s\S]*?carrier\?:/.test(BD));
const RB = read("lib/aromaterapi/report/render/blends.ts");
check("F06 render/blends.ts carrier güvenliğine atıf", /carrier/.test(RB) && /Taşıyıcı/.test(RB));

// ============================================================
console.log("\n[ARO-010/011/016] Word-report — süre/gövde/all-cap/fail-closed");
// ============================================================
const WR = ROUTES.filter((r) => /word-report[\\/]route\.ts$/.test(r));
// Gövde-sınırı (ARO-011) YALNIZ POST-gövdesi okuyan liste route'larına uygulanır;
// tekil-kayıt ([id]/[seriesId]) word-report route'ları gövde OKUMAZ (id URL'den).
const WR_LIST = WR.filter((r) => !/\[/.test(r));
check("G00 word-report route sayısı = 16", WR.length === 16, `bulunan: ${WR.length}`);
check("G00b liste word-report route sayısı = 9", WR_LIST.length === 9, `bulunan: ${WR_LIST.length}`);
let wrMax = 0, wrTry = 0, wrBody = 0, wr413 = 0;
for (const r of WR) {
  const code = stripComments(read(r));
  if (/export const maxDuration/.test(code)) wrMax++;
  if (/try\s*\{/.test(code) && /catch/.test(code)) wrTry++;
}
for (const r of WR_LIST) {
  const code = stripComments(read(r));
  if (/readJsonBounded\(/.test(code)) wrBody++;
  if (/status:\s*413/.test(code)) wr413++;
}
check("G01 tüm word-report route maxDuration (ARO-010)", wrMax === WR.length, `${wrMax}/${WR.length}`);
check("G02 liste word-report readJsonBounded (ARO-011 gövde sınırı)", wrBody === WR_LIST.length, `${wrBody}/${WR_LIST.length}`);
check("G03 tüm word-report route try/catch fail-closed (ARO-016)", wrTry === WR.length, `${wrTry}/${WR.length}`);
check("G04 liste word-report 413 (gövde tavanı)", wr413 === WR_LIST.length, `${wr413}/${WR_LIST.length}`);
const BUILDERS = read("lib/aromaterapi/report/builders.ts");
check("G05 builders.ts mode=all cap MAX_EXPORT_ALL_RECORDS → 413 (ARO-010)",
  /MAX_EXPORT_ALL_RECORDS/.test(BUILDERS) && /status:\s*413/.test(BUILDERS));
const THEME = read("lib/aromaterapi/report/theme.ts");
check("G06 theme.ts MAX_EXPORT_ALL_RECORDS tanımlı", /export const MAX_EXPORT_ALL_RECORDS\s*=/.test(THEME));

// ============================================================
console.log("\n[ARO-006] 'Hedef' damla ≠ 'Yağların toplamı' (ayrı gösterim)");
// ============================================================
check("H01 render/blends.ts 'Hedef' etiketi", /Hedef/.test(RB));
check("H02 render/blends.ts 'Yağların toplamı' etiketi", /Yağların toplamı/.test(RB));
const PRINT = read("app/aromaterapi/karisim-olusturucu/_components/BlendRecetePrint.tsx");
check("H03 BlendRecetePrint mevcut", PRINT.length > 0);
check("H04 print 'Hedef' etiketi", /Hedef/.test(PRINT));
check("H05 print 'Yağların toplamı' + sumDrops", /Yağların toplamı/.test(PRINT) && /sumDrops/.test(PRINT));

// ============================================================
console.log(`\n──────────── ARO PRESALE FAZ 1 HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
