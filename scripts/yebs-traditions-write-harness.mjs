// ============================================================
// YEBS API-A0W — Traditions Audit'li CREATE API STATİK SÖZLEŞME harness'i
//
// Bu harness bir STATİK KAYNAK-SÖZLEŞMESİ doğrulayıcısıdır. Gerçek runtime
// davranışını TEK BAŞINA kanıtlamaz; kaynak metnin güvenlik/sözleşme
// değişmezlerini denetler + git blob değişmezliğini doğrular.
//
// Canlı bölüm yalnız YAZMA YAPMAYAN negatif HTTP testidir (auth eksik → 401);
// env yoksa açıkça SKIP. Başarılı POST / DB write ASLA çalıştırılmaz.
//
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const P = {
  route: resolve(ROOT, "app/api/admin/yebs/traditions/route.ts"),
  mut: resolve(ROOT, "lib/yebs/service/traditionMutations.ts"),
  readSvc: resolve(ROOT, "lib/yebs/service/traditions.ts"),
};

const D1_D9 = [
  "20260726210017_yebs_traditions.sql",
  "20260726220031_yebs_schools.sql",
  "20260726230043_yebs_concepts.sql",
  "20260727000000_yebs_concept_labels.sql",
  "20260728000000_yebs_sources.sql",
  "20260729000000_yebs_claims.sql",
  "20260730000000_yebs_claim_sources.sql",
  "20260731000000_yebs_concept_relations.sql",
  "20260801000000_yebs_concept_relation_sources.sql",
];
const AUD1_MIGRATION = "supabase/migrations/20260803010000_yebs_audit_events.sql";
const AUD2_MIGRATION = "supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql";
const AUD2_HARNESS = "scripts/yebs-create-tradition-audit-rpc-harness.mjs";
const READ_SVC_REL = "lib/yebs/service/traditions.ts";

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function skipped(n, w) { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(p) { return readFileSync(p, "utf8"); }

// Yorumları çıkar (blok + satır); yorum metnindeki 'rpc'/'insert'/'includes'
// yanlış eşleşmesin diye yapısal denetimler yorumsuz kod üzerinde yapılır.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

console.log("\n[A0W] Traditions audit'li CREATE API — statik sözleşme");

// --- Dosyaları oku ---
let route = "", mut = "", readSvc = "";
try {
  route = read(P.route);
  mut = read(P.mut);
  readSvc = read(P.readSvc);
  ok("kaynak dosyaları okunabildi (route + mutation service + read service)");
} catch (e) {
  bad("kaynak dosyaları okunamadı", String(e && e.message));
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
  process.exit(1);
}

const routeCode = stripComments(route);
const mutCode = stripComments(mut);
const readSvcCode = stripComments(readSvc);

// POST bloğunu ayır (coercion-yokluğu denetimleri yalnız POST'a uygulanır; GET'in
// q.slice() kullanımı POST sözleşmesini etkilememeli).
const postIdx = routeCode.indexOf("export async function POST");
const postBlock = postIdx === -1 ? "" : routeCode.slice(postIdx);

// ------------------------------------------------------------
// Route: export ve guard sözleşmesi
// ------------------------------------------------------------
check("1. collection route GET export korunuyor", /export\s+async\s+function\s+GET\s*\(/.test(route));
check("2. collection route POST export mevcut", /export\s+async\s+function\s+POST\s*\(/.test(route));
check("3. runtime = nodejs korunuyor", /export\s+const\s+runtime\s*=\s*"nodejs"/.test(route));
check("4. POST verifyAdminRequest ile başlıyor", /verifyAdminRequest\s*\(\s*req\s*\)/.test(postBlock));
check("5. guard.response erken dönüyor", /if\s*\(\s*!guard\.ok\s*\)\s*return\s+guard\.response/.test(postBlock));
check("6. guard.db kullanılıyor", /const\s*\{\s*adminId\s*,\s*db\s*\}\s*=\s*guard/.test(postBlock));
check("7. guard.adminId güvenilir actor kaynağı", /createTradition\s*\(\s*db\s*,\s*adminId\s*,\s*input\s*\)/.test(postBlock));

// ------------------------------------------------------------
// Actor güven zinciri
// ------------------------------------------------------------
{
  const inputLitMatch = postBlock.match(/const\s+input\s*:\s*CreateTraditionInput\s*=\s*\{([\s\S]*?)\};/);
  const inputLit = inputLitMatch ? inputLitMatch[1] : "";
  check("8. actor create input object'inin İÇİNDE değil (input literalinde adminId/actor yok)",
    inputLit.length > 0 && !/adminId|actor/i.test(inputLit));
}
check("9. createTradition ayrı actorAdminId parametresi alır",
  /export\s+async\s+function\s+createTradition\s*\(\s*[\s\S]*?db\s*:\s*SupabaseClient\s*,\s*[\s\S]*?actorAdminId\s*:\s*string\s*,\s*[\s\S]*?input\s*:\s*CreateTraditionInput/.test(mutCode));
check("25. actor yalnız guard.adminId'den iletilir (RPC p_actor_admin_id: actorAdminId)",
  /p_actor_admin_id\s*:\s*actorAdminId/.test(mutCode));

// ------------------------------------------------------------
// Body sözleşmesi: exact 7 anahtar + unknown reddi
// ------------------------------------------------------------
check("10. body yalnız exact 7 alanı kabul eder (ALLOWED_BODY_KEYS)",
  /ALLOWED_BODY_KEYS\s*=\s*\[[\s\S]*?"slug"[\s\S]*?"name_tr"[\s\S]*?"tradition_type"[\s\S]*?"native_name"[\s\S]*?"native_language_tag"[\s\S]*?"native_script_code"[\s\S]*?"reason"[\s\S]*?\]/.test(route));
check("11. unknown alanlar 400 ile reddedilir (allowed.has değilse invalidBody)",
  /for\s*\(\s*const\s+key\s+of\s+Object\.keys\(\s*obj\s*\)\s*\)\s*\{\s*if\s*\(\s*!allowed\.has\(\s*key\s*\)\s*\)\s*return\s+invalidBody\(\)/.test(postBlock));
// ALLOWED set yasak alan adı İÇERMEZ (whitelist'e sızıntı yok)
const forbiddenKeys = [
  "id", "status", "created_at", "createdAt", "updated_at", "updatedAt",
  "actorId", "actor_id", "actorAdminId", "actor_admin_id", "adminId", "admin_id",
  "actorEmail", "actorLabel", "actor_label_snapshot", "createdBy", "updatedBy",
  "requestId", "request_id", "operationId", "operation_id", "outcome", "action",
  "entityType", "entity_id", "published", "approved", "verified",
  "__proto__", "prototype", "constructor",
];
const allowedArrMatch = route.match(/ALLOWED_BODY_KEYS\s*=\s*\[([\s\S]*?)\]/);
const allowedArrText = allowedArrMatch ? allowedArrMatch[1] : "";
check("12. actor/id/status/timestamp/request/operation alanları allowed set'te YOK",
  allowedArrText.length > 0 && forbiddenKeys.every((k) => !new RegExp(`["']${k.replace(/[$]/g, "\\$")}["']`).test(allowedArrText)),
  "allowed set yasak alan içeriyor");
check("12b. invalidBody sabiti 400 + YEBS_INVALID_REQUEST_BODY üretiyor",
  /function\s+invalidBody\s*\(\s*\)\s*:\s*Response\s*\{[\s\S]*?YEBS_INVALID_REQUEST_BODY[\s\S]*?status:\s*400/.test(route));

// ------------------------------------------------------------
// Body parse / tip güvenliği
// ------------------------------------------------------------
check("13. malformed JSON → 400 (try/catch → invalidBody)",
  /try\s*\{\s*body\s*=\s*await\s+req\.json\(\)\s*;?\s*\}\s*catch\s*\{\s*return\s+invalidBody\(\)/.test(postBlock));
check("14. null/array/non-object → 400",
  /body\s*===\s*null\s*\|\|\s*typeof\s+body\s*!==\s*"object"\s*\|\|\s*Array\.isArray\(\s*body\s*\)/.test(postBlock));
check("15. yanlış alan tipleri → 400 (zorunlu typeof !== string; opsiyonel readOptionalString !ok)",
  /typeof\s+v\s*!==\s*"string"\s*\|\|\s*v\.trim\(\)\s*===\s*""/.test(postBlock)
  && /if\s*\(\s*!nativeName\.ok\s*\|\|\s*!nativeLang\.ok\s*\|\|\s*!nativeScript\.ok\s*\)\s*return\s+invalidBody\(\)/.test(postBlock));

// ------------------------------------------------------------
// Coercion / truncation / normalization YOK (yalnız POST bloğu + mutation service)
// ------------------------------------------------------------
for (const [label, src] of [["POST bloğu", postBlock], ["mutation service", mutCode]]) {
  check(`16/18. ${label}: String() coercion YOK`, !/\bString\s*\(/.test(src));
  check(`16b. ${label}: .toLowerCase()/.toUpperCase() YOK`, !/\.toLowerCase\s*\(|\.toUpperCase\s*\(/.test(src));
  check(`17. ${label}: .slice()/.substring() (truncation) YOK`, !/\.slice\s*\(|\.substring\s*\(/.test(src));
}
check("16c. orijinal string iletiliyor (slug: obj.slug as string — trim/coerce yok)",
  /slug:\s*obj\.slug\s+as\s+string/.test(postBlock)
  && /nameTr:\s*obj\.name_tr\s+as\s+string/.test(postBlock)
  && /traditionType:\s*obj\.tradition_type\s+as\s+string/.test(postBlock));
check("18b. mutation service kullanıcı değerini trim ETMİYOR", !/\.trim\s*\(/.test(mutCode));
check("reason yalnız doğrulama için trim + <=2000; orijinal iletiliyor",
  /reasonRead\.value\.trim\(\)\s*===\s*""\s*\|\|\s*reasonRead\.value\.length\s*>\s*REASON_MAX_LEN/.test(postBlock)
  && /reason:\s*reasonRead\.value/.test(postBlock));

// ------------------------------------------------------------
// Server-side ID üretimi
// ------------------------------------------------------------
check("19. requestId server-side UUID (crypto.randomUUID)",
  /const\s+requestId\s*=\s*crypto\.randomUUID\(\)/.test(mutCode));
check("20. operationId AYRI server-side UUID",
  /const\s+operationId\s*=\s*crypto\.randomUUID\(\)/.test(mutCode)
  && /const\s+requestId\s*=\s*crypto\.randomUUID\(\)/.test(mutCode));
check("20b. route body'den request/operation ID okumuyor/üretmiyor",
  !/randomUUID/.test(postBlock) && !/request_id|operation_id|requestId|operationId/.test(postBlock));

// ------------------------------------------------------------
// RPC exact adı ve payload
// ------------------------------------------------------------
check("21. RPC exact adı kullanılıyor",
  /db\.rpc\(\s*"yebs_create_tradition_with_audit"/.test(mutCode));
const rpcParams = [
  "p_actor_admin_id", "p_request_id", "p_operation_id", "p_slug", "p_name_tr",
  "p_tradition_type", "p_native_name", "p_native_language_tag", "p_native_script_code", "p_reason",
];
check("22. on RPC parametresi exact adlarla iletiliyor",
  rpcParams.every((p) => new RegExp(`\\b${p}\\s*:`).test(mutCode)));
check("22b. yasak RPC parametresi YOK (p_id/p_status/p_created_at/p_updated_at/p_outcome/p_action/p_entity_type/p_actor_label)",
  !/\bp_(id|status|created_at|updated_at|outcome|action|entity_type|entity_id|actor_label|actor_label_snapshot|new_state|previous_state|error_code)\b/.test(mutCode));
check("23. native alanlar null olarak iletilebilir (payload input.native*)",
  /p_native_name:\s*input\.nativeName/.test(mutCode)
  && /p_native_language_tag:\s*input\.nativeLanguageTag/.test(mutCode)
  && /p_native_script_code:\s*input\.nativeScriptCode/.test(mutCode));
check("24. reason exact iletiliyor (p_reason: input.reason)",
  /p_reason:\s*input\.reason/.test(mutCode));

// ------------------------------------------------------------
// Success response
// ------------------------------------------------------------
check("26. success 201 ve { ok: true, row }",
  /\{\s*ok:\s*true\s*,\s*row:\s*result\.row\s*\}\s*,\s*\{\s*status:\s*201\s*\}/.test(postBlock));
check("27. audit event response'a EKLENMİYOR (POST bloğunda audit yok)",
  !/audit/i.test(postBlock));
// RPC adı 'yebs_create_tradition_with_audit' 'audit' içerir; bu meşru. Denetim:
// hiçbir RETURN object'i audit alanı taşımamalı.
check("27b. mutation service dönüşü yalnız row (return object'inde audit yok)",
  !/return\s*\{[^}]*audit/i.test(mutCode));

// ------------------------------------------------------------
// HTTP error mapping (kesin)
// ------------------------------------------------------------
check("28. duplicate → 409",
  /case\s+"YEBS_TRADITION_DUPLICATE":[\s\S]*?status:\s*409/.test(route));
check("29. invalid input/reason → 400",
  /case\s+"YEBS_INVALID_TRADITION_INPUT":\s*case\s+"YEBS_REASON_INVALID":[\s\S]*?status:\s*400/.test(routeCode));
check("30. DB admin race/revocation → 403 (sabit mesaj, var/yok sızmaz)",
  /case\s+"YEBS_ADMIN_NOT_FOUND":\s*case\s+"YEBS_ADMIN_NOT_ACTIVE":[\s\S]*?status:\s*403/.test(routeCode)
  && /Admin yetkisi doğrulanamadı\./.test(route));
check("31. required server ID hataları → 500",
  /case\s+"YEBS_REQUEST_ID_REQUIRED":\s*case\s+"YEBS_OPERATION_ID_REQUIRED":[\s\S]*?YEBS_TRADITION_CREATE_FAILED[\s\S]*?status:\s*500/.test(routeCode));
check("32. beklenmeyen DB hatası → generic 500 (default)",
  /default:[\s\S]*?Gelenek oluşturulamadı\.[\s\S]*?status:\s*500/.test(routeCode));

// ------------------------------------------------------------
// Exact DB error sınıflandırması (includes/startsWith/endsWith/regex YOK)
// ------------------------------------------------------------
check("33. controlled DB mesajları EXACT eşitlikle sınıflandırılır (Set.has)",
  /RPC_ERROR_CODES\s*:\s*ReadonlySet/.test(mut) && /RPC_ERROR_CODES\.has\(/.test(mutCode));
check("34. includes/startsWith/endsWith token sınıflandırması YOK (mutation service)",
  !/\.includes\s*\(/.test(mutCode) && !/\.startsWith\s*\(/.test(mutCode) && !/\.endsWith\s*\(/.test(mutCode));
check("34b. error.message üzerinde regex/match sınıflandırması YOK",
  !/error\.message\s*\)?\s*\.(test|match)\s*\(/.test(mutCode) && !/\.(test|match)\s*\(\s*error\.message/.test(mutCode));
check("33b. allowlist exact 7 kod içeriyor",
  ["YEBS_REQUEST_ID_REQUIRED","YEBS_OPERATION_ID_REQUIRED","YEBS_REASON_INVALID","YEBS_INVALID_TRADITION_INPUT","YEBS_ADMIN_NOT_FOUND","YEBS_ADMIN_NOT_ACTIVE","YEBS_TRADITION_DUPLICATE"].every((c) => mut.includes(c)));

// ------------------------------------------------------------
// Ham DB hata metni sızıntısı YOK
// ------------------------------------------------------------
check("35. route: ham error.message/details/hint YOK",
  !/error\.message/.test(route) && !/error\.details/.test(route) && !/error\.hint/.test(route));
{
  const mutLines = mut.split(/\r?\n/);
  const leak = mutLines.filter((l) => l.includes("error.message") && !l.includes("console.error"));
  check("35b. mutation service: error.message yalnız console.error (server log)", leak.length === 0, leak.join(" | "));
  check("35c. mutation service: error.details/hint istemciye dönmüyor",
    !/error\.details/.test(mutCode) && !/error\.hint/.test(mutCode));
  check("35d. mutation service failure dönüşü yalnız { ok:false, code } (ham metin yok)",
    !/return\s*\{\s*ok:\s*false,\s*[^}]*error\s*:/.test(mutCode));
}

// ------------------------------------------------------------
// Read service read-only korunuyor (değiştirilmedi)
// ------------------------------------------------------------
for (const op of ["insert", "update", "delete", "upsert", "rpc"]) {
  check(`36. read service .${op}( çağrısı YOK (read-only korunuyor)`, !new RegExp(`\\.${op}\\s*\\(`).test(readSvcCode));
}

// ------------------------------------------------------------
// server-only / client Supabase / doğrudan mutation
// ------------------------------------------------------------
check('37. mutation service import "server-only" içeriyor', /^import\s+["']server-only["'];/m.test(mut));
for (const [label, src] of [["route", route], ["mutation service", mut]]) {
  check(`38. ${label}: istemci Supabase (@/lib/supabase) importu YOK`, !/from\s+["']@\/lib\/supabase["']/.test(src));
  check(`38b. ${label}: createClient çağırmıyor`, !/createClient\s*\(/.test(src));
  check(`38c. ${label}: SUPABASE_SERVICE_ROLE_KEY doğrudan okumuyor`, !/SUPABASE_SERVICE_ROLE_KEY/.test(src));
}
for (const [label, src] of [["route", routeCode], ["mutation service", mutCode]]) {
  for (const op of ["insert", "update", "delete", "upsert"]) {
    check(`39. ${label}: doğrudan .${op}( (traditions tablosu) YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(src));
  }
}
check("40. mutation yalnız RPC üzerinden (.rpc( var, doğrudan tablo mutasyonu yok)",
  /\.rpc\s*\(/.test(mutCode));

// ------------------------------------------------------------
// git blob değişmezliği (working tree == origin/main)
// ------------------------------------------------------------
function blobEqualsOriginMain(relPath) {
  const abs = resolve(ROOT, relPath);
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:${relPath}`], { encoding: "utf8" }).trim();
  return { same: wt === base, wt, base };
}
try {
  const a2m = blobEqualsOriginMain(AUD2_MIGRATION);
  check("41. API-AUD2 migration blob = origin/main", a2m.same, a2m.same ? "" : `${a2m.wt} != ${a2m.base}`);
  const a2h = blobEqualsOriginMain(AUD2_HARNESS);
  check("41b. API-AUD2 harness blob = origin/main", a2h.same, a2h.same ? "" : `${a2h.wt} != ${a2h.base}`);
  const a1 = blobEqualsOriginMain(AUD1_MIGRATION);
  check("42. API-AUD1 migration blob = origin/main", a1.same, a1.same ? "" : `${a1.wt} != ${a1.base}`);
  for (const f of D1_D9) {
    const r = blobEqualsOriginMain(`supabase/migrations/${f}`);
    check(`43. D1-D9 blob = origin/main: ${f}`, r.same, r.same ? "" : `${r.wt} != ${r.base}`);
  }
  const rs = blobEqualsOriginMain(READ_SVC_REL);
  check("36b. read service blob = origin/main (değiştirilmedi)", rs.same, rs.same ? "" : `${rs.wt} != ${rs.base}`);
  // NOT: [id] detail route değişmezliği artık BU harness'in sorumluluğu değildir.
  // API-A0U detail route'a PATCH ekler; o dosyanın sözleşmesini update harness
  // (yebs-traditions-update-harness.mjs) doğrular. Bu create-write harness'i yalnız
  // collection route (POST create) sözleşmesini ve create-yan değişmezleri korur.
} catch (e) {
  bad("git blob değişmezlik kontrolü çalıştı", String(e && e.message));
}

// ------------------------------------------------------------
// 44. Canlı bölüm: YALNIZ YAZMA YAPMAYAN negatif test (auth eksik → 401)
// ------------------------------------------------------------
console.log("\n[A0W] Canlı negatif kontrol (yazma YAPMAZ)");
// Harness hiçbir admin auth header'ı göndermez → guard her zaman 401 verir →
// hiçbir canlı çağrı DB'ye YAZAMAZ. Token'lar parçalardan kurulur ki bu denetim
// kendi kaynağında yanlış-pozitif üretmesin.
{
  const authHdr1 = ["x", "admin", "id"].join("-");
  const authHdr2 = ["x", "session", "token"].join("-");
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  check("44. harness admin auth header göndermiyor → canlı DB-write imkânsız",
    !self.includes(authHdr1) && !self.includes(authHdr2));
}
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) {
  skipped("POST auth eksik → 401 (canlı)", "YEBS_HARNESS_BASE_URL yok");
} else {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/traditions`;
  try {
    // Auth header YOK → guard 401; body parse'a ulaşmadan reddedilir (write yok).
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "x", name_tr: "x", tradition_type: "cultural_tradition" }),
    });
    check("44b. POST auth eksik → 401 (write oluşmaz)", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("POST auth eksik → 401 (canlı)", `fetch hatası: ${String(e && e.message)}`);
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
