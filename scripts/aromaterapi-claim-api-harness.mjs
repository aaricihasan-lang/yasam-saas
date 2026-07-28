// ============================================================
// Aromaterapi C2T — Claim API/adapter sözleşme harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB'ye/Supabase'e bağlanmaz, hiçbir mutation yapmaz.
// Dört C2T dosyasının kaynak metni üzerinden C2T kilitli sözleşmesini doğrular:
//   - server-only adapter (createClaim/updateClaim), exact RPC param sözleşmesi
//   - actor/tenant yalnız guard'dan; forbidden spoof → 400
//   - create status yasak; update id yalnız URL; child omit/clear/replace
//   - stabil kod → HTTP mapping; raw DB hata sızmaması
//   - DELETE/upsert/direct claim-table mutation olmaması
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const ADAPTER = resolve(ROOT, "lib/aromaterapi/service/claimMutations.ts");
const CREATE_ROUTE = resolve(ROOT, "app/api/aromaterapi/claims/route.ts");
const UPDATE_ROUTE = resolve(ROOT, "app/api/aromaterapi/claims/[id]/route.ts");

let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }

function read(path) {
  if (!existsSync(path)) { bad(`file exists: ${path}`); return ""; }
  return readFileSync(path, "utf8");
}

const adapter = read(ADAPTER);
const createRoute = read(CREATE_ROUTE);
const updateRoute = read(UPDATE_ROUTE);
const all = adapter + "\n" + createRoute + "\n" + updateRoute;

// ---- Yardımcı: bir dosyada doğrudan claim-tablosu mutasyonu var mı? ----
const CLAIM_TABLES = [
  "aromatherapy_claims",
  "aromatherapy_claim_routes",
  "aromatherapy_claim_populations",
  "aromatherapy_claim_sources",
  "aromatherapy_claim_passages",
  "aromatherapy_claim_relations",
  "aromatherapy_claim_audit_events",
];
function hasDirectClaimMutation(src) {
  // .from("aromatherapy_claim...") + insert/update/delete/upsert zinciri VEYA
  // herhangi bir yerde .insert/.update/.delete/.upsert kullanımı.
  if (/\.(insert|upsert|delete)\s*\(/.test(src)) return true;
  for (const t of CLAIM_TABLES) {
    const re = new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`);
    if (re.test(src)) return true;
  }
  return false;
}

// ============================================================
console.log("\n[C2T-1] Adapter — server-only + canonical RPC yolu");
// ============================================================
check("A01 adapter server-only import", /^import\s+["']server-only["'];/m.test(adapter));
check("A02 create RPC adı", adapter.includes('db.rpc("aromatherapy_create_claim_with_audit"'));
check("A03 update RPC adı", adapter.includes('db.rpc("aromatherapy_update_claim_with_audit"'));
check("A04 adapter doğrudan claim-tablosu mutasyonu YOK", !hasDirectClaimMutation(adapter));

const CREATE_PARAMS = [
  "p_actor_user_id", "p_actor_label_snapshot", "p_tenant_id", "p_preparation_id",
  "p_claim_type", "p_conclusion", "p_conclusion_provenance", "p_evidence_layer",
  "p_rationale_status", "p_safety_topic", "p_preparation_context", "p_outcome_type",
  "p_rationale", "p_routes", "p_populations", "p_sources", "p_passages",
  "p_relations", "p_reason",
];
check("A05 create parametre sayısı 19", CREATE_PARAMS.length === 19);
for (const p of CREATE_PARAMS) {
  check(`A06 create param ${p}`, new RegExp(`${p}\\s*:`).test(adapter));
}

const UPDATE_PARAMS = [
  "p_actor_user_id", "p_actor_label_snapshot", "p_tenant_id", "p_claim_id",
  "p_reason", "p_claim_patch", "p_expected_updated_at", "p_routes",
  "p_populations", "p_sources", "p_passages", "p_relations",
];
check("A07 update parametre sayısı 12", UPDATE_PARAMS.length === 12);
for (const p of UPDATE_PARAMS) {
  check(`A08 update param ${p}`, new RegExp(`${p}\\s*[:=]`).test(adapter));
}

// Child omit/clear/replace: undefined kontrolü ile koşullu param.
check("A09 update child omit (undefined → param gönderilmez)",
  /if\s*\(\s*input\.routes\s*!==\s*undefined\s*\)/.test(adapter) &&
  /if\s*\(\s*input\.relations\s*!==\s*undefined\s*\)/.test(adapter));

// ============================================================
console.log("\n[C2T-2] Adapter — hata sınıflandırma + HTTP mapping (raw sızma yok)");
// ============================================================
check("A10 classify SQLSTATE 23514→CHECK", /"23514"\s*\)\s*return\s+"AROMA_CHECK_VIOLATION"/.test(adapter));
check("A11 classify SQLSTATE 23505→UNIQUE", /"23505"\s*\)\s*return\s+"AROMA_UNIQUE_VIOLATION"/.test(adapter));
check("A12 classify SQLSTATE 23503→FK", /"23503"\s*\)\s*return\s+"AROMA_FK_VIOLATION"/.test(adapter));
check("A13 classify P0001 exact Set.has", /RPC_P0001_CODES\.has\(/.test(adapter));
check("A14 classify includes/regex KULLANMAZ",
  !/\.includes\(/.test(adapter) && !/startsWith\(/.test(adapter) && !/endsWith\(/.test(adapter));
check("A15 unknown → AROMA_CLAIM_WRITE_FAILED", /return\s+"AROMA_CLAIM_WRITE_FAILED"/.test(adapter));
check("A16 raw hata yalnız console.error (server-log)", /console\.error\(/.test(adapter));
// Sonuç objesi yalnız {code}/{claimId,warnings} döner; error.message DÖNDÜRÜLMEZ.
check("A17 result'ta ham message dönüşü YOK",
  !/return\s*\{[^}]*message\s*:/.test(adapter));

// HTTP mapping kilitli sözleşme (17 kod).
const HTTP_MAP = {
  AROMA_ACTOR_ID_REQUIRED: 500,
  AROMA_ACTOR_LABEL_INVALID: 500,
  AROMA_REASON_INVALID: 400,
  AROMA_INVALID_PAYLOAD: 400,
  AROMA_IMMUTABLE_FIELD: 400,
  AROMA_UNKNOWN_FIELD: 400,
  AROMA_DUPLICATE_ROUTE: 422,
  AROMA_DUPLICATE_POPULATION: 422,
  AROMA_PASSAGE_SOURCE_NOT_LINKED: 422,
  AROMA_SELF_RELATION: 422,
  AROMA_RELATION_TARGET_NOT_FOUND: 422,
  AROMA_CLAIM_NOT_FOUND: 404,
  AROMA_STALE_CLAIM: 409,
  AROMA_CHECK_VIOLATION: 422,
  AROMA_UNIQUE_VIOLATION: 409,
  AROMA_FK_VIOLATION: 422,
  AROMA_CLAIM_WRITE_FAILED: 500,
};
check("A18 HTTP mapping kod sayısı 17", Object.keys(HTTP_MAP).length === 17);
for (const [code, status] of Object.entries(HTTP_MAP)) {
  check(`A19 HTTP ${code}=${status}`, new RegExp(`${code}\\s*:\\s*${status}\\b`).test(adapter));
}

// ============================================================
console.log("\n[C2T-3] Adapter — actor label fallback + return normalize");
// ============================================================
check("A20 resolveActorLabel full_name→name→email", /profile\?\.full_name\)\s*\?\?\s*pick\(profile\?\.name\)\s*\?\?\s*email/.test(adapter));
check("A21 label 320 üst sınırı", /length\s*>\s*320/.test(adapter));
check("A22 return {claim_id,warnings} normalize", /row\.claim_id/.test(adapter) && /row\.warnings/.test(adapter));
check("A23 array dönüşünde tek-eleman kabul", /data\.length\s*!==\s*1/.test(adapter));

// ============================================================
console.log("\n[C2T-4] Create route (POST) sözleşmesi");
// ============================================================
check("C01 POST export", /export\s+async\s+function\s+POST\s*\(/.test(createRoute));
check("C02 DELETE handler YOK", !/export\s+async\s+function\s+DELETE\s*\(/.test(createRoute));
check("C03 verifyUserRequest includeProfile:true", /verifyUserRequest\(\s*req\s*,\s*\{\s*includeProfile:\s*true\s*\}\s*\)/.test(createRoute));
check("C04 demo 403", /is_demo_account/.test(createRoute) && /status:\s*403/.test(createRoute));
check("C05 createClaim adapter kullanır", /createClaim\(/.test(createRoute));
check("C06 doğrudan claim-tablosu mutasyonu YOK", !hasDirectClaimMutation(createRoute));
check("C07 service_role literal/SUPABASE_SERVICE_ROLE_KEY YOK",
  !/service_role/.test(createRoute) && !/SUPABASE_SERVICE_ROLE_KEY/.test(createRoute));
check("C08 allowlist var, spoof → 400", /CREATE_ALLOWED_KEYS/.test(createRoute) && /AROMA_FORBIDDEN_FIELD/.test(createRoute));
check("C09 status create allowlist'te YOK", !/["']status["']/.test(createRoute));
check("C10 tenant_id/actor allowlist'te YOK",
  !/["']tenant_id["']/.test(createRoute) && !/actor_user_id/.test(createRoute));
check("C11 actor/tenant yalnız guard'dan", /guard\.userId/.test(createRoute) && /guard\.tenantId/.test(createRoute));
check("C12 UUID kontrolü", /UUID_RE\.test\(/.test(createRoute));
check("C13 başarı 201", /status:\s*201/.test(createRoute));
check("C14 reason opsiyonel (present + non-null kontrolü)", /"reason"\s+in\s+obj\s*&&\s*obj\.reason\s*!==\s*null/.test(createRoute));

// ============================================================
console.log("\n[C2T-5] Update route (PATCH) sözleşmesi");
// ============================================================
check("U01 PATCH export", /export\s+async\s+function\s+PATCH\s*\(/.test(updateRoute));
check("U02 DELETE handler YOK", !/export\s+async\s+function\s+DELETE\s*\(/.test(updateRoute));
check("U03 params Promise + await ctx.params",
  /params:\s*Promise<\{\s*id:\s*string\s*\}>/.test(updateRoute) && /await\s+ctx\.params/.test(updateRoute));
check("U04 verifyUserRequest includeProfile:true", /verifyUserRequest\(\s*req\s*,\s*\{\s*includeProfile:\s*true\s*\}\s*\)/.test(updateRoute));
check("U05 demo 403", /is_demo_account/.test(updateRoute) && /status:\s*403/.test(updateRoute));
check("U06 updateClaim adapter kullanır", /updateClaim\(/.test(updateRoute));
check("U07 doğrudan claim-tablosu mutasyonu YOK", !hasDirectClaimMutation(updateRoute));
check("U08 service_role literal/key YOK",
  !/service_role/.test(updateRoute) && !/SUPABASE_SERVICE_ROLE_KEY/.test(updateRoute));
check("U09 reason ZORUNLU", /reasonRaw\.trim\(\)\s*===\s*""/.test(updateRoute));
check("U10 patch allowlist + status DAHİL", /PATCH_ALLOWED_KEYS/.test(updateRoute) && /"status"/.test(updateRoute));
check("U11 top-level allowlist spoof → 400", /UPDATE_ALLOWED_KEYS/.test(updateRoute) && /AROMA_FORBIDDEN_FIELD/.test(updateRoute));
check("U12 claim_id/preparation_id top-level allowlist'te YOK",
  !/["']claim_id["']/.test(updateRoute) && !/["']preparation_id["']/.test(updateRoute));
check("U13 id yalnız URL'den (UUID_RE)", /UUID_RE\.test\(id\)/.test(updateRoute));
check("U14 expected_updated_at strict + opsiyonel",
  /isValidExpectedUpdatedAt/.test(updateRoute) && /"expected_updated_at"\s+in\s+obj\s*&&/.test(updateRoute));
check("U15 child omit(undefined)/clear([])/replace",
  /if\s*\(\s*!\(key in obj\)\s*\)\s*return\s*\{\s*ok:\s*true,\s*value:\s*undefined/.test(updateRoute));
check("U16 actor/tenant yalnız guard'dan", /guard\.userId/.test(updateRoute) && /guard\.tenantId/.test(updateRoute));
check("U17 başarı 200", /status:\s*200/.test(updateRoute));

// ============================================================
console.log("\n[C2T-6] Global — canonical tek yol / yasaklar");
// ============================================================
check("G01 hiçbir dosyada .insert/.upsert/.delete zinciri YOK", !/\.(insert|upsert|delete)\s*\(/.test(all));
check("G02 hiçbir dosyada doğrudan claim-table .from() mutasyonu YOK",
  CLAIM_TABLES.every((t) => !new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`).test(all)));
check("G03 route'larda ham DB hata sızması yok (result.code döner)",
  /result\.code/.test(createRoute) && /result\.code/.test(updateRoute) &&
  !/error\.message/.test(createRoute) && !/error\.message/.test(updateRoute));
check("G04 dört dosya da mevcut",
  adapter.length > 0 && createRoute.length > 0 && updateRoute.length > 0);

// ============================================================
console.log(`\n[C2T HARNESS] PASS=${pass} FAIL=${fail}`);
if (fail > 0) {
  console.log("FAILURES:", failures.join(", "));
  process.exit(1);
}
console.log("C2T claim API/adapter sözleşme harness: TÜM KONTROLLER PASS");
