// ============================================================
// YEBS API-A5AR — Concept Relations SALT-OKUNUR API harness'i (statik sözleşme). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/relations/route.ts",
  detailRoute: "app/api/admin/yebs/relations/[id]/route.ts",
  service: "lib/yebs/service/conceptRelations.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k, v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

check("hedef dosyalar mevcut", Object.values(P).every(existsSync));
let list = "", detail = "", svc = "";
try { list = readFileSync(P.listRoute, "utf8"); detail = readFileSync(P.detailRoute, "utf8"); svc = readFileSync(P.service, "utf8"); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (list && detail && svc) {
  const CANON = ["id", "source_concept_id", "target_concept_id", "relation_type", "status", "created_at", "updated_at"];

  console.log("\n[A] HTTP fiil + auth");
  check("list GET export", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("list POST export (create)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  for (const v of ["PUT", "PATCH", "DELETE"]) check(`list ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(list));
  check("detail GET export", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  check("detail PATCH export (update)", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
  for (const v of ["POST", "PUT", "DELETE"]) check(`detail ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(detail));
  check("DELETE hiç yok (A5 kapsam dışı)", !/function\s+DELETE/.test(list) && !/function\s+DELETE/.test(detail));
  check("list verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(list) && /return\s+guard\.response/.test(list));
  check("detail verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(detail) && /return\s+guard\.response/.test(detail));
  check("runtime nodejs", /runtime\s*=\s*"nodejs"/.test(list) && /runtime\s*=\s*"nodejs"/.test(detail));

  console.log("\n[B] Canonical 7 alan + fail-closed + explicit SELECT");
  check("YEBS_CONCEPT_RELATION_COLUMNS açık liste, select * yok",
    /YEBS_CONCEPT_RELATION_COLUMNS\s*=\s*\n?\s*"id, source_concept_id, target_concept_id, relation_type, status, created_at, updated_at"/.test(svc) && !/\.select\(\s*["'`]\*/.test(svc));
  for (const f of CANON) check(`canonical guard alanı: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("fail-closed list (every isCanonicalRelationRow)", /rows\.every\(isCanonicalRelationRow\)/.test(svc));
  check("fail-closed detail", /if \(!isCanonicalRelationRow\(data\)\)/.test(svc));

  console.log("\n[C] Enum kümeleri exact");
  check("YEBS_CONCEPT_RELATION_TYPES 5 değer", (svc.match(/YEBS_CONCEPT_RELATION_TYPES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 5);
  check("relation_type 5 exact", ["broader_than", "part_of", "related_to", "contrasted_with", "corresponds_to"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("equivalent_to / approximate YOK", !/equivalent_to|approximate/.test(svc));
  check("YEBS_CONCEPT_RELATION_STATUSES 7 değer", (svc.match(/YEBS_CONCEPT_RELATION_STATUSES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 7);
  check("status 7 exact (rejected YOK)", ["draft", "under_review", "needs_verification", "verified", "approved", "published", "archived"].every(t => new RegExp(`"${t}"`).test(svc)) && !/"rejected"/.test(svc));

  console.log("\n[D] Deterministik sıra + concept_id iki uç + JOIN yok");
  check("order created_at DESC", /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("order id DESC tiebreak", /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("concept_id iki uç (source OR target)", /source_concept_id\.eq\.\$\{filters\.conceptId\},target_concept_id\.eq\.\$\{filters\.conceptId\}/.test(svc));
  check("has_sources/source_id junction id-listesi (JOIN response yok)", /from\("yebs_concept_relation_sources"\)\.select\("concept_relation_id"\)/.test(svc));
  check("Concept adı/label JOIN YOK", !/yebs_concepts\b/.test(svc) && !/concept_label|slug/.test(svc));
  const svcCode = svc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("source count / sentetik inverse YOK (yorum-dışı kod; pagination count meşru)", !/inverse/i.test(svcCode) && !/source_count|sources_count|relation_count|usage/i.test(svcCode));
  check("mutation/rpc YOK", !/\.rpc\(/.test(svc) && !/\.(insert|update|delete|upsert)\s*\(/.test(svc));

  console.log("\n[E] Filtre kesinliği (route)");
  check("source/target/concept/source_id strict UUID (readUuid)", /UUID_RE\.test\(raw\)/.test(list) && /readUuid\("source_concept_id"/.test(list) && /readUuid\("concept_id"/.test(list));
  check("relation_type enum doğrulama", /YEBS_CONCEPT_RELATION_TYPES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("status enum doğrulama", /YEBS_CONCEPT_RELATION_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("has_sources yalnız true/false", /rawHas === "true"[\s\S]*?rawHas === "false"/.test(list));
  check("limit 1..200 default 50", /DEFAULT_LIMIT\s*=\s*50/.test(list) && /MAX_LIMIT\s*=\s*200/.test(list));
  check("offset ≥0 integer", /!Number\.isInteger\(n\) \|\| n < 0/.test(list));
  check("invalid query → 400", /status:\s*400/.test(list));

  console.log("\n[F] Detail 404 + UUID + A5B kapsam dışı");
  check("getConceptRelationById NOT_FOUND", /YEBS_CONCEPT_RELATION_NOT_FOUND/.test(svc));
  check("detail 404 map", /YEBS_CONCEPT_RELATION_NOT_FOUND[\s\S]*?status:\s*404/.test(detail));
  check("detail invalid UUID 400", /YEBS_INVALID_CONCEPT_RELATION_ID[\s\S]*?status:\s*400/.test(detail));
  check("route'larda /sources yolu YOK (A5B ayrı)", !/\/sources\b/.test(list) && !/\/sources\b/.test(detail));
  check("read service relation-source MUTATION/attach implementasyonu YOK (junction has_sources filtresi meşru)",
    !/attachRelationSource|conceptRelationSourceMutations|\.(insert|update|delete|upsert)\s*\(/.test(svcCode));
}

console.log("\n[G] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, "");
  for (const [n, u] of [["list GET 401", `${base}/api/admin/yebs/relations`], ["detail GET 401", `${base}/api/admin/yebs/relations/00000000-0000-4000-8000-000000000000`]]) {
    try { const r = await fetch(u); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
