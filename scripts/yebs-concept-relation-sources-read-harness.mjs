// ============================================================
// YEBS API-A5BR — Concept Relation Sources SALT-OKUNUR API harness'i (statik sözleşme). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/relations/[id]/sources/route.ts",
  detailRoute: "app/api/admin/yebs/relations/[id]/sources/[relationSourceId]/route.ts",
  service: "lib/yebs/service/conceptRelationSources.ts",
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
  const CANON = ["id", "concept_relation_id", "source_id", "evidence_layer", "source_role", "locator_text", "url_fragment", "source_original_excerpt", "source_original_language_tag", "source_original_script_code", "transliteration", "transliteration_scheme", "faithful_translation", "translation_language_tag", "rationale", "rationale_status", "verification_status", "created_at", "updated_at"];

  console.log("\n[A] HTTP fiil + nested + auth");
  check("collection GET export", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("collection POST export (attach)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  for (const v of ["PUT", "PATCH", "DELETE"]) check(`collection ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(list));
  check("detail GET export", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  check("detail PATCH export (update)", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
  check("detail DELETE export (detach)", /export\s+async\s+function\s+DELETE\s*\(/.test(detail));
  // Kanonik dinamik slug [id]'ye tekilleştirildi (Next.js sibling-slug çakışması fix'i);
  // iç değişken adı `relationId` alias ile korunur (const { id: relationId }).
  check("nested path canonical [id] (collection)", /\{ id: string \}/.test(list) && /const \{ id: relationId \}/.test(list));
  check("nested path canonical [id]+relationSourceId (detail)", /\{ id: string; relationSourceId: string \}/.test(detail) && /const \{ id: relationId, relationSourceId \}/.test(detail));
  check("collection verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(list) && /return\s+guard\.response/.test(list));
  check("detail verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(detail) && /return\s+guard\.response/.test(detail));
  check("runtime nodejs", /runtime\s*=\s*"nodejs"/.test(list) && /runtime\s*=\s*"nodejs"/.test(detail));

  console.log("\n[B] Canonical 19 alan + fail-closed + explicit SELECT");
  check("YEBS_CONCEPT_RELATION_SOURCE_COLUMNS açık liste, select * yok",
    /YEBS_CONCEPT_RELATION_SOURCE_COLUMNS\s*=\s*\n?\s*"id, concept_relation_id, source_id, evidence_layer,[\s\S]*?created_at, updated_at"/.test(svc) && !/\.select\(\s*["'`]\*/.test(svc));
  for (const f of CANON) check(`canonical guard alanı: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("evidence_layer string guard (nullable değil)", /isStr\(o\.evidence_layer\)/.test(svc));
  check("nullable alan string|null guard (rationale/excerpt)", /isStrOrNull\(o\.rationale\)/.test(svc) && /isStrOrNull\(o\.source_original_excerpt\)/.test(svc));
  check("fail-closed list (every isCanonicalRelationSourceRow)", /rows\.every\(isCanonicalRelationSourceRow\)/.test(svc));

  console.log("\n[C] Enum kümeleri exact");
  check("YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS 9 değer", (svc.match(/YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 9);
  check("evidence 9 exact", ["classical_textual", "traditional", "ethnographic", "clinical", "experimental", "scientific_review", "regulatory", "experiential", "energetic_metaphysical"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CONCEPT_RELATION_SOURCE_ROLES 4 değer", (svc.match(/YEBS_CONCEPT_RELATION_SOURCE_ROLES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 4);
  check("role 4 exact", ["primary_support", "supporting", "contradiction", "context"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES 2 değer", (svc.match(/YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 2);
  check("rationale_status 2 exact", ["from_source", "source_gives_no_rationale"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CONCEPT_RELATION_SOURCE_VERIFICATION_STATUSES 3 değer", (svc.match(/YEBS_CONCEPT_RELATION_SOURCE_VERIFICATION_STATUSES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 3);
  check("verification 3 exact", ["unverified", "verified", "rejected"].every(t => new RegExp(`"${t}"`).test(svc)));

  console.log("\n[D] Deterministik sıra + parent-scope + JOIN yok");
  check("order created_at DESC", /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("order id DESC tiebreak", /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("collection concept_relation_id ile sınırlı", /\.eq\("concept_relation_id",\s*relationId\)/.test(svc));
  check("parent Relation existence kontrolü (404)", /from\("yebs_concept_relations"\)\s*\.select\("id"\)\s*\.eq\("id",\s*relationId\)/.test(svc) && /YEBS_RELATION_SOURCE_RELATION_NOT_FOUND/.test(svc));
  check("service Source JOIN/rpc/mutation YOK", !/\.rpc\(/.test(svc) && !/\.(insert|update|delete|upsert)\s*\(/.test(svc) && !/yebs_sources/.test(svc));
  check("evidence_layer varlık filtresi", /\.eq\("evidence_layer",\s*filters\.evidenceLayer\)/.test(svc));
  check("has_excerpt/has_translation varlık filtresi", /source_original_excerpt", "is", null/.test(svc) && /faithful_translation", "is", null/.test(svc));
  check("usage count YOK (yorum-dışı kod)", !/usage/i.test(svc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

  console.log("\n[E] Filtre kesinliği + detail aidiyet (route/service)");
  check("collection relationId strict UUID", /UUID_RE\.test\(relationId\)/.test(list));
  check("source_id strict UUID", /UUID_RE\.test\(rawSource\)/.test(list));
  check("evidence_layer enum doğrulama", /YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("source_role enum doğrulama", /YEBS_CONCEPT_RELATION_SOURCE_ROLES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("rationale_status enum doğrulama", /YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("verification_status enum doğrulama", /YEBS_CONCEPT_RELATION_SOURCE_VERIFICATION_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("has_* yalnız true/false", /raw === "true"[\s\S]*?raw === "false"/.test(list));
  check("limit 1..200 default 50", /DEFAULT_LIMIT\s*=\s*50/.test(list) && /MAX_LIMIT\s*=\s*200/.test(list));
  check("invalid query → 400", /status:\s*400/.test(list));
  check("detail her iki UUID strict", /UUID_RE\.test\(relationId\) \|\| !UUID_RE\.test\(relationSourceId\)/.test(detail));
  check("detail path aidiyeti (service concept_relation_id eşleşmesi)", /data\.concept_relation_id !== relationId/.test(svc));
  check("detail 404 map", /YEBS_RELATION_SOURCE_NOT_FOUND[\s\S]*?status:\s*404/.test(detail));
  check("collection parent 404 map", /YEBS_RELATION_SOURCE_RELATION_NOT_FOUND[\s\S]*?status:\s*404/.test(list));
}

console.log("\n[F] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, ""); const rid = "00000000-0000-4000-8000-000000000000";
  for (const [n, u] of [["list GET 401", `${base}/api/admin/yebs/relations/${rid}/sources`], ["detail GET 401", `${base}/api/admin/yebs/relations/${rid}/sources/${rid}`]]) {
    try { const r = await fetch(u); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
