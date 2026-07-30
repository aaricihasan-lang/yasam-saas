// ============================================================
// YEBS API-A4AR — Claims SALT-OKUNUR API harness'i (statik kaynak sözleşmesi). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/claims/route.ts",
  detailRoute: "app/api/admin/yebs/claims/[id]/route.ts",
  service: "lib/yebs/service/claims.ts",
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
  const CANON = ["id", "concept_id", "claim_type", "claim_text", "provenance_kind", "evidence_layer", "outcome_type", "safety_topic", "status", "created_at", "updated_at"];

  console.log("\n[A] HTTP fiil + auth");
  check("list GET export", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("list POST export (create)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  for (const v of ["PUT", "PATCH", "DELETE"]) check(`list ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(list));
  check("detail GET export", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  check("detail PATCH export (update)", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
  for (const v of ["POST", "PUT", "DELETE"]) check(`detail ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(detail));
  check("DELETE hiç yok (A4A kapsam dışı)", !/function\s+DELETE/.test(list) && !/function\s+DELETE/.test(detail));
  check("list verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(list) && /return\s+guard\.response/.test(list));
  check("detail verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(detail) && /return\s+guard\.response/.test(detail));
  check("runtime nodejs", /runtime\s*=\s*"nodejs"/.test(list) && /runtime\s*=\s*"nodejs"/.test(detail));

  console.log("\n[B] Canonical 11 alan + fail-closed + explicit SELECT");
  check("YEBS_CLAIM_COLUMNS açık liste, select * yok",
    /YEBS_CLAIM_COLUMNS\s*=\s*\n?\s*"id, concept_id, claim_type,[\s\S]*?created_at, updated_at"/.test(svc) && !/\.select\(\s*["'`]\*/.test(svc));
  for (const f of CANON) check(`canonical guard alanı: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("outcome_type/safety_topic string|null guard", /isStrOrNull\(o\.outcome_type\)/.test(svc) && /isStrOrNull\(o\.safety_topic\)/.test(svc));
  check("fail-closed list (every isCanonicalClaimRow)", /rows\.every\(isCanonicalClaimRow\)/.test(svc));
  check("fail-closed detail (isCanonicalClaimRow)", /if \(!isCanonicalClaimRow\(data\)\)/.test(svc));

  console.log("\n[C] Enum kümeleri exact");
  check("YEBS_CLAIM_TYPES 6 değer", (svc.match(/YEBS_CLAIM_TYPES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 6);
  check("claim_type 6 exact", ["identity", "function", "relationship", "practice", "safety", "research_finding"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CLAIM_PROVENANCE_KINDS 4 değer", (svc.match(/YEBS_CLAIM_PROVENANCE_KINDS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 4);
  check("provenance 4 exact", ["source_original", "faithful_translation", "editorial_explanation", "editorial_interpretation"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CLAIM_EVIDENCE_LAYERS 9 değer", (svc.match(/YEBS_CLAIM_EVIDENCE_LAYERS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 9);
  check("evidence 9 exact", ["classical_textual", "traditional", "ethnographic", "clinical", "experimental", "scientific_review", "regulatory", "experiential", "energetic_metaphysical"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_CLAIM_STATUSES 7 değer", (svc.match(/YEBS_CLAIM_STATUSES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 7);
  check("status 7 exact (archived dahil)", ["draft", "under_review", "needs_verification", "verified", "approved", "published", "archived"].every(t => new RegExp(`"${t}"`).test(svc)));

  console.log("\n[D] Deterministik sıra + q(yalnız claim_text) + JOIN yok");
  check("order created_at DESC", /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("order id DESC tiebreak", /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("q YALNIZ claim_text ilike", /\.ilike\("claim_text",\s*`%\$\{filters\.q\}%`\)/.test(svc));
  check("q başka alanda aranmıyor (title/authors yok)", !/\.ilike\("(title|authors|organization|publisher)"/.test(svc));
  check("service JOIN/rpc/mutation YOK", !/\.rpc\(/.test(svc) && !/\.(insert|update|delete|upsert)\s*\(/.test(svc));
  check("claim_sources/concept adı/label gömülmüyor", !/yebs_claim_sources|yebs_concepts\b|concept_label|\.select\([^)]*\(/.test(svc));
  check("source usage count YOK", !/usage|count.*source|source.*count/i.test(svc.replace(/count: "exact"/g, "")));

  console.log("\n[E] Filtre kesinliği (route)");
  check("concept_id strict UUID", /UUID_RE\.test\(rawConcept\)/.test(list));
  check("claim_type enum doğrulama", /YEBS_CLAIM_TYPES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("provenance_kind enum doğrulama", /YEBS_CLAIM_PROVENANCE_KINDS\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("evidence_layer enum doğrulama", /YEBS_CLAIM_EVIDENCE_LAYERS\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("status enum doğrulama", /YEBS_CLAIM_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("outcome_type enum doğrulama", /YEBS_CLAIM_OUTCOME_TYPES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("safety_topic snake_case", /SAFETY_TOPIC_RE\.test\(rawSafety\)/.test(list));
  check("q max 100 + arındırma", /MAX_Q_LEN\s*=\s*100/.test(list) && /replace\(\/\[,\(\)\*%\]\/g,\s*""\)/.test(list));
  check("limit 1..200 default 50", /DEFAULT_LIMIT\s*=\s*50/.test(list) && /MAX_LIMIT\s*=\s*200/.test(list));
  check("offset ≥0 integer", /!Number\.isInteger\(n\) \|\| n < 0/.test(list));
  check("invalid query → 400", /status:\s*400/.test(list));

  console.log("\n[F] Detail 404 + UUID");
  check("getClaimById NOT_FOUND", /YEBS_CLAIM_NOT_FOUND/.test(svc));
  check("detail 404 map", /YEBS_CLAIM_NOT_FOUND[\s\S]*?status:\s*404/.test(detail));
  check("detail invalid UUID 400", /YEBS_INVALID_CLAIM_ID[\s\S]*?status:\s*400/.test(detail));

  console.log("\n[G] A4B kapsam dışı (bu turda Claim Sources yok)");
  check("route'larda claim-sources yolu yok", !/claim-sources|\/sources/.test(list) && !/claim-sources|\/sources/.test(detail));
  check("service'te claim source implementasyonu yok", !/claimSource|claim_source/i.test(svc));
}

console.log("\n[H] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, "");
  for (const [n, u] of [["list GET 401", `${base}/api/admin/yebs/claims`], ["detail GET 401", `${base}/api/admin/yebs/claims/00000000-0000-4000-8000-000000000000`]]) {
    try { const r = await fetch(u); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
