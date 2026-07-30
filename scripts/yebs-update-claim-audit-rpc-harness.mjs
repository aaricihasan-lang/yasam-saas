// ============================================================
// YEBS API-A4A — Claim UPDATE audit RPC harness'i (statik SQL sözleşmesi). FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260828000000_yebs_claim_mutations.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const MUTABLE = ["claim_type", "claim_text", "provenance_kind", "evidence_layer", "outcome_type", "safety_topic"];
  const updateBody = (sql.match(/CREATE FUNCTION public\.yebs_update_claim_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] UPDATE RPC imza + güvenlik");
  check("CREATE FUNCTION update (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_update_claim_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_update_claim_with_audit/.test(sql));
  check("RETURNS public.yebs_claims", /yebs_update_claim_with_audit[\s\S]*?RETURNS public\.yebs_claims/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_update_claim_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 param (…claim_id, expected_updated_at, patch, reason)", /p_claim_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_patch\s+jsonb,\s*p_reason\s+text/.test(updateBody));

  console.log("\n[B] Patch allowlist 6 + kontrol");
  check("patch allowlist tam 6 mutable anahtar", MUTABLE.every(k => new RegExp(`'${k}'`).test(updateBody)));
  check("concept_id patch-dışı", !/k NOT IN \([^)]*'concept_id'/.test(updateBody) && !/jsonb_exists\(p_patch, 'concept_id'\)/.test(updateBody));
  check("status patch-dışı", !/k NOT IN \([^)]*'status'/.test(updateBody) && !/jsonb_exists\(p_patch, 'status'\)/.test(updateBody));
  check("id/created_at/updated_at patch-dışı", !/jsonb_exists\(p_patch, '(id|created_at|updated_at)'\)/.test(updateBody));
  check("boş patch reddi", /p_patch = '\{\}'::jsonb THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(updateBody));
  check("unknown key → INVALID_PATCH", /k NOT IN \([\s\S]*?\)\s*\)\s*THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(updateBody));

  console.log("\n[C] Concurrency + gate");
  check("reason ZORUNLU + C0 reddi", /p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(updateBody) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(updateBody));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(updateBody));
  check("hedef FOR UPDATE", /FROM public\.yebs_claims\s*WHERE id = p_claim_id FOR UPDATE/.test(updateBody));
  check("CLAIM_NOT_FOUND", /YEBS_CLAIM_NOT_FOUND/.test(updateBody));
  check("draft status gate", /v_existing\.status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_STATUS_LOCKED'/.test(updateBody));
  check("stale", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_STALE_UPDATE'/.test(updateBody));

  console.log("\n[D] Merge + normalize + merged coupling");
  check("omitted → existing (claim_type örn.)", /v_claim_type := v_existing\.claim_type/.test(updateBody));
  check("claim_text present btrim + ≤20000 + C0 reddi", /v_claim_text := btrim\(p_patch ->> 'claim_text'\)/.test(updateBody) && /length\(v_claim_text\) > 20000/.test(updateBody) && /translate\(v_claim_text, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'/.test(updateBody));
  check("outcome_type/safety_topic string|null desteklenir", /jsonb_typeof\(p_patch -> 'outcome_type'\) NOT IN \('string', 'null'\)/.test(updateBody) && /jsonb_typeof\(p_patch -> 'safety_topic'\) NOT IN \('string', 'null'\)/.test(updateBody));
  check("MERGED coupling: safety_topic (merged claim_type üzerinden)", /COUPLING \(merged state\): safety_topic[\s\S]*?v_claim_type = 'safety'[\s\S]*?v_safety_topic !~ '\^\[a-z\]\[a-z0-9_\]\*\$'[\s\S]*?ELSE[\s\S]*?v_safety_topic IS NOT NULL/.test(updateBody));
  check("MERGED coupling: outcome_type (safety zorunlu / research opsiyonel / diğer NULL)", /COUPLING \(merged state\): outcome_type[\s\S]*?v_claim_type = 'safety'[\s\S]*?v_outcome_type IS NULL OR v_outcome_type NOT IN[\s\S]*?ELSIF v_claim_type = 'research_finding'[\s\S]*?ELSE[\s\S]*?v_outcome_type IS NOT NULL/.test(updateBody));

  console.log("\n[E] changed_fields + no-op + audit");
  const order = MUTABLE.map(k => updateBody.indexOf(`v_changed := v_changed || '${k}'`));
  check("changed_fields tam 6 alan mevcut", order.every(i => i >= 0));
  check("changed_fields sabit artan sıra", order.every((p, i) => i === 0 || p > order[i - 1]));
  check("no-op → NO_CHANGES", /cardinality\(v_changed\) = 0 THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_NO_CHANGES'/.test(updateBody));
  check("UPDATE concept_id/status içermez", (() => { const u = updateBody.match(/UPDATE public\.yebs_claims[\s\S]*?RETURNING/)?.[0] || ""; return !/\bconcept_id\s*=/.test(u) && !/\bstatus\s*=/.test(u); })());
  check("audit action=update entity=claim, previous/new snapshot", /'update', 'claim'[\s\S]*?to_jsonb\(v_existing\), to_jsonb\(v_updated\), v_changed, p_reason/.test(updateBody));

  console.log("\n[F] DELETE/remove/transition yok + Claim Sources yok + EXECUTE");
  check("remove/DELETE RPC YOK", !/yebs_delete_claim|yebs_remove_claim|'remove', 'claim'/.test(sql));
  check("DELETE FROM yebs_claims YOK", !/DELETE FROM public\.yebs_claims/.test(sql));
  check("status transition YOK (UPDATE status set etmiyor)", !/SET[\s\S]*?\bstatus\s*=/.test(updateBody.match(/UPDATE public\.yebs_claims[\s\S]*?RETURNING/)?.[0] || ""));
  check("Claim Sources mutation YOK (yalnız yorum referansı sayılmaz)",
    !/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.yebs_claim_sources/.test(sql)
    && !/CREATE (OR REPLACE )?FUNCTION public\.\w*claim_source/.test(sql));
  check("update RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_update_claim_with_audit\([\s\S]*?\) TO service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
