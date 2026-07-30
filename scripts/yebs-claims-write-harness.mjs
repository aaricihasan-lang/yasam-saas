// ============================================================
// YEBS API-A4A — Claim MUTATION route/service sözleşme + değişmezlik harness'i.
// SALT-OKUNUR. Mutation/RPC çağrısı YAPMAZ. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/claims/route.ts",
  detailRoute: "app/api/admin/yebs/claims/[id]/route.ts",
  mut: "lib/yebs/service/claimMutations.ts",
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
  check("Claim Sources endpoint/yol YOK", !/claim-sources|\/sources/.test(S.listRoute) && !/claim-sources|\/sources/.test(S.detailRoute));

  console.log("\n[B] Body allowlist");
  check("create allowlist 8 anahtar", (S.listRoute.match(/ALLOWED_BODY_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 8);
  check("create required 5 (concept_id/claim_type/claim_text/provenance_kind/evidence_layer)", /for \(const key of \["concept_id", "claim_type", "claim_text", "provenance_kind", "evidence_layer"\]/.test(S.listRoute));
  {
    const m = S.listRoute.match(/ALLOWED_BODY_KEYS = \[([^\]]*)\]/);
    check("create allowlist status/id/timestamp/actor İÇERMİYOR", m && !/"status"|"id"|"created_at"|"updated_at"|"actor|request_id|operation_id/.test(m[1]));
  }
  check("update allowlist 8 (expected+reason+6)", (S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 8);
  {
    const m = S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/);
    check("update allowlist concept_id/status/id/timestamps İÇERMİYOR", m && !/"concept_id"|"status"|"\bid\b"|"created_at"|"updated_at"/.test(m[1]));
  }
  for (const k of ["listRoute", "detailRoute"]) {
    check(`${k}: unknown key → invalid`, /if \(!allowed\.has\(key\)\) return invalid/.test(S[k]));
    check(`${k}: array/null body reddi`, /Array\.isArray\(body\)/.test(S[k]));
  }

  console.log("\n[C] Strict tip + enum + coupling + claim_text");
  check("create claim_type/provenance/evidence enum kontrolü", /YEBS_CLAIM_TYPES as readonly string\[\]\)\.includes\(claimType\)/.test(S.listRoute) && /YEBS_CLAIM_PROVENANCE_KINDS as readonly string\[\]\)\.includes\(provenanceKind\)/.test(S.listRoute) && /YEBS_CLAIM_EVIDENCE_LAYERS as readonly string\[\]\)\.includes\(evidenceLayer\)/.test(S.listRoute));
  check("create concept_id UUID", /UUID_RE\.test\(conceptId\)/.test(S.listRoute));
  check("create claim_text ≤20000 + kontrol karakteri reddi", /CLAIM_TEXT_MAX\s*=\s*20000/.test(S.listRoute) && /hasHarmfulControl\(claimText\)/.test(S.listRoute));
  check("create COUPLING (safety/research/diğer)", /claimType === "safety"[\s\S]*?SAFETY_TOPIC_RE\.test\(safetyTopic\)[\s\S]*?SAFETY_OUTCOME_TYPES[\s\S]*?claimType === "research_finding"[\s\S]*?RESEARCH_OUTCOME_TYPES/.test(S.listRoute));
  check("update expected_updated_at strict tz + takvim", /isValidExpectedUpdatedAt/.test(S.detailRoute) && /daysInMonth/.test(S.detailRoute));
  check("update reason zorunlu + kontrol karakteri reddi", /reason\.trim\(\) === "" \|\| reason\.length > REASON_MAX_LEN \|\| hasHarmfulControl\(reason\)/.test(S.detailRoute));
  check("update claim_text present ≤20000 + kontrol reddi", /t === "" \|\| t\.length > CLAIM_TEXT_MAX \|\| hasHarmfulControl\(t\)/.test(S.detailRoute));
  check("update enum present kontrolü", /ENUM_STRING_KEYS\[key\]\.includes\(v\)/.test(S.detailRoute));
  check("update en az bir mutable alan (empty patch reddi)", /Object\.keys\(patch\)\.length === 0/.test(S.detailRoute));
  check("kontrol karakteri regex (tab/LF/CR hariç)", /\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\]/.test(S.listRoute) && /\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\]/.test(S.detailRoute));

  console.log("\n[D] Service RPC-only + ayrı UUID + guard");
  check("server-only", /import "server-only"/.test(S.mut));
  check("doğrudan insert/update/delete YOK", !/\.(insert|update|delete|upsert)\s*\(/.test(S.mut));
  check("create rpc çağrısı", /\.rpc\("yebs_create_claim_with_audit"/.test(S.mut));
  check("update rpc çağrısı", /\.rpc\("yebs_update_claim_with_audit"/.test(S.mut));
  check("request_id ≠ operation_id (iki randomUUID)", /const requestId = crypto\.randomUUID\(\);\s*const operationId = crypto\.randomUUID\(\);/.test(S.mut));
  check("Set.has exact sınıflandırma (includes/regex yok)", /\.has\(msg as/.test(S.mut) && !/\.includes\(msg/.test(S.mut));
  check("canonical row guard", /isCanonicalClaimRow/.test(S.mut));
  check("exact RPC param (p_concept_id, p_safety_topic)", /p_concept_id: input\.conceptId/.test(S.mut) && /p_safety_topic: input\.safetyTopic/.test(S.mut));
  check("update RPC param p_patch/p_expected_updated_at", /p_patch: patch/.test(S.mut) && /p_expected_updated_at: expectedUpdatedAt/.test(S.mut));

  console.log("\n[E] Hata matrisi + wrapper");
  check("create 201 wrapper", /ok: true, row: result\.row \}, \{ status: 201 \}/.test(S.listRoute));
  check("update 200 wrapper", /ok: true, row: result\.row \}, \{ status: 200 \}/.test(S.detailRoute));
  check("concept not found 404", /YEBS_CLAIM_CONCEPT_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute));
  check("invalid claim input 400 (create)", /YEBS_INVALID_CLAIM_INPUT[\s\S]*?status:\s*400/.test(S.listRoute));
  check("status locked 409 (update)", /YEBS_CLAIM_STATUS_LOCKED[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("stale 409 (update)", /YEBS_CLAIM_STALE_UPDATE[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("no-changes 409 (update)", /YEBS_CLAIM_NO_CHANGES[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("not found 404 (update)", /YEBS_CLAIM_NOT_FOUND[\s\S]*?status:\s*404/.test(S.detailRoute));
  check("duplicate error YOK (claims'te unique yok)", !/DUPLICATE/.test(S.listRoute) && !/DUPLICATE/.test(S.detailRoute));
  for (const k of ["listRoute", "detailRoute"]) check(`${k}: ADMIN → FORBIDDEN 403`, /YEBS_ADMIN_FORBIDDEN"[\s\S]*?status:\s*403/.test(S[k]));

  console.log("\n[F] Ham DB sızıntısı yok");
  check("service error.message yalnız console.error", /console\.error\([^)]*error\.message/.test(S.mut));
  check("kod sabit union (message döndürmüyor)", !/code: error\.message/.test(S.mut));
}

console.log("\n[G] D6/D7 + AUD1 + A0/A1/A2/A3 + adminGuard + package git-blob DEĞİŞMEZLİĞİ");
const FROZEN = [
  "supabase/migrations/20260729000000_yebs_claims.sql",
  "supabase/migrations/20260730000000_yebs_claim_sources.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260728000000_yebs_sources.sql",
  "supabase/migrations/20260826000000_yebs_source_mutations.sql",
  "supabase/migrations/20260822000000_yebs_concept_mutations.sql",
  "supabase/migrations/20260823000000_yebs_concept_label_mutations.sql",
  "supabase/migrations/20260814000000_yebs_create_school_with_audit.sql",
  "supabase/migrations/20260821000000_yebs_update_school_with_audit.sql",
  "lib/auth/adminGuard.ts",
  "lib/yebs/service/sources.ts",
  "lib/yebs/service/sourceMutations.ts",
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
if (!drift) ok("D6/D7 + AUD1 + A0/A1/A2/A3 + adminGuard + package blob'ları origin/main ile AYNI");

console.log("\n[H] Migration timestamp + canlı 401");
check("20260828000000 migration mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260828000000_yebs_claim_mutations.sql")));
check("20260830000000 (A4B) bu turda YOK", !existsSync(resolve(ROOT, "supabase/migrations/20260830000000_yebs_claim_source_mutations.sql")));
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, ""); const cid = "00000000-0000-4000-8000-000000000000";
  for (const [n, u, method] of [["POST claims 401", `${base}/api/admin/yebs/claims`, "POST"], ["PATCH claim 401", `${base}/api/admin/yebs/claims/${cid}`, "PATCH"]]) {
    try { const r = await fetch(u, { method, headers: { "content-type": "application/json" }, body: "{}" }); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
