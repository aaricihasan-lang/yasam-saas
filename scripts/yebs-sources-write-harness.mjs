// ============================================================
// YEBS API-A3 — Source MUTATION route/service sözleşme + değişmezlik harness'i.
// SALT-OKUNUR. Mutation/RPC çağrısı YAPMAZ. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/sources/route.ts",
  detailRoute: "app/api/admin/yebs/sources/[id]/route.ts",
  mut: "lib/yebs/service/sourceMutations.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k,v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

check("hedef dosyalar mevcut", Object.values(P).every(existsSync));
const S = {};
try { for (const [k,p] of Object.entries(P)) S[k] = readFileSync(p,"utf8"); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (Object.keys(S).length === 3) {
  console.log("\n[A] Auth + actor + fiiller");
  for (const [k,verbs] of [["listRoute",["POST"]],["detailRoute",["PATCH"]]]) {
    check(`${k}: verifyAdminRequest`, /verifyAdminRequest\s*\(/.test(S[k]));
    check(`${k}: actor guard.adminId`, /const \{ adminId, db \} = guard/.test(S[k]));
    for (const v of verbs) check(`${k}: ${v} export`, new RegExp(`export\\s+async\\s+function\\s+${v}\\s*\\(`).test(S[k]));
  }
  check("detailRoute DELETE YOK", !/function\s+DELETE/.test(S.detailRoute));

  console.log("\n[B] Body allowlist");
  check("create allowlist 19 anahtar", (S.listRoute.match(/ALLOWED_BODY_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g)||[]).length === 19);
  check("create required source_type/title/language_tag", /for \(const key of \["source_type", "title", "language_tag"\]/.test(S.listRoute));
  {
    const m = S.listRoute.match(/ALLOWED_BODY_KEYS = \[([^\]]*)\]/);
    check("create allowlist status/id/timestamp/actor İÇERMİYOR", m && !/"status"|"id"|"created_at"|"updated_at"|"actor|request_id|operation_id/.test(m[1]));
  }
  check("update allowlist 20 (expected+reason+18)", (S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g)||[]).length === 20);
  {
    const m = S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/);
    check("update allowlist status/id/timestamps İÇERMİYOR", m && !/"status"|"\bid\b"|"created_at"|"updated_at"/.test(m[1]));
  }
  for (const k of ["listRoute","detailRoute"]) {
    check(`${k}: unknown key → invalid`, /if \(!allowed\.has\(key\)\) return invalid/.test(S[k]));
    check(`${k}: array/null body reddi`, /Array\.isArray\(body\)/.test(S[k]));
  }

  console.log("\n[C] Strict tip + coercion yok");
  check("create publication_year number integer (string reddi)", /typeof v === "number" && Number\.isInteger\(v\) && v >= -3000 && v <= 2100/.test(S.listRoute));
  check("create accessed_on YYYY-MM-DD gerçek takvim", /isValidYmd/.test(S.listRoute) && /daysInMonth/.test(S.listRoute));
  check("create tradition_context_id strict UUID", /UUID_RE\.test\(v\)/.test(S.listRoute));
  check("update expected_updated_at strict tz + takvim", /isValidExpectedUpdatedAt/.test(S.detailRoute) && /daysInMonth/.test(S.detailRoute));
  check("update publication_year integer|null (string reddi)", /typeof v === "number" && Number\.isInteger\(v\)/.test(S.detailRoute));
  check("update accessed_on YYYY-MM-DD", /isValidYmd/.test(S.detailRoute));
  check("update en az bir mutable alan (empty patch reddi)", /Object\.keys\(patch\)\.length === 0/.test(S.detailRoute));

  console.log("\n[D] Service RPC-only + ayrı UUID + guard");
  check("server-only", /import "server-only"/.test(S.mut));
  check("doğrudan insert/update/delete YOK", !/\.(insert|update|delete|upsert)\s*\(/.test(S.mut));
  check("create rpc çağrısı", /\.rpc\("yebs_create_source_with_audit"/.test(S.mut));
  check("update rpc çağrısı", /\.rpc\("yebs_update_source_with_audit"/.test(S.mut));
  check("request_id ≠ operation_id (iki randomUUID)", /const requestId = crypto\.randomUUID\(\);\s*const operationId = crypto\.randomUUID\(\);/.test(S.mut));
  check("Set.has exact sınıflandırma (includes/regex yok)", /\.has\(msg as/.test(S.mut) && !/\.includes\(msg/.test(S.mut));
  check("canonical row guard", /isCanonicalSourceRow/.test(S.mut));
  check("exact RPC param (p_accessed_on, p_publication_year)", /p_accessed_on: input\.accessedOn/.test(S.mut) && /p_publication_year: input\.publicationYear/.test(S.mut));

  console.log("\n[E] Hata matrisi + wrapper");
  check("create 201 wrapper", /ok: true, row: result\.row \}, \{ status: 201 \}/.test(S.listRoute));
  check("update 200 wrapper", /ok: true, row: result\.row \}, \{ status: 200 \}/.test(S.detailRoute));
  check("DOI duplicate 409", /YEBS_SOURCE_DOI_DUPLICATE[\s\S]*?status:\s*409/.test(S.listRoute));
  check("PMID duplicate 409", /YEBS_SOURCE_PMID_DUPLICATE[\s\S]*?status:\s*409/.test(S.listRoute));
  check("tradition not found 404", /YEBS_SOURCE_TRADITION_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute));
  check("status locked 409 (update)", /YEBS_SOURCE_STATUS_LOCKED[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("stale 409 (update)", /YEBS_SOURCE_STALE_UPDATE[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("no-changes 409 (update)", /YEBS_SOURCE_NO_CHANGES[\s\S]*?status:\s*409/.test(S.detailRoute));
  for (const k of ["listRoute","detailRoute"]) check(`${k}: ADMIN → FORBIDDEN 403`, /YEBS_ADMIN_FORBIDDEN"[\s\S]*?status:\s*403/.test(S[k]));

  console.log("\n[F] Ham DB sızıntısı yok");
  check("service error.message yalnız console.error", /console\.error\([^)]*error\.message/.test(S.mut));
  check("kod sabit union (message döndürmüyor)", !/code: error\.message/.test(S.mut));
}

console.log("\n[G] D5 + A0/A1/A2 + junction git-blob DEĞİŞMEZLİĞİ");
const FROZEN = [
  "supabase/migrations/20260728000000_yebs_sources.sql",
  "supabase/migrations/20260730000000_yebs_claim_sources.sql",
  "supabase/migrations/20260801000000_yebs_concept_relation_sources.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260822000000_yebs_concept_mutations.sql",
  "supabase/migrations/20260823000000_yebs_concept_label_mutations.sql",
  "supabase/migrations/20260814000000_yebs_create_school_with_audit.sql",
  "supabase/migrations/20260821000000_yebs_update_school_with_audit.sql",
  "lib/auth/adminGuard.ts",
  "lib/yebs/service/concepts.ts",
  "lib/yebs/service/schools.ts",
  "package.json",
  "package-lock.json",
];
function gitBlob(ref, path) {
  try { return execFileSync("git", ["rev-parse", `${ref}:${path}`], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return null; }
}
let drift = false;
for (const rel of FROZEN) {
  const base = gitBlob("origin/main", rel), head = gitBlob("HEAD", rel);
  if (base === null) { skipped(`blob ${rel}`, "origin/main'de yok"); continue; }
  if (base !== head) { bad(`DEĞİŞMEZLİK ihlali: ${rel}`); drift = true; }
}
if (!drift) ok("D5 + A0/A1/A2 + junction + adminGuard + package blob'ları origin/main ile AYNI");

console.log("\n[H] Migration timestamp + canlı 401");
check("20260826000000 migration mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260826000000_yebs_source_mutations.sql")));
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, ""); const sid = "00000000-0000-4000-8000-000000000000";
  for (const [n,u,method] of [["POST sources 401",`${base}/api/admin/yebs/sources`,"POST"],["PATCH source 401",`${base}/api/admin/yebs/sources/${sid}`,"PATCH"]]) {
    try { const r = await fetch(u,{method,headers:{"content-type":"application/json"},body:"{}"}); check(n, r.status===401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
