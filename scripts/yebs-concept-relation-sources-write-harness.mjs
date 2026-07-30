// ============================================================
// YEBS API-A5B — Concept Relation Source MUTATION route/service sözleşme + değişmezlik harness'i.
// SALT-OKUNUR. Mutation/RPC çağrısı YAPMAZ. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  listRoute: "app/api/admin/yebs/relations/[relationId]/sources/route.ts",
  detailRoute: "app/api/admin/yebs/relations/[relationId]/sources/[relationSourceId]/route.ts",
  mut: "lib/yebs/service/conceptRelationSourceMutations.ts",
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
  for (const [k, verbs] of [["listRoute", ["POST"]], ["detailRoute", ["PATCH", "DELETE"]]]) {
    check(`${k}: verifyAdminRequest`, /verifyAdminRequest\s*\(/.test(S[k]));
    check(`${k}: actor guard.adminId`, /const \{ adminId, db \} = guard/.test(S[k]));
    for (const v of verbs) check(`${k}: ${v} export`, new RegExp(`export\\s+async\\s+function\\s+${v}\\s*\\(`).test(S[k]));
  }

  console.log("\n[B] Body allowlist + key sayıları (evidence_layer dahil)");
  check("attach allowlist 15 anahtar", (S.listRoute.match(/ALLOWED_BODY_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 15);
  check("attach required 4 (source_id/evidence_layer/source_role/rationale_status)", /for \(const key of \["source_id", "evidence_layer", "source_role", "rationale_status"\]/.test(S.listRoute));
  {
    const m = S.listRoute.match(/ALLOWED_BODY_KEYS = \[([^\]]*)\]/);
    check("attach allowlist verification_status/concept_relation_id/id/status İÇERMİYOR", m && !/"verification_status"|"concept_relation_id"|"\bid\b"|"status"|"created_at"|"updated_at"/.test(m[1]));
  }
  check("update allowlist 15 (expected+reason+13)", (S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 15);
  {
    const m = S.detailRoute.match(/PATCH_ALLOWED_KEYS = \[([\s\S]*?)\]/);
    check("update allowlist source_id/relation_id/verification_status/id/timestamps İÇERMİYOR", m && !/"source_id"|"concept_relation_id"|"verification_status"|"\bid\b"|"created_at"|"updated_at"/.test(m[1]));
  }
  check("update allowlist evidence_layer İÇERİR (mutable)", /PATCH_ALLOWED_KEYS = \[[\s\S]*?"evidence_layer"[\s\S]*?\]/.test(S.detailRoute));
  check("delete allowlist exact 2 (expected_updated_at+reason)", (S.detailRoute.match(/DELETE_ALLOWED_KEYS = \[([\s\S]*?)\]/)?.[1].match(/"[a-z_]+"/g) || []).length === 2);
  for (const k of ["listRoute", "detailRoute"]) {
    check(`${k}: unknown key → invalid`, /if \(!allowed\.has\(key\)\) return invalid/.test(S[k]));
    check(`${k}: array/null body reddi`, /Array\.isArray\(body\)/.test(S[k]));
  }

  console.log("\n[C] Strict tip + enum + coupling + text limits + control chars");
  check("attach source_id UUID", /UUID_RE\.test\(sourceId\)/.test(S.listRoute));
  check("attach enum evidence_layer/source_role/rationale_status", /YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS as readonly string\[\]\)\.includes\(evidenceLayer\)/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_SOURCE_ROLES as readonly string\[\]\)\.includes\(sourceRole\)/.test(S.listRoute) && /YEBS_CONCEPT_RELATION_SOURCE_RATIONALE_STATUSES as readonly string\[\]\)\.includes\(rationaleStatus\)/.test(S.listRoute));
  check("attach text limits (LIMITS sabiti)", /locator_text: 2000/.test(S.listRoute) && /source_original_excerpt: 50000/.test(S.listRoute) && /transliteration_scheme: 200/.test(S.listRoute) && /rationale: 20000/.test(S.listRoute));
  check("attach kontrol karakteri regex", /\[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\]/.test(S.listRoute));
  check("attach BCP-47 + ISO-15924", /BCP47_RE = /.test(S.listRoute) && /ISO15924_RE = /.test(S.listRoute));
  check("attach COUPLING (rationale/excerpt/translit/ftrans)", /rationaleStatus === "from_source"[\s\S]*?transliteration !== null && excerpt === null[\s\S]*?\(faithful === null\) !== \(transLang\.value === null\)/.test(S.listRoute));
  check("update expected_updated_at strict tz + takvim", /isValidExpectedUpdatedAt/.test(S.detailRoute) && /daysInMonth/.test(S.detailRoute));
  check("update reason zorunlu + kontrol reddi", /reason\.trim\(\) === "" \|\| reason\.length > REASON_MAX_LEN \|\| hasHarmfulControl\(reason\)/.test(S.detailRoute));
  check("update evidence_layer enum ENUM_KEYS'te", /evidence_layer: YEBS_CONCEPT_RELATION_SOURCE_EVIDENCE_LAYERS/.test(S.detailRoute));
  check("update enum/text/tag present kontrolü", /ENUM_KEYS\[key\]\.includes\(v\)/.test(S.detailRoute) && /TAG_KEYS\[key\]\.test\(t\)/.test(S.detailRoute));
  check("update en az bir mutable alan (empty patch reddi)", /Object\.keys\(patch\)\.length === 0/.test(S.detailRoute));
  check("delete expected_updated_at + reason zorunlu", /typeof expectedUpdatedAt !== "string" \|\| !isValidExpectedUpdatedAt\(expectedUpdatedAt\)/.test(S.detailRoute) && (S.detailRoute.match(/reason\.trim\(\) === ""/g) || []).length >= 2);

  console.log("\n[D] Service RPC-only + ayrı UUID + guard");
  check("server-only", /import "server-only"/.test(S.mut));
  check("doğrudan insert/update/delete YOK", !/\.(insert|update|delete|upsert)\s*\(/.test(S.mut));
  check("attach rpc çağrısı", /\.rpc\("yebs_attach_concept_relation_source_with_audit"/.test(S.mut));
  check("update rpc çağrısı", /\.rpc\("yebs_update_concept_relation_source_with_audit"/.test(S.mut));
  check("remove rpc çağrısı", /\.rpc\("yebs_remove_concept_relation_source_with_audit"/.test(S.mut));
  check("request_id ≠ operation_id (üç ayrı çift)", (S.mut.match(/const requestId = crypto\.randomUUID\(\);\s*const operationId = crypto\.randomUUID\(\);/g) || []).length === 3);
  check("Set.has exact sınıflandırma", /\.has\(msg as/.test(S.mut) && !/\.includes\(msg/.test(S.mut));
  check("canonical row guard", /isCanonicalRelationSourceRow/.test(S.mut));
  check("attach RPC param p_concept_relation_id/p_evidence_layer/p_rationale_status", /p_concept_relation_id: relationId/.test(S.mut) && /p_evidence_layer: input\.evidenceLayer/.test(S.mut) && /p_rationale_status: input\.rationaleStatus/.test(S.mut));
  check("update RPC param p_patch/p_relation_source_id", /p_patch: patch/.test(S.mut) && /p_relation_source_id: relationSourceId/.test(S.mut));
  check("remove RPC param p_relation_source_id/p_expected_updated_at", /p_relation_source_id: relationSourceId/.test(S.mut) && /p_expected_updated_at: expectedUpdatedAt/.test(S.mut));
  check("verification_status hiçbir RPC paramı DEĞİL (dönen alan hariç)", !/p_verification/i.test(S.mut) && !/verificationStatus/.test(S.mut));

  console.log("\n[E] Hata matrisi + wrapper");
  check("attach 201 wrapper", /ok: true, row: result\.row \}, \{ status: 201 \}/.test(S.listRoute));
  check("update 200 wrapper", /ok: true, row: result\.row \}, \{ status: 200 \}/.test(S.detailRoute));
  check("remove 200 wrapper (iki 200 map)", (S.detailRoute.match(/status: 200 \}/g) || []).length >= 2);
  check("attach relation not found 404", /YEBS_RELATION_SOURCE_RELATION_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute));
  check("attach source not found 404", /YEBS_RELATION_SOURCE_SOURCE_NOT_FOUND[\s\S]*?status:\s*404/.test(S.listRoute));
  check("attach relation locked 409", /YEBS_RELATION_SOURCE_RELATION_LOCKED[\s\S]*?status:\s*409/.test(S.listRoute));
  check("update stale/locked/no-changes 409", /YEBS_RELATION_SOURCE_STALE_UPDATE[\s\S]*?status:\s*409/.test(S.detailRoute) && /YEBS_RELATION_SOURCE_RELATION_LOCKED[\s\S]*?status:\s*409/.test(S.detailRoute) && /YEBS_RELATION_SOURCE_NO_CHANGES[\s\S]*?status:\s*409/.test(S.detailRoute));
  check("detail not found 404", /YEBS_RELATION_SOURCE_NOT_FOUND[\s\S]*?status:\s*404/.test(S.detailRoute));
  check("duplicate error YOK", !/DUPLICATE/.test(S.listRoute) && !/DUPLICATE/.test(S.detailRoute));
  for (const k of ["listRoute", "detailRoute"]) check(`${k}: ADMIN → FORBIDDEN 403`, /YEBS_ADMIN_FORBIDDEN"[\s\S]*?status:\s*403/.test(S[k]));

  console.log("\n[F] Ham DB sızıntısı + verification/delete koruması");
  check("service error.message yalnız console.error", /console\.error\([^)]*error\.message/.test(S.mut));
  check("kod sabit union (message döndürmüyor)", !/code: error\.message/.test(S.mut));
  check("route'larda Relation/Source delete veya verification transition YOK", !/yebs_delete|verification_status:/i.test(S.detailRoute) && !/yebs_delete/i.test(S.listRoute));
}

console.log("\n[G] A5A + D8/D9 + AUD1 + A0/A1/A2/A3/A4 + adminGuard + package git-blob DEĞİŞMEZLİĞİ");
const A5A_COMMIT = "833e8f7fe33cff6a731539c144cfc342ed6e802f";
const A5A_FILES = new Set([
  "supabase/migrations/20260906000000_yebs_concept_relation_mutations.sql",
  "app/api/admin/yebs/relations/route.ts",
  "app/api/admin/yebs/relations/[id]/route.ts",
  "lib/yebs/service/conceptRelations.ts",
  "lib/yebs/service/conceptRelationMutations.ts",
]);
const FROZEN = [
  ...A5A_FILES,
  // D8/D9 şema + AUD1 (origin/main ile AYNI)
  "supabase/migrations/20260731000000_yebs_concept_relations.sql",
  "supabase/migrations/20260801000000_yebs_concept_relation_sources.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  // A0-A4 (origin/main ile AYNI)
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
  const head = gitBlob("HEAD", rel);
  const ref = A5A_FILES.has(rel) ? A5A_COMMIT : "origin/main";
  const base = gitBlob(ref, rel);
  if (base === null) { skipped(`blob ${rel}`, `${ref}'de yok`); continue; }
  if (base !== head) { bad(`DEĞİŞMEZLİK ihlali: ${rel} (${ref})`); drift = true; }
}
if (!drift) ok("A5A + D8/D9 + AUD1 + A0-A4 + adminGuard + package blob'ları beklenen ref ile AYNI");

console.log("\n[H] Migration timestamp + canlı 401");
check("20260908000000 A5B migration mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260908000000_yebs_concept_relation_source_mutations.sql")));
check("20260906000000 A5A migration hâlâ mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260906000000_yebs_concept_relation_mutations.sql")));
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, ""); const rid = "00000000-0000-4000-8000-000000000000";
  const tests = [
    ["POST attach 401", `${base}/api/admin/yebs/relations/${rid}/sources`, "POST"],
    ["PATCH relation-source 401", `${base}/api/admin/yebs/relations/${rid}/sources/${rid}`, "PATCH"],
    ["DELETE relation-source 401", `${base}/api/admin/yebs/relations/${rid}/sources/${rid}`, "DELETE"],
  ];
  for (const [n, u, method] of tests) {
    try { const r = await fetch(u, { method, headers: { "content-type": "application/json" }, body: "{}" }); check(n, r.status === 401, `status=${r.status}`); }
    catch (e) { skipped(n, `fetch: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
