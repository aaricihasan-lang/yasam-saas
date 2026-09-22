// ============================================================
// Aromaterapi — Satış Öncesi FAZ 2 statik sözleşme harness'i.
//
// SALT-OKUNUR / STATİK. Canlı DB'ye/Supabase'e bağlanmaz, mutation yapmaz.
// FAZ 2 değişikliklerinin (ARO-008 mecburi sürüm + ARO-010 rate-limit + N+1 batch)
// kilitli sözleşmelerini kaynak metni üzerinden doğrular.
// Herhangi bir FAIL → process.exit(1).
//   node scripts/aromaterapi-presale-faz2-harness.mjs
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
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
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

console.log("Aromaterapi — Satış Öncesi FAZ 2 harness'i\n");

// ============================================================
console.log("[ARO-008] blends/[id] PATCH — sürüm ARTIK ZORUNLU (400 AROMA_MISSING_VERSION)");
// ============================================================
const BID = read("app/api/aromaterapi/blends/[id]/route.ts");
const BIDCODE = stripComments(BID);
check("A01 expected_updated_at okunur", /expected_updated_at/.test(BIDCODE));
check("A02 eksik/boş sürüm → 400 AROMA_MISSING_VERSION",
  /AROMA_MISSING_VERSION/.test(BIDCODE) && /status:\s*400/.test(BIDCODE));
check("A03 sürüm kontrolü guard: if (!expectedUpdatedAt) erken 400",
  /if\s*\(\s*!expectedUpdatedAt\s*\)/.test(BIDCODE));
// Eksik-sürüm 400 dönüşü, koşullu güncelleme (.update/.eq updated_at) çağrısından ÖNCE olmalı.
const missIdx = BIDCODE.search(/AROMA_MISSING_VERSION/);
const updIdx = BIDCODE.search(/\.eq\(\s*["']updated_at["']/);
check("A04 400 AROMA_MISSING_VERSION, koşullu UPDATE'ten ÖNCE (sorgu öncesi reddedilir)",
  missIdx >= 0 && updIdx >= 0 && missIdx < updIdx, `miss=${missIdx} upd=${updIdx}`);
check("A05 iyimser kilit: .eq('updated_at', expected...) koşullu filtre", /\.eq\(\s*["']updated_at["']/.test(BIDCODE));
check("A06 çakışma → 409 AROMA_STALE_BLEND", /AROMA_STALE_BLEND/.test(BIDCODE) && /status:\s*409/.test(BIDCODE));
check("A07 kayıt yok → 404", /status:\s*404/.test(BIDCODE));
check("A08 tenant scope korunur (.eq('tenant_id', tenantId))", /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(BIDCODE));

// client blendData.updateBlend — sürüm yoksa fetch YAPMADAN erken döner
const BD = read("lib/aromaterapi/blendData.ts");
const BDCODE = stripComments(BD);
const upFn = BDCODE.match(/export async function updateBlend[\s\S]*?\n\}/);
const upBody = upFn ? upFn[0] : "";
check("A09 updateBlend gövdesi bulundu", upBody.length > 0);
check("A10 updateBlend: sürüm yoksa erken return (BLEND_MISSING_VERSION_MESSAGE)",
  /if\s*\(\s*!expectedUpdatedAt\s*\)\s*return[\s\S]*?BLEND_MISSING_VERSION_MESSAGE/.test(upBody));
const guardRetIdx = upBody.search(/if\s*\(\s*!expectedUpdatedAt\s*\)\s*return/);
const fetchIdx = upBody.search(/fetch\s*\(/);
check("A11 updateBlend: sürüm-guard, fetch çağrısından ÖNCE (API'ye gidilmez)",
  guardRetIdx >= 0 && fetchIdx >= 0 && guardRetIdx < fetchIdx, `guard=${guardRetIdx} fetch=${fetchIdx}`);
check("A12 updateBlend: PATCH gövdesine expected_updated_at eklenir", /expected_updated_at:\s*expectedUpdatedAt/.test(upBody));
check("A13 updateBlend: 409/stale surface eder", /stale:\s*true/.test(upBody));

// ============================================================
console.log("\n[ARO-010] Word-report rate-limit — 16 route, guard'dan SONRA");
// ============================================================
const WR = collectRoutes("app/api/aromaterapi").filter((r) => /word-report[\\/]route\.ts$/.test(r));
check("B00 word-report route sayısı = 16", WR.length === 16, `bulunan: ${WR.length}`);
const GATE_RE = /checkRateLimit\(\s*`aromaterapi-word:\$\{guard\.tenantId\}`\s*,\s*10\s*,\s*60_?000\s*\)/;
let gated = 0, afterGuard = 0, r429 = 0, retryHdr = 0, imported = 0;
for (const r of WR) {
  const src = read(r);
  if (GATE_RE.test(src)) gated++;
  if (/from\s+["']@\/lib\/rateLimit["']/.test(src)) imported++;
  const gi = src.search(/requireModuleAccess\(\s*req\s*,\s*["']aromatherapy["']/);
  const ri = src.search(/checkRateLimit\(\s*`aromaterapi-word:/);
  if (gi >= 0 && ri > gi) afterGuard++;
  if (/status:\s*429/.test(src)) r429++;
  if (/["']Retry-After["']/.test(src)) retryHdr++;
}
check("B01 16 route checkRateLimit(`aromaterapi-word:${guard.tenantId}`,10,60_000)", gated === 16, `${gated}/16`);
check("B02 16 route rateLimit import (@/lib/rateLimit)", imported === 16, `${imported}/16`);
check("B03 16 route gate guard'dan SONRA", afterGuard === 16, `${afterGuard}/16`);
check("B04 16 route 429 döner", r429 === 16, `${r429}/16`);
check("B05 16 route Retry-After header", retryHdr === 16, `${retryHdr}/16`);

// ============================================================
console.log("\n[ARO-010] N+1 TOPLU okuyucular — yeni batch export + tekil fonksiyonlar KORUNDU");
// ============================================================
const CLAIM = read("lib/aromaterapi/service/claimReads.ts");
const SRC = read("lib/aromaterapi/service/sourceReads.ts");
const METH = read("lib/aromaterapi/service/methodReads.ts");
const CAT = read("lib/aromaterapi/service/catalogReads.ts");

const batchExports = [
  ["claimReads.getKnowledgeRecordsByIds", CLAIM, /export async function getKnowledgeRecordsByIds/],
  ["sourceReads.getSourcesByIds", SRC, /export async function getSourcesByIds/],
  ["sourceReads.getPassagesBySourceIds", SRC, /export async function getPassagesBySourceIds/],
  ["methodReads.getMethodSeriesByIds", METH, /export async function getMethodSeriesByIds/],
  ["methodReads.getMethodRevisionsByIds", METH, /export async function getMethodRevisionsByIds/],
  ["catalogReads.getPlantTaxaByIds", CAT, /export async function getPlantTaxaByIds/],
  ["catalogReads.getPreparationsByIds", CAT, /export async function getPreparationsByIds/],
];
for (const [name, src, re] of batchExports) check(`C-batch ${name} export`, re.test(src));

const singleExports = [
  ["claimReads.getKnowledgeRecord (untouched)", CLAIM, /export async function getKnowledgeRecord\(/],
  ["sourceReads.getSource (untouched)", SRC, /export async function getSource\(/],
  ["sourceReads.getPassage (untouched)", SRC, /export async function getPassage\(/],
  ["methodReads.getMethodSeries (untouched)", METH, /export async function getMethodSeries\(/],
  ["methodReads.getMethodRevision (untouched)", METH, /export async function getMethodRevision\(/],
  ["catalogReads.getPlantTaxon (untouched)", CAT, /export async function getPlantTaxon\(/],
  ["catalogReads.getPreparation (untouched)", CAT, /export async function getPreparation\(/],
];
for (const [name, src, re] of singleExports) check(`C-single ${name}`, re.test(src));

// Her batch okuyucu tenant-scoped (.eq('tenant_id', tenantId)) içerir.
for (const [name, src] of [["claimReads", CLAIM], ["sourceReads", SRC], ["methodReads", METH], ["catalogReads", CAT]]) {
  check(`C-tenant ${name} batch bölümü .eq('tenant_id', tenantId)`, /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(src));
}

// resourceReads.ts batch okuyuculara rewire edildi; per-record mapBounded YOK.
const RR = read("lib/aromaterapi/report/resourceReads.ts");
const RRCODE = stripComments(RR);
check("D01 resourceReads getKnowledgeRecordsByIds import", /getKnowledgeRecordsByIds/.test(RRCODE));
check("D02 resourceReads getSourcesByIds + getPassagesBySourceIds import", /getSourcesByIds/.test(RRCODE) && /getPassagesBySourceIds/.test(RRCODE));
check("D03 resourceReads getMethodSeriesByIds + getMethodRevisionsByIds import", /getMethodSeriesByIds/.test(RRCODE) && /getMethodRevisionsByIds/.test(RRCODE));
check("D04 resourceReads getPlantTaxaByIds + getPreparationsByIds import", /getPlantTaxaByIds/.test(RRCODE) && /getPreparationsByIds/.test(RRCODE));
check("D05 resourceReads per-record mapBounded KULLANMAZ", !/mapBounded\s*\(/.test(RRCODE));

console.log(`\n──────────── ARO PRESALE FAZ 2 HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
