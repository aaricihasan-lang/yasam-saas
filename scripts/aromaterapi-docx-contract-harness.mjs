// ============================================================
// Aromaterapi FAZ Word — güvenlik/sözleşme statik harness'i (SALT-OKUNUR).
// Route auth, tenant-safety, cap, filename, reuse, chunked-all sözleşmelerini doğrular.
// FAIL → exit 1.  node scripts/aromaterapi-docx-contract-harness.mjs
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0; const failures = [];
const check = (n, c, d) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); } };
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
const has = (p) => existsSync(resolve(ROOT, p));

console.log("Aromaterapi FAZ Word — güvenlik/sözleşme harness'i\n");

const ROUTES = [
  "app/api/aromaterapi/oils/[id]/word-report/route.ts",
  "app/api/aromaterapi/oils/word-report/route.ts",
  "app/api/aromaterapi/blends/[id]/word-report/route.ts",
  "app/api/aromaterapi/blends/word-report/route.ts",
  "app/api/aromaterapi/plant-taxa/[id]/word-report/route.ts",
  "app/api/aromaterapi/plant-taxa/word-report/route.ts",
  "app/api/aromaterapi/preparations/[id]/word-report/route.ts",
  "app/api/aromaterapi/preparations/word-report/route.ts",
  "app/api/aromaterapi/methods/[seriesId]/word-report/route.ts",
  "app/api/aromaterapi/methods/word-report/route.ts",
  "app/api/aromaterapi/claims/[id]/word-report/route.ts",
  "app/api/aromaterapi/claims/word-report/route.ts",
  "app/api/aromaterapi/sources/[id]/word-report/route.ts",
  "app/api/aromaterapi/sources/word-report/route.ts",
  "app/api/aromaterapi/glossary/word-report/route.ts",
  "app/api/aromaterapi/word-report/route.ts",
];
for (const r of ROUTES) {
  const src = read(r);
  check(`Route mevcut: ${r.split("/").slice(-2).join("/")}`, src.length > 0);
  check(`  → verifyUserRequest guard (server-derived tenant)`, /verifyUserRequest\(req\)/.test(src) && /guard\.ok/.test(src));
  check(`  → runtime nodejs`, /runtime = "nodejs"/.test(src));
  check(`  → body tenant/user GÜVENİLMEZ (body.tenant_id/user_id OKUNMAZ)`, !/body\.(tenant_id|tenantId|user_id|userId)/.test(src));
  check(`  → docxResponse (attachment)`, /docxResponse\(/.test(src));
}
// list route'larda body-size cap (tek-kayıt [param] route'ları hariç)
for (const r of ROUTES.filter((r) => !/\[\w+\]/.test(r))) {
  check(`Body-size cap (413): ${r.split("/").slice(-2).join("/")}`, /content-length/.test(read(r)) && /413/.test(read(r)) && /MAX_EXPORT_BODY_BYTES/.test(read(r)));
}

// request.ts — cap + UUID + mode + filename response
const REQ = read("lib/aromaterapi/report/request.ts");
check("parseExportBody mode allowlist (selected|all)", /mode !== "selected" && mode !== "all"/.test(REQ));
check("selected ID cap (MAX_SELECTED_IDS)", /raw\.length > MAX_SELECTED_IDS/.test(REQ));
check("selected ids UUID doğrulaması", /UUID_RE\.test\(v\)/.test(REQ));
check("all mode cap'e TABİ DEĞİL (ids yalnız selected'da)", /if \(mode === "selected"\)/.test(REQ));
check("docxResponse filename sanitize + attachment", /replace\(\/\[\^A-Za-z0-9\._-\]\/g, "_"\)/.test(REQ) && /attachment; filename=/.test(REQ));

// theme.ts — slug + cap sabitleri
const THEME = read("lib/aromaterapi/report/theme.ts");
check("slugifyTr filesystem-safe ([^A-Za-z0-9]→_)", /\[\^A-Za-z0-9\]\+/.test(THEME));
check("MAX_SELECTED_IDS + EXPORT_READ_CHUNK tanımlı", /MAX_SELECTED_IDS = 500/.test(THEME) && /EXPORT_READ_CHUNK/.test(THEME));

// reads.ts — tenant scope + is_active + selected .in + chunked all
const READS = read("lib/aromaterapi/report/reads.ts");
check("reads tenant-scope DAİMA (.eq tenant_id)", /\.eq\("tenant_id", tenantId\)/.test(READS));
check("reads soft-deleted HARİÇ (.eq is_active true)", /\.eq\("is_active", true\)/.test(READS));
check("selected → .in('id', ids) (tenant-scope üstünde, IDOR-safe)", /\.in\("id", sel\.ids\)/.test(READS));
check("all → CHUNK'lı range (sessiz kesme YOK)", /\.range\(from, from \+ EXPORT_READ_CHUNK - 1\)/.test(READS) && /break/.test(READS));
check("tekil okuma IDOR-safe (.eq tenant_id .eq id maybeSingle)", /\.eq\("tenant_id", tenantId\)\.eq\("id", id\)[\s\S]*?maybeSingle/.test(READS));

// reuse — yeni DOCX framework YOK (yalnız reportHelpers + docx)
const DOC = read("lib/aromaterapi/report/document.ts");
check("reportHelpers reuse (buildPremiumCover/buildTOCPage/buildFooter)", /buildPremiumCover|buildTOCPage/.test(DOC) && /buildFooter/.test(DOC));
check("ikinci DOCX framework YOK (yalnız 'docx' + reportHelpers import)", /from "docx"/.test(DOC) && /reportHelpers/.test(DOC) && !/officegen|html-docx|docx-templates/.test(DOC));

// reportHelpers additive — hyperlink/DOI/bullet/repeating-header/running-header
const RH = read("lib/docx/reportHelpers.ts");
check("reportHelpers additive: isSafeUrl (http/https only)", /export function isSafeUrl/.test(RH) && /\^https\?:\\\/\\\//.test(RH));
check("reportHelpers additive: linkField + doiField + bulletList + repeatingHeaderTable + buildHeader",
  /export function linkField/.test(RH) && /export function doiField/.test(RH) && /export function bulletList/.test(RH) && /export function repeatingHeaderTable/.test(RH) && /export function buildHeader/.test(RH));

// client bundle sızıntısı — builders/reads yalnız server route'larda; client component import etmez
import { execSync } from "node:child_process";
let clientLeak = "";
try {
  clientLeak = execSync(`grep -rl "report/builders\\|report/reads" ${resolve(ROOT, "app")} --include=*.tsx 2>/dev/null || true`, { encoding: "utf8" });
} catch { clientLeak = ""; }
check("builders/reads client component'e sızmaz (yalnız route.ts)", !/\.tsx/.test(clientLeak), clientLeak.trim());

check("DOCX acceptance harness dosyası mevcut", has("scripts/aromaterapi-docx-harness.ts"));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
console.log("OVERALL = PASS");
