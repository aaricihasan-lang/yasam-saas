// ============================================================
// YEBS API-A5A — Concept Relation MUTATION route/service sözleşme + değişmezlik harness'i.
// SALT-OKUNUR. Mutation/RPC çağrısı YAPMAZ. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/relations/route.ts",
  detailRoute: "app/api/admin/yebs/relations/[id]/route.ts",
  mut: "lib/yebs/service/conceptRelationMutations.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k, v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

check("hedef dosyalar mevcut", Object.values(P).every(existsSync));
const S = {};
try { for (const [k, p] of Object.entries(P)) S[k] = readFileSync(p, "utf8"); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (Object.keys(S).length === 3) {
  console.log("\n[A] Auth + actor + fiiller");
  for (const [k, verbs] of [["listRoute", ["POST"]], ["detailRoute", ["PATCH"]]]) {
    check(`${k}: verifyAdminRequest`, /verifyAdminRequest\s*\(/.test(S[k]));
    check(`${k}: actor guard.adminId`, /const \{ adminId, db \} = guard/.test(S[k]));
    for (const v of verbs) check(`${k}: ${v} export`, new RegExp(`export\\s+async\\s+function\\s+${v}\\s*\\(`).test(S[k]));
  }
  check("detailRoute DELETE YOK", !/function\s+DELETE/.test(S.detailRoute));
  check("/sources yolu YOK (A5B ayrı)", !/\/sources\b/.test(S.listRoute) && !/\/sources\b/.test(S.detailRoute));

  console.log("\n[B] Body allowlist + key sayıları");
  check("create allowlist 4 anahtar", (S.listRoute.match(/ALLOWED_BODY_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 4);
  check("create required 3 (source/target/relation_type)", /for \(const key of \["source_concept_id", "target_concept_id", "relation_type"\]/.test(S.listRoute));
  {
    const m = S.listRoute.match(/ALLOWED_BODY_KEYS = \[([^\]]*)\]/);
    check("create allowlist status/id/timestamp İÇERMİYOR", m && !/"status"|"\bid\b"|"created_at"|"updated_at"/.test(m[1]));
  }
  check("update allowlist 3 (expected+reason+relation_type)", (S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 3);
  {
    const m = S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/);
    check("update allowlist source/target/status/id/timestamps İÇERMİYOR", m && !/"source_concept_id"|"target_concept_id"|"status"|"\bid\b"|"created_at"|"updated_at"/.test(m[1]));
  }
  for (const k of ["listRoute", "detailRoute"]) {
    check(`${k}: unknown key → invalid`, /if \(!allowed\.has\(key\)\) return invalid/.test(S[k]));
    check(`${k}: array/null body reddi`, /Array\.isArray\(body\)/.test(S[k]));
  }

  console.log("\n[C] Strict tip + enum + self-relation");
  check("create source/target UUID", /UUID_RE\.test\(sourceConceptId\)/.test(S.listRoute) && /UUID_RE\.test\(targetConceptId\)/.test(S.listRoute));
  check("create self-relation reddi", /sourceConceptId === targetConceptId\) return invalidBody/.test(S.listRoute));
  check("create relation_type enum", /YEBS_CONCEPT_RELATION_TYPES as readonly string\[\]\)\.includes\(relationType\)/.test(S.listRoute));
  check("update relation_type enum + expected_updated_at", /YEBS_CONCEPT_RELATION_TYPES as readonly string\[\]\)\.includes\(v\)/.test(S.detailRoute) && /isValidExpectedUpdatedAt/.test(S.detailRoute));
  check("update reason zorunlu + kontrol reddi", /reason\.trim\(\) === "" \|\| reason\.length > REASON_MAX_LEN \|\| hasHarmfulControl\(reason\)/.test(S.detailRoute));
  check("update en az bir mutable (empty patch reddi)", /Object\.keys\(patch\)\.length === 0/.test(S.detailRoute));
  check("kontrol karakteri regex (tab/LF/CR hariç)", /\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\]/.test(S.listRoute) && /\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\]/.test(S.detailRoute));

  console.log("\n[D] Service RPC-only + ayrı UUID + guard");
  check("server-only", /import "server-only"/.test(S.mut));
  check("doğrudan insert/update/delete YOK", !/\.(insert|update|delete|upsert)\s*\(/.test(S.mut));
  check("create rpc çağrısı", /\.rpc\("yebs_create_concept_relation_with_audit"/.test(S.mut));
  check("update rpc çağrısı", /\.rpc\("yebs_update_concept_relation_with_audit"/.test(S.mut));
  check("request_id ≠ operation_id (iki randomUUID)", (S.mut.match(/const requestId = crypto\.randomUUID\(\);\s*const operationId = crypto\.randomUUID\(\);/g) || []).length === 2);
  check("Set.has exact sınıflandırma", /\.has\(msg as/.test(S.mut) && !/\.includes\(msg/.test(S.mut));
  check("canonical row guard", /isCanonicalRelationRow/.test(S.mut));
  check("RPC param p_source_concept_id/p_relation_type", /p_source_concept_id: input\.sourceConceptId/.test(S.mut) && /p_relation_type: input\.relationType/.test(S.mut));

  console.log("\n[E] Hata matrisi + wrapper");
  check("create 201 wrapper", /ok: true, row: result\.row \}, \{ status: 201 \}/.test(S.listRoute));
  check("update 200 wrapper", /ok: true, row: result\.row \}, \{ status: 200 \}/.test(S.detailRoute));
  check("source/target not found 404", /YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute));
  check("cross-tradition/mirror/hierarchy/duplicate 409 (create)", /YEBS_CONCEPT_RELATION_CROSS_TRADITION[\s\S]*?status:\s*409/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE[\s\S]*?status:\s*409/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT[\s\S]*?status:\s*409/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_DUPLICATE[\s\S]*?status:\s*409/.test(S.listRoute));
  check("has_sources/stale/locked/no-op 409 (update)", /YEBS_CONCEPT_RELATION_HAS_SOURCES[\s\S]*?status:\s*409/.test(S.detailRoute) && /YEBS_CONCEPT_RELATION_STALE_UPDATE[\s\S]*?status:\s*409/.test(S.detailRoute) && /YEBS_CONCEPT_RELATION_STATUS_LOCKED[\s\S]*?status:\s*409/.test(S.detailRoute) && /YEBS_CONCEPT_RELATION_NO_CHANGES[\s\S]*?status:\s*409/.test(S.detailRoute));
  for (const k of ["listRoute", "detailRoute"]) check(`${k}: ADMIN → FORBIDDEN 403`, /YEBS_ADMIN_FORBIDDEN"[\s\S]*?status:\s*403/.test(S[k]));

  console.log("\n[F] Ham DB sızıntısı + inverse/cycle koruması");
  check("service error.message yalnız console.error", /console\.error\([^)]*error\.message/.test(S.mut));
  check("kod sabit union (message döndürmüyor)", !/code: error\.message/.test(S.mut));
  {
    const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    check("route/service inverse row/cycle YOK (yorum-dışı kod)",
      !/inverse/i.test(strip(S.listRoute)) && !/inverse/i.test(strip(S.mut)) && !/RECURSIVE/i.test(strip(S.mut)));
  }
}

console.log("\n[G] D8/D9 + AUD1 + A0/A1/A2/A3/A4 + adminGuard + package git-blob DEĞİŞMEZLİĞİ");
const FROZEN = [
  "supabase/migrations/20260731000000_yebs_concept_relations.sql",
  "supabase/migrations/20260801000000_yebs_concept_relation_sources.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260728000000_yebs_sources.sql",
  "supabase/migrations/20260826000000_yebs_source_mutations.sql",
  "supabase/migrations/20260828000000_yebs_claim_mutations.sql",
  "supabase/migrations/20260902000000_yebs_claim_source_mutations.sql",
  "supabase/migrations/20260822000000_yebs_concept_mutations.sql",
  "lib/auth/adminGuard.ts",
  "lib/yebs/service/sources.ts",
  "lib/yebs/service/claims.ts",
  "lib/yebs/service/claimSources.ts",
  "lib/yebs/service/concepts.ts",
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
if (!drift) ok("D8/D9 + AUD1 + A0-A4 + adminGuard + package blob'ları origin/main ile AYNI");

console.log("\n[H] Migration timestamp + canlı 401");
check("20260906000000 migration mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260906000000_yebs_concept_relation_mutations.sql")));
check("20260908000000 (A5B) bu turda YOK", !existsSync(resolve(ROOT, "supabase/migrations/20260908000000_yebs_concept_relation_source_mutations.sql")));
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, ""); const rid = "00000000-0000-4000-8000-000000000000";
  for (const [n, u, method] of [["POST relations 401", `${base}/api/admin/yebs/relations`, "POST"], ["PATCH relation 401", `${base}/api/admin/yebs/relations/${rid}`, "PATCH"]]) {
    try { const r = await fetch(u, { method, headers: { "content-type": "application/json" }, body: "{}" }); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
