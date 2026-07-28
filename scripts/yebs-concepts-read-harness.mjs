// ============================================================
// YEBS API-A2R — Concepts Salt-Okunur Admin API doğrulama harness'i
//
// SALT-OKUNUR. Hiçbir INSERT/UPDATE/DELETE/UPSERT/RPC çağrısı yapmaz.
// NEYİ KANITLAR: yalnız statik kaynak-sözleşmesi (route/service metni) ve repo
//   kapsamı. NEYİ KANITLAMAZ: canlı DB davranışı/RLS/runtime privilege.
//
// PASS/FAIL/SKIP sayaçları tutulur. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const REL = {
  listRoute: "app/api/admin/yebs/concepts/route.ts",
  detailRoute: "app/api/admin/yebs/concepts/[id]/route.ts",
  service: "lib/yebs/service/concepts.ts",
  harness: "scripts/yebs-concepts-read-harness.mjs",
};
const P = Object.fromEntries(Object.entries(REL).map(([k, v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));
const read = (p) => readFileSync(p, "utf8");

console.log("\n[A] Dosya / kapsam");
check("hedef dosyalar mevcut", Object.values(P).every(existsSync),
  Object.entries(P).filter(([, p]) => !existsSync(p)).map(([k]) => k).join(", "));

let list = "", detail = "", svc = "";
try {
  list = read(P.listRoute); detail = read(P.detailRoute); svc = read(P.service);
  ok("kaynak dosyaları okunabildi");
} catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (list && detail && svc) {
  console.log("\n[B] HTTP fiil sözleşmesi");
  check("list route GET export", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("list route POST export (create)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  for (const v of ["PUT", "PATCH", "DELETE"])
    check(`list route ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(list));
  check("detail route GET export", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  check("detail route PATCH export (update)", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
  for (const v of ["POST", "PUT", "DELETE"])
    check(`detail route ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(detail));

  console.log("\n[C] Auth + runtime");
  check("list verifyAdminRequest", /verifyAdminRequest\s*\(/.test(list));
  check("detail verifyAdminRequest", /verifyAdminRequest\s*\(/.test(detail));
  check("list guard.response", /return\s+guard\.response/.test(list));
  check("detail guard.response", /return\s+guard\.response/.test(detail));
  check('list runtime nodejs', /runtime\s*=\s*"nodejs"/.test(list));
  check('detail runtime nodejs', /runtime\s*=\s*"nodejs"/.test(detail));

  console.log("\n[D] Canonical 8-field concept sözleşmesi (service)");
  check("YEBS_CONCEPT_COLUMNS açık liste (select * yok)",
    /YEBS_CONCEPT_COLUMNS\s*=\s*\n?\s*"id, tradition_id, school_id, slug, concept_type, status, created_at, updated_at"/.test(svc));
  check("service select('*') KULLANMIYOR", !/\.select\(\s*["'`]\*/.test(svc));
  for (const f of ["id", "tradition_id", "school_id", "slug", "concept_type", "status", "created_at", "updated_at"])
    check(`canonical alan guard: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("canonical guard fail-closed (every isCanonicalConceptRow)", /rows\.every\(isCanonicalConceptRow\)/.test(svc));

  console.log("\n[E] Liste scope + deterministik sıra");
  check("scope tipi yalnız 'tradition'", /YebsConceptScope\s*=\s*"tradition"/.test(svc));
  check("scope=tradition → school_id IS NULL", /scope\s*===\s*"tradition"[\s\S]*?\.is\("school_id",\s*null\)/.test(svc));
  check("scope=tradition ile school_id çakışması → 400 (route)", /scope\s*===\s*"tradition"\s*&&\s*schoolId\s*!==\s*undefined/.test(list));
  check("deterministik order created_at DESC", /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("deterministik order id DESC tiebreak", /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));

  console.log("\n[F] Filtre + q güvenliği + enum");
  check("tradition_id strict UUID (route)", /UUID_RE\.test\(rawTraditionId\)/.test(list));
  check("school_id strict UUID (route)", /UUID_RE\.test\(rawSchoolId\)/.test(list));
  check("status enum doğrulama", /YEBS_CONCEPT_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("concept_type enum doğrulama", /YEBS_CONCEPT_TYPES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("q PostgREST özel karakter arındırma", /replace\(\/\[,\(\)\*%\]\/g,\s*""\)/.test(list));
  check("q max 100", /MAX_Q_LEN\s*=\s*100/.test(list));
  check("q YALNIZ slug'a ilike (service)", /\.ilike\("slug",\s*`%\$\{filters\.q\}%`\)/.test(svc));
  check("limit default 50", /DEFAULT_LIMIT\s*=\s*50/.test(list));
  check("limit max 200", /MAX_LIMIT\s*=\s*200/.test(list));

  console.log("\n[G] JOIN / nested labels / audit YOK");
  check("service .rpc çağrısı YOK (read-only)", !/\.rpc\(/.test(svc));
  check("service insert/update/delete/upsert YOK",
    !/\.(insert|update|delete|upsert)\s*\(/.test(svc));
  check("service audit tablosuna erişmiyor", !/yebs_audit_events/.test(svc));
  check("detail: nested labels DAHİL DEĞİL (labels select yok)", !/yebs_concept_labels/.test(detail));

  console.log("\n[H] Detail 404 sözleşmesi");
  check("getConceptById NOT_FOUND kodu", /YEBS_CONCEPT_NOT_FOUND/.test(svc));
  check("detail route 404 map", /YEBS_CONCEPT_NOT_FOUND[\s\S]*?status:\s*404/.test(detail));
  check("detail invalid UUID → 400 YEBS_INVALID_CONCEPT_ID", /YEBS_INVALID_CONCEPT_ID[\s\S]*?status:\s*400/.test(detail));
}

console.log("\n[I] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) {
  skipped("canlı HTTP kontrolleri", "YEBS_HARNESS_BASE_URL yok");
} else {
  const base = BASE_URL.replace(/\/$/, "");
  for (const [name, url] of [
    ["list GET header eksik → 401", `${base}/api/admin/yebs/concepts`],
    ["detail GET header eksik → 401", `${base}/api/admin/yebs/concepts/00000000-0000-4000-8000-000000000000`],
  ]) {
    try {
      const r = await fetch(url);
      check(name, r.status === 401, `status=${r.status}`);
    } catch (e) { skipped(name, `fetch hatası: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
