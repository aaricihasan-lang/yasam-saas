// ============================================================
// YEBS API-A3R — Sources SALT-OKUNUR API harness'i (statik kaynak sözleşmesi). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/sources/route.ts",
  detailRoute: "app/api/admin/yebs/sources/[id]/route.ts",
  service: "lib/yebs/service/sources.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k,v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

check("hedef dosyalar mevcut", Object.values(P).every(existsSync));
let list = "", detail = "", svc = "";
try { list = readFileSync(P.listRoute,"utf8"); detail = readFileSync(P.detailRoute,"utf8"); svc = readFileSync(P.service,"utf8"); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (list && detail && svc) {
  const CANON = ["id","source_type","title","language_tag","script_code","authors","organization","publisher","publication_year","dating_note","edition","doi","pmid","isbn","url","document_no","tradition_context_id","status","notes","created_at","updated_at","accessed_on"];

  console.log("\n[A] HTTP fiil + auth");
  check("list GET export", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("list POST export (create)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  for (const v of ["PUT","PATCH","DELETE"]) check(`list ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(list));
  check("detail GET export", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  check("detail PATCH export (update)", /export\s+async\s+function\s+PATCH\s*\(/.test(detail));
  for (const v of ["POST","PUT","DELETE"]) check(`detail ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(detail));
  check("DELETE hiç yok (A3 kapsam dışı)", !/function\s+DELETE/.test(list) && !/function\s+DELETE/.test(detail));
  check("list verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(list) && /return\s+guard\.response/.test(list));
  check("detail verifyAdminRequest + guard.response", /verifyAdminRequest\s*\(/.test(detail) && /return\s+guard\.response/.test(detail));
  check("runtime nodejs", /runtime\s*=\s*"nodejs"/.test(list) && /runtime\s*=\s*"nodejs"/.test(detail));

  console.log("\n[B] Canonical 22 alan + accessed_on + fail-closed");
  check("YEBS_SOURCE_COLUMNS accessed_on dahil, select * yok",
    /YEBS_SOURCE_COLUMNS\s*=\s*\n?\s*"id, source_type,[\s\S]*?updated_at, accessed_on"/.test(svc) && !/\.select\(\s*["'`]\*/.test(svc));
  for (const f of CANON) check(`canonical guard alanı: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("publication_year number|null guard", /isNumOrNull\(o\.publication_year\)/.test(svc));
  check("accessed_on string|null guard", /isStrOrNull\(o\.accessed_on\)/.test(svc));
  check("fail-closed (every isCanonicalSourceRow)", /rows\.every\(isCanonicalSourceRow\)/.test(svc));

  console.log("\n[C] source_type 17 enum + status 5 enum");
  check("YEBS_SOURCE_TYPES 17 değer", (svc.match(/YEBS_SOURCE_TYPES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g)||[]).length === 17);
  check("yeni 6 tür mevcut", ["institutional_report","archival_document","media_recording","interview_record","field_observation_record","experiential_record"].every(t => new RegExp(`"${t}"`).test(svc)));
  check("YEBS_SOURCE_STATUSES 5 değer (archived dahil)", (svc.match(/YEBS_SOURCE_STATUSES = \[([\s\S]*?)\]/)?.[1].match(/"[a-z]+"/g)||[]).length === 5 && /"archived"/.test(svc));

  console.log("\n[D] Deterministik sıra + q + JOIN yok");
  check("order created_at DESC", /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check("order id DESC tiebreak", /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  const qFields = ["title","authors","organization","publisher","doi","pmid","isbn","document_no","url"];
  check("q 9 künye alanında ilike OR", qFields.every(f => new RegExp(`${f}\\.ilike`).test(svc)));
  check("service JOIN/rpc/mutation YOK", !/\.rpc\(/.test(svc) && !/\.(insert|update|delete|upsert)\s*\(/.test(svc));
  check("claim/relation/junction gömülmüyor", !/yebs_claim_sources|yebs_concept_relation_sources|yebs_claims|yebs_concept_relations/.test(svc));

  console.log("\n[E] Filtre kesinliği (route)");
  check("source_type enum doğrulama", /YEBS_SOURCE_TYPES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("status enum doğrulama", /YEBS_SOURCE_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("publication_year integer -3000..2100", /n < -3000 \|\| n > 2100/.test(list));
  check("has_* yalnız true/false", /raw === "true"[\s\S]*?raw === "false"/.test(list));
  check("tradition_context_id strict UUID", /UUID_RE\.test\(rawTrad\)/.test(list));
  check("q max 100 + arındırma", /MAX_Q_LEN\s*=\s*100/.test(list) && /replace\(\/\[,\(\)\*%\]\/g,\s*""\)/.test(list));
  check("limit 1..200 default 50", /DEFAULT_LIMIT\s*=\s*50/.test(list) && /MAX_LIMIT\s*=\s*200/.test(list));
  check("invalid query → 400", /status:\s*400/.test(list));

  console.log("\n[F] Detail 404 + UUID");
  check("getSourceById NOT_FOUND", /YEBS_SOURCE_NOT_FOUND/.test(svc));
  check("detail 404 map", /YEBS_SOURCE_NOT_FOUND[\s\S]*?status:\s*404/.test(detail));
  check("detail invalid UUID 400", /YEBS_INVALID_SOURCE_ID[\s\S]*?status:\s*400/.test(detail));
}

console.log("\n[G] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, "");
  for (const [n,u] of [["list GET 401",`${base}/api/admin/yebs/sources`],["detail GET 401",`${base}/api/admin/yebs/sources/00000000-0000-4000-8000-000000000000`]]) {
    try { const r = await fetch(u); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
