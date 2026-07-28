// ============================================================
// YEBS API-A1W — Schools Create (POST) Admin API doğrulama harness'i
//
// STATİK kaynak-sözleşmesi + canlı NEGATİF kontrol (yazma YAPMAZ).
// Hiçbir başarılı production POST/INSERT tetiklemez; yalnız kaynak metnini ve
// (env varsa) auth'suz POST'un reddini denetler.
//
// NEYİ KANITLAR: POST route + mutation service statik sözleşmesi, exact allowlist,
//   payload, Set.has sınıflandırma, HTTP mapping, immutability.
// NEYİ KANITLAMAZ: canlı RPC davranışı, gerçek audit/RLS. (production doğrulaması)
//
// Herhangi bir FAIL → process.exit(1). SKIP PASS'a dahil değildir.
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const P = {
  route: resolve(ROOT, "app/api/admin/yebs/schools/route.ts"),
  mut: resolve(ROOT, "lib/yebs/service/schoolMutations.ts"),
  detail: resolve(ROOT, "app/api/admin/yebs/schools/[id]/route.ts"),
};

let pass = 0, fail = 0, skip = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function skipped(n, w) { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }

console.log("\n[A1W-WRITE] Schools POST create sözleşmesi (statik)");

let route = "", mut = "";
try {
  route = readFileSync(P.route, "utf8");
  mut = readFileSync(P.mut, "utf8");
  ok("route + mutation service okunabildi");
} catch (e) {
  bad("kaynak dosyaları okunamadı", String(e && e.message));
}

// ── A. Route HTTP fiil + guard ──
if (route) {
  check("collection GET korunuyor", /export\s+async\s+function\s+GET\s*\(/.test(route));
  check("collection POST export ediyor", /export\s+async\s+function\s+POST\s*\(/.test(route));
  for (const verb of ["PUT", "PATCH", "DELETE"]) {
    check(`collection ${verb} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(route));
  }
  check("POST: verifyAdminRequest kullanıyor", /verifyAdminRequest\s*\(/.test(route));
  check("POST: guard başarısızlığında guard.response", /return\s+guard\.response/.test(route));
  check("POST: actor yalnız guard.adminId (body'den değil)", /const\s*\{\s*adminId,\s*db\s*\}\s*=\s*guard/.test(route));
  check("POST: createSchool(db, adminId, input) çağrısı", /createSchool\(\s*db,\s*adminId,\s*input\s*\)/.test(route));
  check("POST: 201 dönüş", /\{\s*status:\s*201\s*\}/.test(route));

  // Exact 7-key allowlist
  const ALLOWED = ["tradition_id", "slug", "name_tr", "native_name", "native_language_tag", "native_script_code", "reason"];
  const allowlistBlock = route.match(/ALLOWED_BODY_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
  check("exact 7-key allowlist tanımlı", ALLOWED.every((k) => new RegExp(`"${k}"`).test(allowlistBlock)));
  const allowlistKeys = (allowlistBlock.match(/"([a-z_]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  check("allowlist yalnız 7 anahtar (fazla yok)", allowlistKeys.length === ALLOWED.length && allowlistKeys.every((k) => ALLOWED.includes(k)), allowlistKeys.join(","));
  // Yasak alanlar allowlist'te YOK
  for (const forbidden of ["id", "status", "created_at", "updated_at", "actor_admin_id", "actor", "request_id", "operation_id", "action", "outcome", "entity_type", "previous_state", "new_state", "changed_fields", "metadata"]) {
    check(`yasak alan allowlist'te YOK: ${forbidden}`, !new RegExp(`"${forbidden}"`).test(allowlistBlock));
  }

  // Body validation
  check("malformed JSON → invalidBody (400 YEBS_INVALID_REQUEST_BODY)", /await\s+req\.json\(\)[\s\S]{0,80}catch[\s\S]{0,40}invalidBody\(\)/.test(route) && /YEBS_INVALID_REQUEST_BODY/.test(route));
  check("plain-object kontrolü (null/array/typeof)", /typeof\s+body\s*!==\s*"object"\s*\|\|\s*Array\.isArray\(body\)/.test(route));
  check("unknown key → invalidBody (fail-closed)", /if\s*\(!allowed\.has\(key\)\)\s*return\s+invalidBody\(\)/.test(route));
  check("tradition_id strict UUID (UUID_RE) + YEBS_INVALID_TRADITION_ID", /UUID_RE\.test\(traditionId\)/.test(route) && /YEBS_INVALID_TRADITION_ID/.test(route));
  check("tradition_id string değilse invalidBody", /typeof\s+traditionId\s*!==\s*"string"[\s\S]{0,40}invalidBody/.test(route));
  check("required slug/name_tr string + trim-boş", /for\s*\(const\s+key\s+of\s+\["slug",\s*"name_tr"\][\s\S]{0,160}v\.trim\(\)\s*===\s*""/.test(route));
  check("native trio readOptionalString (string|null)", /readOptionalString\(obj,\s*"native_name"\)/.test(route) && /readOptionalString\(obj,\s*"native_language_tag"\)/.test(route) && /readOptionalString\(obj,\s*"native_script_code"\)/.test(route));
  check("reason opsiyonel + blank/2000+ reddi + orijinal", /readOptionalString\(obj,\s*"reason"\)/.test(route) && /reasonRead\.value\.trim\(\)\s*===\s*""\s*\|\|\s*reasonRead\.value\.length\s*>\s*REASON_MAX_LEN/.test(route) && /REASON_MAX_LEN\s*=\s*2000/.test(route));
  check("input orijinal değerlerle kurulur (coercion yok)", /slug:\s*obj\.slug\s+as\s+string/.test(route) && /nameTr:\s*obj\.name_tr\s+as\s+string/.test(route));

  // HTTP mapping
  check("mapping 400: REASON_INVALID/INVALID_SCHOOL_INPUT", /YEBS_REASON_INVALID[\s\S]{0,60}YEBS_INVALID_SCHOOL_INPUT[\s\S]{0,120}status:\s*400/.test(route));
  check("mapping 404: PARENT_TRADITION_NOT_FOUND", /YEBS_PARENT_TRADITION_NOT_FOUND[\s\S]{0,240}status:\s*404/.test(route));
  check("mapping 409: SCHOOL_DUPLICATE", /YEBS_SCHOOL_DUPLICATE[\s\S]{0,240}status:\s*409/.test(route));
  check("mapping 403: ADMIN_FORBIDDEN", /YEBS_ADMIN_FORBIDDEN[\s\S]{0,60}status:\s*403/.test(route));
  check("mapping 500: SCHOOL_CREATE_FAILED default", /YEBS_SCHOOL_CREATE_FAILED[\s\S]{0,60}status:\s*500/.test(route));

  // Ham DB sızıntısı yok
  check("route: ham error.message YOK", !/error\.message/.test(route));
  // Route .rpc/.insert doğrudan çağırmıyor (mutation service üzerinden)
  for (const op of ["insert", "update", "delete", "upsert", "rpc"]) {
    check(`route: .${op}( doğrudan çağrısı YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(route));
  }
}

// ── B. Mutation service ──
if (mut) {
  check('mutation: import "server-only"', /^import\s+["']server-only["'];/m.test(mut));
  // A1U additif: dosya artık createSchool + updateSchool içerir. crypto sayımı FONKSİYON
  // bölgesine göre kapsanır (createSchool bölgesi = A1U bloğundan önce; her biri 2 ayrı UUID).
  const createRegion = mut.includes("API-A1U") ? mut.slice(0, mut.indexOf("API-A1U")) : mut;
  check("mutation: createSchool iki ayrı crypto.randomUUID()", (createRegion.match(/crypto\.randomUUID\(\)/g) || []).length === 2);
  check("mutation: exact RPC adı yebs_create_school_with_audit", /db\.rpc\("yebs_create_school_with_audit"/.test(mut));
  // exact 10 p_-parametre payload
  const payload = ["p_actor_admin_id", "p_request_id", "p_operation_id", "p_tradition_id", "p_slug", "p_name_tr", "p_native_name", "p_native_language_tag", "p_native_script_code", "p_reason"];
  check("mutation: exact 10 RPC parametre payload", payload.every((p) => new RegExp(`${p}:`).test(mut)));
  check("mutation: actor yalnız ayrı actorAdminId argümanı", /p_actor_admin_id:\s*actorAdminId/.test(mut));
  check("mutation: request/operation server UUID (istemci değil)", /p_request_id:\s*requestId/.test(mut) && /p_operation_id:\s*operationId/.test(mut));
  // Set.has classification
  check("mutation: RPC_ERROR_CODES ReadonlySet", /RPC_ERROR_CODES:\s*ReadonlySet/.test(mut) && /new\s+Set\(/.test(mut));
  check("mutation: classify Set.has (includes/startsWith/regex YOK)", /RPC_ERROR_CODES\.has\(/.test(mut) && !/\.(includes|startsWith|endsWith)\(/.test(mut));
  check("mutation: canonical row guard (isCanonicalSchoolRow)", /isCanonicalSchoolRow/.test(mut));
  check("mutation: ham error yalnız console.error (server log)", (mut.split(/\r?\n/).filter((l) => l.includes("error.message") && !l.includes("console.error")).length === 0));
  check("mutation: audit response'a EKLENMEZ (yalnız ok+row döner)", /return\s*\{\s*ok:\s*true,\s*row\s*\}/.test(mut) && !/\b(previous_state|new_state|actor_label|audit_events|entity_type)\b/.test(mut));
  // Doğrudan tablo yazma yok
  for (const op of ["insert", "update", "delete", "upsert"]) {
    check(`mutation: .${op}( doğrudan tablo yazma YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(mut));
  }
}

// ── C. A1U PATCH route + updateSchool servis sözleşmesi (statik) ──
// NOT: A1U detail route'a PATCH ekler → eski "detail route değişmedi" blob kontrolü
// KALDIRILDI (dosya artık A1U'ya ait). Yerine PATCH/update sözleşmesi denetlenir.
console.log("\n[A1U-PATCH] Schools PATCH update sözleşmesi (statik)");
let detailSrc = "";
try {
  detailSrc = readFileSync(P.detail, "utf8");
  ok("detail route ([id]) okunabildi");
} catch (e) {
  bad("detail route okunamadı", String(e && e.message));
}
if (detailSrc) {
  check("detail GET korunuyor", /export\s+async\s+function\s+GET\s*\(/.test(detailSrc));
  check("detail PATCH export ediyor", /export\s+async\s+function\s+PATCH\s*\(/.test(detailSrc));
  for (const verb of ["POST", "PUT", "DELETE"]) {
    check(`detail ${verb} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(detailSrc));
  }
  check("PATCH: verifyAdminRequest", /verifyAdminRequest\s*\(/.test(detailSrc));
  check("PATCH: guard.response", /return\s+guard\.response/.test(detailSrc));
  check("PATCH: actor yalnız guard.adminId", /const\s*\{\s*adminId,\s*db\s*\}\s*=\s*guard/.test(detailSrc));
  check("PATCH: URL id strict UUID → YEBS_INVALID_SCHOOL_ID", /UUID_RE\.test\(id\)/.test(detailSrc) && /YEBS_INVALID_SCHOOL_ID/.test(detailSrc));
  check("PATCH: updateSchool(db, adminId, id, expectedUpdatedAt, patch, reason)", /updateSchool\(\s*db,\s*adminId,\s*id,\s*expectedUpdatedAt,\s*patch,\s*reason\s*\)/.test(detailSrc));
  check("PATCH: 200 dönüş", /\{\s*status:\s*200\s*\}/.test(detailSrc));

  // PATCH exact 7-key allowlist
  const PATCH_ALLOWED = ["expected_updated_at", "reason", "slug", "name_tr", "native_name", "native_language_tag", "native_script_code"];
  const patchBlock = detailSrc.match(/PATCH_ALLOWED_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
  check("PATCH exact 7-key allowlist tanımlı", PATCH_ALLOWED.every((k) => new RegExp(`"${k}"`).test(patchBlock)));
  const patchKeys = (patchBlock.match(/"([a-z_]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  check("PATCH allowlist yalnız 7 anahtar (fazla yok)", patchKeys.length === PATCH_ALLOWED.length && patchKeys.every((k) => PATCH_ALLOWED.includes(k)), patchKeys.join(","));
  for (const forbidden of ["tradition_id", "status", "id", "created_at", "updated_at", "actor_admin_id", "request_id", "operation_id", "changed_fields", "action", "outcome"]) {
    check(`PATCH yasak alan allowlist'te YOK: ${forbidden}`, !new RegExp(`"${forbidden}"`).test(patchBlock));
  }

  // Body validation
  check("PATCH malformed JSON → invalidUpdateBody (400 YEBS_INVALID_REQUEST_BODY)", /await\s+req\.json\(\)[\s\S]{0,80}catch[\s\S]{0,40}invalidUpdateBody\(\)/.test(detailSrc) && /YEBS_INVALID_REQUEST_BODY/.test(detailSrc));
  check("PATCH plain-object kontrolü", /typeof\s+body\s*!==\s*"object"\s*\|\|\s*Array\.isArray\(body\)/.test(detailSrc));
  check("PATCH unknown key → invalidUpdateBody", /if\s*\(!allowed\.has\(key\)\)\s*return\s+invalidUpdateBody\(\)/.test(detailSrc));
  check("PATCH reason zorunlu (string+trim+2000)", /typeof\s+reason\s*!==\s*"string"\s*\|\|\s*reason\.trim\(\)\s*===\s*""\s*\|\|\s*reason\.length\s*>\s*REASON_MAX_LEN/.test(detailSrc));
  check("PATCH expected_updated_at zorunlu + strict validator", /isValidExpectedUpdatedAt\(expectedUpdatedAt\)/.test(detailSrc));
  check("PATCH en az bir canonical alan zorunlu", /Object\.keys\(patch\)\.length\s*===\s*0/.test(detailSrc));
  check("PATCH native present → string|null (coercion yok)", /v\s*!==\s*null\s*&&\s*typeof\s+v\s*!==\s*"string"/.test(detailSrc) && /patch\.slug\s*=\s*v/.test(detailSrc));

  // HTTP mapping
  check("PATCH map 400: INVALID_PATCH/INVALID_SCHOOL_INPUT/REASON_INVALID", /YEBS_INVALID_PATCH[\s\S]{0,120}YEBS_INVALID_SCHOOL_INPUT[\s\S]{0,120}YEBS_REASON_INVALID[\s\S]{0,120}status:\s*400/.test(detailSrc));
  check("PATCH map 404: SCHOOL_NOT_FOUND", /YEBS_SCHOOL_NOT_FOUND[\s\S]{0,160}status:\s*404/.test(detailSrc));
  check("PATCH map 409: DUPLICATE", /YEBS_SCHOOL_DUPLICATE[\s\S]{0,340}status:\s*409/.test(detailSrc));
  check("PATCH map 409: STALE_UPDATE", /YEBS_SCHOOL_STALE_UPDATE[\s\S]{0,340}status:\s*409/.test(detailSrc));
  check("PATCH map 409: STATUS_LOCKED", /YEBS_SCHOOL_STATUS_LOCKED[\s\S]{0,340}status:\s*409/.test(detailSrc));
  check("PATCH map 409: NO_CHANGES", /YEBS_SCHOOL_NO_CHANGES[\s\S]{0,340}status:\s*409/.test(detailSrc));
  check("PATCH map 403: ADMIN_FORBIDDEN", /YEBS_ADMIN_FORBIDDEN[\s\S]{0,60}status:\s*403/.test(detailSrc));
  check("PATCH map 500: SCHOOL_UPDATE_FAILED default", /YEBS_SCHOOL_UPDATE_FAILED[\s\S]{0,60}status:\s*500/.test(detailSrc));

  // Güvenlik: ham DB sızıntısı yok + doğrudan DB çağrısı yok (servis üzerinden)
  check("PATCH: ham error.message YOK", !/error\.message/.test(detailSrc));
  for (const op of ["insert", "update", "delete", "upsert", "rpc"]) {
    check(`detail: .${op}( doğrudan çağrısı YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(detailSrc));
  }
}

// ── C2. updateSchool servis sözleşmesi (statik) ──
if (mut) {
  const updateRegion = mut.includes("API-A1U") ? mut.slice(mut.indexOf("API-A1U")) : "";
  check("service: updateSchool export", /export\s+async\s+function\s+updateSchool\s*\(/.test(mut));
  check("service: UpdateSchoolPatch + UpdateSchoolErrorCode tipleri", /export\s+type\s+UpdateSchoolPatch/.test(mut) && /export\s+type\s+UpdateSchoolErrorCode/.test(mut));
  check("service: updateSchool iki ayrı crypto.randomUUID()", (updateRegion.match(/crypto\.randomUUID\(\)/g) || []).length === 2);
  check("service: exact RPC adı yebs_update_school_with_audit", /db\.rpc\("yebs_update_school_with_audit"/.test(mut));
  const upayload = ["p_actor_admin_id", "p_request_id", "p_operation_id", "p_school_id", "p_expected_updated_at", "p_patch", "p_reason"];
  check("service: exact 7 RPC parametre payload", upayload.every((p) => new RegExp(`${p}:`).test(updateRegion)));
  check("service: actor yalnız actorAdminId", /p_actor_admin_id:\s*actorAdminId/.test(updateRegion));
  check("service: request/operation server UUID (istemci değil)", /p_request_id:\s*requestId/.test(updateRegion) && /p_operation_id:\s*operationId/.test(updateRegion));
  check("service: UPDATE_RPC_ERROR_CODES ReadonlySet + Set.has", /UPDATE_RPC_ERROR_CODES:\s*ReadonlySet/.test(mut) && /UPDATE_RPC_ERROR_CODES\.has\(/.test(mut));
  check("service: canonical row guard (isCanonicalSchoolRow reuse)", /isCanonicalSchoolRow/.test(mut));
}

// ── D. Canlı NEGATİF: auth'suz POST → 401 (yazma YAPMAZ) ──
console.log("\n[D] Canlı negatif kontrol (yazma YAPMAZ)");
const selfSrc = readFileSync(fileURLToPath(import.meta.url), "utf8");
const envRefs = [...selfSrc.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
check("harness yalnız BASE_URL env okur (admin oturum env YOK → başarılı POST/DB-write imkânsız)",
  envRefs.length > 0 && envRefs.every((e) => e === "YEBS_HARNESS_BASE_URL"), envRefs.join(","));
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) {
  skipped("auth eksik POST → 401 (canlı)", "YEBS_HARNESS_BASE_URL yok");
} else {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/schools`;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    check("auth eksik POST → 401", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("auth eksik POST → 401", `fetch hatası: ${String(e && e.message)}`);
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
