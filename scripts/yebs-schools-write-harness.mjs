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
import { execFileSync } from "node:child_process";

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
  check("mutation: iki ayrı crypto.randomUUID()", (mut.match(/crypto\.randomUUID\(\)/g) || []).length === 2);
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

// ── C. Detail route değişmezliği (A1W'de dokunulmaz) ──
try {
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", P.detail], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", "origin/main:app/api/admin/yebs/schools/[id]/route.ts"], { encoding: "utf8" }).trim();
  check("detail route origin/main blob'una eşit (değişmedi)", wt === base);
} catch (e) { bad("detail route değişmezlik kontrolü", String(e && e.message)); }

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
