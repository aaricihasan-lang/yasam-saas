// ============================================================
// YEBS API-A0U — Traditions audit'li UPDATE (PATCH) STATİK SÖZLEŞME harness'i
//
// STATİK KAYNAK-SÖZLEŞMESİ doğrulayıcısı. Gerçek runtime davranışını TEK BAŞINA
// kanıtlamaz. Canlı bölüm yalnız YAZMA YAPMAYAN negatiftir (auth eksik → 401);
// harness hiçbir admin auth header'ı göndermez → başarılı PATCH/DB-write imkânsız.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const P = {
  detail: resolve(ROOT, "app/api/admin/yebs/traditions/[id]/route.ts"),
  mut: resolve(ROOT, "lib/yebs/service/traditionMutations.ts"),
};
const D1_D9 = [
  "20260726210017_yebs_traditions.sql", "20260726220031_yebs_schools.sql",
  "20260726230043_yebs_concepts.sql", "20260727000000_yebs_concept_labels.sql",
  "20260728000000_yebs_sources.sql", "20260729000000_yebs_claims.sql",
  "20260730000000_yebs_claim_sources.sql", "20260731000000_yebs_concept_relations.sql",
  "20260801000000_yebs_concept_relation_sources.sql",
];

let pass = 0, fail = 0, skip = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function skipped(n, w) { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

console.log("\n[A0U-API] Traditions audit'li UPDATE (PATCH) — statik sözleşme");

let detail = "", mut = "";
try {
  detail = readFileSync(P.detail, "utf8");
  mut = readFileSync(P.mut, "utf8");
  ok("kaynak dosyaları okunabildi (detail route + mutation service)");
} catch (e) {
  bad("kaynak dosyaları okunamadı", String(e && e.message));
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
  process.exit(1);
}
const detailCode = stripComments(detail);
const mutCode = stripComments(mut);
const patchIdx = detailCode.indexOf("export async function PATCH");
const patchBlock = patchIdx === -1 ? "" : detailCode.slice(patchIdx);

// --- Export sözleşmesi ---
check("1. detail GET korunuyor", /export\s+async\s+function\s+GET\s*\(/.test(detail));
check("2. detail PATCH export mevcut", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
for (const verb of ["POST", "PUT", "DELETE"]) {
  check(`3. detail ${verb} export YOK`, !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(detail));
}

// --- Guard / actor / id ---
check("4. PATCH verifyAdminRequest ile başlıyor", /verifyAdminRequest\s*\(\s*req\s*\)/.test(patchBlock));
check("5. guard.response erken dönüyor", /if\s*\(\s*!guard\.ok\s*\)\s*return\s+guard\.response/.test(patchBlock));
check("6. guard.db kullanılıyor", /const\s*\{\s*adminId\s*,\s*db\s*\}\s*=\s*guard/.test(patchBlock));
check("7. actor guard.adminId (updateTradition'a ayrı geçiliyor)", /updateTradition\s*\(\s*db\s*,\s*adminId\s*,\s*id\s*,/.test(patchBlock));
check("8. ID yalnız URL'den (ctx.params + UUID_RE)", /const\s*\{\s*id\s*\}\s*=\s*await\s+ctx\.params/.test(patchBlock) && /UUID_RE\.test\(id\)/.test(patchBlock));
check("9. request/operation UUID server-side (service)", /const\s+requestId\s*=\s*crypto\.randomUUID\(\)/.test(mutCode) && /const\s+operationId\s*=\s*crypto\.randomUUID\(\)/.test(mutCode));
check("9b. route body'den request/operation ID okumuyor", !/randomUUID/.test(patchBlock) && !/request_id|operation_id|requestId|operationId/.test(patchBlock));

// --- Body allowlist ---
check("10. exact 8 body key (PATCH_ALLOWED_KEYS)",
  /PATCH_ALLOWED_KEYS\s*=\s*\[[\s\S]*?"expected_updated_at"[\s\S]*?"reason"[\s\S]*?"slug"[\s\S]*?"name_tr"[\s\S]*?"tradition_type"[\s\S]*?"native_name"[\s\S]*?"native_language_tag"[\s\S]*?"native_script_code"[\s\S]*?\]/.test(detail));
check("11. unknown key → 400 (allowed.has değilse invalidUpdateBody)",
  /for\s*\(\s*const\s+key\s+of\s+Object\.keys\(\s*obj\s*\)\s*\)\s*\{\s*if\s*\(\s*!allowed\.has\(\s*key\s*\)\s*\)\s*return\s+invalidUpdateBody\(\)/.test(patchBlock));
const forbidden = ["status", "id", "actorId", "actor_id", "actorAdminId", "actor_admin_id", "adminId", "admin_id",
  "created_at", "updated_at", "requestId", "request_id", "operationId", "operation_id", "outcome", "action",
  "entityType", "entity_id", "published", "approved", "verified", "actor_label_snapshot", "__proto__", "prototype", "constructor"];
const allowedArr = detail.match(/PATCH_ALLOWED_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
check("12. yasak actor/id/status/timestamp/request/operation alanları allowed'da YOK",
  allowedArr.length > 0 && forbidden.every((k) => !new RegExp(`["']${k}["']`).test(allowedArr)));
check("12b. invalidUpdateBody 400 + YEBS_INVALID_REQUEST_BODY",
  /function\s+invalidUpdateBody\s*\(\s*\)\s*:\s*Response\s*\{[\s\S]*?YEBS_INVALID_REQUEST_BODY[\s\S]*?status:\s*400/.test(detail));

// --- Plain object / tip ---
check("13. malformed JSON → 400 (try/catch → invalidUpdateBody)", /try\s*\{\s*body\s*=\s*await\s+req\.json\(\)\s*;?\s*\}\s*catch\s*\{\s*return\s+invalidUpdateBody\(\)/.test(patchBlock));
check("14. null/array/non-object → 400", /body\s*===\s*null\s*\|\|\s*typeof\s+body\s*!==\s*"object"\s*\|\|\s*Array\.isArray\(\s*body\s*\)/.test(patchBlock));

// --- reason / expected_updated_at ---
check("15. reason zorunlu (string + trim-boş değil + <=2000)",
  /typeof\s+reason\s*!==\s*"string"\s*\|\|\s*reason\.trim\(\)\s*===\s*""\s*\|\|\s*reason\.length\s*>\s*REASON_MAX_LEN/.test(patchBlock));
check("16. expected_updated_at zorunlu (isValidExpectedUpdatedAt çağrısı)",
  /typeof\s+expectedUpdatedAt\s*!==\s*"string"\s*\|\|\s*!isValidExpectedUpdatedAt\(expectedUpdatedAt\)/.test(patchBlock));
check("16b. strict tz'li regex (Z veya ±HH:mm zorunlu, yakalama gruplu)",
  /Z\|\[\+\-\]\\d\{2\}:\\d\{2\}/.test(detail));

// --- STRICT takvim doğrulaması (statik): yalnız regex+Date.parse yetmez ---
check("16c. strict validator fonksiyonu mevcut (isValidExpectedUpdatedAt)",
  /function\s+isValidExpectedUpdatedAt\s*\(\s*value\s*:\s*string\s*\)\s*:\s*boolean/.test(detail));
check("16d. yalnız regex+Date.parse yeterli DEĞİL (takvim bileşenleri denetleniyor)",
  /month\s*<\s*1\s*\|\|\s*month\s*>\s*12/.test(detail) && /day\s*<\s*1\s*\|\|\s*day\s*>\s*daysInMonth/.test(detail));
check("16e. ay aralığı (01–12)", /month\s*<\s*1\s*\|\|\s*month\s*>\s*12/.test(detail));
check("16f. ayın gerçek gün sayısı (daysInMonth tablosu, artık-yıl duyarlı)",
  /daysInMonth\s*=\s*\[\s*31\s*,\s*isLeap\s*\?\s*29\s*:\s*28/.test(detail) && /day\s*>\s*daysInMonth\[month\s*-\s*1\]/.test(detail));
check("16g. artık yıl kuralı (4 / 100 / 400)",
  /\(\s*year\s*%\s*4\s*===\s*0\s*&&\s*year\s*%\s*100\s*!==\s*0\s*\)\s*\|\|\s*year\s*%\s*400\s*===\s*0/.test(detail));
check("16h. saat/dakika/saniye sınırları (23/59/59)",
  /hour\s*>\s*23/.test(detail) && /minute\s*>\s*59/.test(detail) && /second\s*>\s*59/.test(detail));
check("16i. yıl 0000 reddediliyor", /year\s*===\s*0/.test(detail));
check("16j. tz offset saat/dakika sınırı", /offsetHour\s*>\s*23\s*\|\|\s*offsetMinute\s*>\s*59/.test(detail));
check("16k. nihai Number.isFinite(Date.parse(...))", /Number\.isFinite\(Date\.parse\(value\)\)/.test(detail));

// --- DAVRANIŞSAL: route'un GERÇEK validator'ını çıkar (server-only import etmeden)
//     ve örnek vektörlere karşı çalıştır. Saf fonksiyon; Number/RegExp/Date.parse. ---
function extractValidator(src) {
  const reMatch = src.match(/const EXPECTED_UPDATED_AT_RE\s*=\s*\/[^\n]*\/;/);
  const fnStart = src.indexOf("function isValidExpectedUpdatedAt");
  if (!reMatch || fnStart === -1) return null;
  const open = src.indexOf("{", fnStart);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  const fn = src.slice(fnStart, end + 1).replace("(value: string): boolean", "(value)");
  return `${reMatch[0]}\n${fn}\nreturn isValidExpectedUpdatedAt(__v);`;
}
const validatorSrc = extractValidator(detail);
if (!validatorSrc) {
  bad("16l. route validator çıkarılabildi (davranışsal test için)");
} else {
  let runner = null;
  try { runner = new Function("__v", validatorSrc); } catch { runner = null; }
  if (!runner) {
    bad("16l. route validator derlenebildi");
  } else {
    ok("16l. route validator çıkarıldı+derlendi (davranışsal)");
    const INVALID = [
      "2026-02-29T10:00:00Z", "2026-02-31T10:00:00Z", "2026-04-31T10:00:00Z",
      "2026-13-01T10:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T10:60:00Z",
      "2026-01-01T10:00:60Z", "0000-01-01T10:00:00Z",
    ];
    const VALID = [
      "2028-02-29T10:00:00Z", "2026-01-31T23:59:59.123456+03:00", "2026-07-24T10:00:00.1-04:30",
    ];
    let allRej = true, allAcc = true;
    for (const s of INVALID) {
      let r; try { r = runner(s); } catch { r = true; }
      if (r !== false) { allRej = false; console.log(`    reddedilmeli ama kabul: ${s}`); }
    }
    for (const s of VALID) {
      let r; try { r = runner(s); } catch { r = false; }
      if (r !== true) { allAcc = false; console.log(`    kabul edilmeli ama red: ${s}`); }
    }
    check("7. geçersiz takvim örnekleri REDDEDİLİYOR (davranışsal)", allRej);
    check("8. geçerli (artık yıl dahil) örnekler KABUL EDİLİYOR (davranışsal)", allAcc);
  }
}

check("17. Date.toISOString normalization YOK (route + service)",
  !/toISOString\s*\(/.test(detailCode) && !/toISOString\s*\(/.test(mutCode));
check("17b. expected_updated_at ORİJİNAL iletiliyor (değiştirilmeden)", /updateTradition\s*\([\s\S]{0,80}expectedUpdatedAt\s*,\s*patch\s*,\s*reason\s*\)/.test(patchBlock));

// --- Canonical alanlar / omitted-null ---
check("18. en az bir canonical alan (patch boşsa 400)", /Object\.keys\(\s*patch\s*\)\.length\s*===\s*0[\s\S]{0,40}return\s+invalidUpdateBody\(\)/.test(patchBlock));
check("19. required present → null reddi (typeof !== string → 400)",
  /if\s*\(\s*typeof\s+v\s*!==\s*"string"\s*\)\s*return\s+invalidUpdateBody\(\)/.test(patchBlock));
check("20. nullable native → string|null (v!==null && typeof v!==string → 400)",
  /if\s*\(\s*v\s*!==\s*null\s*&&\s*typeof\s+v\s*!==\s*"string"\s*\)\s*return\s+invalidUpdateBody\(\)/.test(patchBlock));
check("21. patch EXPLICIT oluşturuluyor (present anahtar per-alan)", /if\s*\(\s*"slug"\s+in\s+obj\s*\)/.test(patchBlock) && /if\s*\(\s*"native_script_code"\s+in\s+obj\s*\)/.test(patchBlock));
check("21b. omitted/null korunuyor (patch.native_name = v; body doğrudan iletilmiyor)",
  /patch\.native_name\s*=\s*v/.test(patchBlock) && !/p_patch:\s*obj/.test(mutCode) && /p_patch:\s*patch/.test(mutCode));

// --- Coercion yok ---
for (const [label, src] of [["PATCH bloğu", patchBlock], ["mutation service", mutCode]]) {
  check(`22. ${label}: String() coercion YOK`, !/\bString\s*\(/.test(src));
  check(`22b. ${label}: .toLowerCase()/.toUpperCase() YOK`, !/\.toLowerCase\s*\(|\.toUpperCase\s*\(/.test(src));
  check(`22c. ${label}: .slice()/.substring() YOK`, !/\.slice\s*\(|\.substring\s*\(/.test(src));
}
check("22d. mutation service kullanıcı değerini trim ETMİYOR", !/\.trim\s*\(/.test(mutCode));

// --- RPC adı / payload ---
check("23. exact RPC adı", /db\.rpc\(\s*"yebs_update_tradition_with_audit"/.test(mutCode));
const rpcParams = ["p_actor_admin_id", "p_request_id", "p_operation_id", "p_tradition_id", "p_expected_updated_at", "p_patch", "p_reason"];
check("24. exact 7 RPC parametresi", rpcParams.every((p) => new RegExp(`\\b${p}\\s*:`).test(mutCode)));
check("24b. yasak RPC parametresi YOK", !/\bp_(id|status|created_at|updated_at|outcome|action|entity_type|actor_label|new_state|previous_state|error_code)\b/.test(mutCode));
check("25. actor yalnız actorAdminId'den (p_actor_admin_id: actorAdminId)", /p_actor_admin_id:\s*actorAdminId/.test(mutCode));
{
  const patchTypeLit = mutCode.match(/UpdateTraditionPatch\s*=\s*\{([\s\S]*?)\};/)?.[1] || "";
  check("25b. updateTradition ayrı actorAdminId parametresi + patch tipinde actor yok",
    /export\s+async\s+function\s+updateTradition\s*\(\s*[\s\S]*?actorAdminId\s*:\s*string/.test(mutCode)
    && patchTypeLit.length > 0 && !/actor|adminId/i.test(patchTypeLit));
}

// --- Exact error classification ---
check("26. exact error equality (UPDATE_RPC_ERROR_CODES Set.has)", /UPDATE_RPC_ERROR_CODES\s*:\s*ReadonlySet/.test(mut) && /UPDATE_RPC_ERROR_CODES\.has\(/.test(mutCode));
check("26b. includes/startsWith/endsWith token sınıflandırması YOK", !/\.includes\s*\(/.test(mutCode) && !/\.startsWith\s*\(/.test(mutCode) && !/\.endsWith\s*\(/.test(mutCode));
check("26c. error.message regex/match ile sınıflandırılmıyor", !/error\.message\s*\)?\s*\.(test|match)\s*\(/.test(mutCode) && !/\.(test|match)\s*\(\s*error\.message/.test(mutCode));

// --- HTTP mapping ---
check("27. YEBS_TRADITION_NOT_FOUND → 404", /case\s+"YEBS_TRADITION_NOT_FOUND":[\s\S]{0,120}status:\s*404/.test(detailCode));
check("28. duplicate/stale/status-lock/no-changes → 409",
  /case\s+"YEBS_TRADITION_DUPLICATE":[\s\S]{0,120}status:\s*409/.test(detailCode)
  && /case\s+"YEBS_TRADITION_STALE_UPDATE":[\s\S]{0,320}status:\s*409/.test(detailCode)
  && /case\s+"YEBS_TRADITION_STATUS_LOCKED":[\s\S]{0,160}status:\s*409/.test(detailCode)
  && /case\s+"YEBS_TRADITION_NO_CHANGES":[\s\S]{0,160}status:\s*409/.test(detailCode));
check("29. invalid patch/input/reason → 400",
  /case\s+"YEBS_INVALID_PATCH":\s*case\s+"YEBS_INVALID_TRADITION_INPUT":\s*case\s+"YEBS_REASON_INVALID":[\s\S]{0,160}status:\s*400/.test(detailCode));
check("30. admin race → 403 (YEBS_ADMIN_FORBIDDEN, sabit mesaj)",
  /case\s+"YEBS_ADMIN_NOT_FOUND":\s*case\s+"YEBS_ADMIN_NOT_ACTIVE":[\s\S]{0,200}status:\s*403/.test(detailCode) && /Admin yetkisi doğrulanamadı\./.test(detail));
check("31. required-id/internal → 500 (generic)", /default:[\s\S]{0,200}Gelenek güncellenemedi\.[\s\S]{0,80}status:\s*500/.test(detailCode));
check("32. geçersiz URL ID → 400 YEBS_INVALID_TRADITION_ID", /YEBS_INVALID_TRADITION_ID[\s\S]{0,60}status:\s*400/.test(detailCode) || /status:\s*400[\s\S]{0,60}YEBS_INVALID_TRADITION_ID/.test(detailCode));

// --- Success / audit / leak ---
check("33. success 200 { ok:true, row }", /\{\s*ok:\s*true\s*,\s*row:\s*result\.row\s*\}\s*,\s*\{\s*status:\s*200\s*\}/.test(patchBlock));
check("34. audit/previous_state response'a EKLENMİYOR", !/audit/i.test(patchBlock) && !/previous_state/i.test(patchBlock));
check("35. route: ham error.message/details/hint YOK", !/error\.message/.test(detail) && !/error\.details/.test(detail) && !/error\.hint/.test(detail));
{
  const leak = mut.split(/\r?\n/).filter((l) => l.includes("error.message") && !l.includes("console.error"));
  check("35b. mutation service: error.message yalnız console.error", leak.length === 0, leak.join(" | "));
  check("35c. mutation service: error.details/hint dönmüyor", !/error\.details/.test(mutCode) && !/error\.hint/.test(mutCode));
}

// --- Create regresyonu / doğrudan mutation yok ---
check("36. createTradition korunuyor (regresyon yok)", /export\s+async\s+function\s+createTradition\s*\(/.test(mut));
check("37. mutation service import \"server-only\"", /^import\s+["']server-only["'];/m.test(mut));
for (const [label, src] of [["detail route", detailCode], ["mutation service", mutCode]]) {
  check(`38. ${label}: istemci Supabase importu YOK`, !/from\s+["']@\/lib\/supabase["']/.test(src));
  check(`38b. ${label}: createClient çağırmıyor`, !/createClient\s*\(/.test(src));
  for (const op of ["insert", "update", "delete", "upsert"]) {
    check(`39. ${label}: doğrudan .${op}( (tablo) YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(src));
  }
}
check("40. update yalnız RPC üzerinden (.rpc( var)", /\.rpc\s*\(/.test(mutCode));

// --- git blob değişmezliği ---
function blobEq(rel) {
  const abs = resolve(ROOT, rel);
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:${rel}`], { encoding: "utf8" }).trim();
  return wt === base;
}
try {
  check("41. collection POST route değişmemiş (create sözleşmesi)", blobEq("app/api/admin/yebs/traditions/route.ts"));
  check("41b. AUD2 create migration değişmemiş", blobEq("supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql"));
  check("41c. AUD2 create harness değişmemiş", blobEq("scripts/yebs-create-tradition-audit-rpc-harness.mjs"));
  check("42. AUD1 migration değişmemiş", blobEq("supabase/migrations/20260803010000_yebs_audit_events.sql"));
  for (const f of D1_D9) check(`43. D1-D9 değişmez: ${f}`, blobEq(`supabase/migrations/${f}`));
  check("43b. read service traditions.ts değişmemiş", blobEq("lib/yebs/service/traditions.ts"));
} catch (e) { bad("git blob değişmezlik kontrolü", String(e && e.message)); }

// --- 44. Canlı negatif (yazma YOK): admin auth header göndermeyen tek çağrı ---
{
  const authHdr1 = ["x", "admin", "id"].join("-");
  const authHdr2 = ["x", "session", "token"].join("-");
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  check("44. harness admin auth header göndermiyor → başarılı PATCH/DB-write imkânsız",
    !self.includes(authHdr1) && !self.includes(authHdr2));
}
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) {
  skipped("PATCH auth eksik → 401 (canlı)", "YEBS_HARNESS_BASE_URL yok");
} else {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/traditions/00000000-0000-4000-8000-000000000000`;
  try {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected_updated_at: "2026-01-01T00:00:00Z", reason: "x", name_tr: "x" }),
    });
    check("44b. PATCH auth eksik → 401 (write oluşmaz)", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("PATCH auth eksik → 401 (canlı)", `fetch hatası: ${String(e && e.message)}`);
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
