// ============================================================
// YEBS API-A5B — Concept Relation Source UPDATE audit RPC harness'i (statik SQL). FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260908000000_yebs_concept_relation_source_mutations.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const MUTABLE = ["evidence_layer", "source_role", "locator_text", "url_fragment", "source_original_excerpt", "source_original_language_tag", "source_original_script_code", "transliteration", "transliteration_scheme", "faithful_translation", "translation_language_tag", "rationale", "rationale_status"];
  const body = (sql.match(/CREATE FUNCTION public\.yebs_update_concept_relation_source_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] UPDATE RPC imza + güvenlik");
  check("CREATE FUNCTION update (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_update_concept_relation_source_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_update_concept_relation_source_with_audit/.test(sql));
  check("RETURNS public.yebs_concept_relation_sources", /yebs_update_concept_relation_source_with_audit[\s\S]*?RETURNS public\.yebs_concept_relation_sources/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_update_concept_relation_source_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("8 param (…relation_source_id, expected_updated_at, patch, reason)", /p_concept_relation_id\s+uuid,\s*p_relation_source_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_patch\s+jsonb,\s*p_reason\s+text/.test(body));

  console.log("\n[B] Patch allowlist 13 (evidence_layer dahil) + immutable");
  check("patch allowlist tam 13 mutable anahtar", MUTABLE.every(k => new RegExp(`'${k}'`).test(body)));
  check("relation/source_id/verification_status/id/timestamps patch-dışı", !/jsonb_exists\(p_patch, '(concept_relation_id|source_id|verification_status|id|created_at|updated_at)'\)/.test(body) && !/k NOT IN \([^)]*'(source_id|verification_status|concept_relation_id)'/.test(body));
  check("boş patch reddi", /p_patch = '\{\}'::jsonb THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(body));
  check("unknown key → INVALID_PATCH", /k NOT IN \([\s\S]*?\)\s*\)\s*THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(body));

  console.log("\n[C] Concurrency + ownership + gate");
  check("reason ZORUNLU + C0 reddi", /p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(body) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(body));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(body));
  check("hedef junction FOR UPDATE", /FROM public\.yebs_concept_relation_sources\s*WHERE id = p_relation_source_id FOR UPDATE/.test(body));
  check("path aidiyeti (concept_relation_id eşleşmesi)", /v_existing\.concept_relation_id IS DISTINCT FROM p_concept_relation_id THEN\s*RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NOT_FOUND'/.test(body));
  check("NOT_FOUND", /YEBS_RELATION_SOURCE_NOT_FOUND/.test(body));
  check("parent Relation FOR UPDATE + draft gate", /FROM public\.yebs_concept_relations r\s*WHERE r\.id = v_existing\.concept_relation_id FOR UPDATE/.test(body) && /v_rel_status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_RELATION_SOURCE_RELATION_LOCKED'/.test(body));
  check("stale", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_RELATION_SOURCE_STALE_UPDATE'/.test(body));

  console.log("\n[D] Merge + normalize + merged coupling");
  check("evidence_layer 9 enum present-check", /jsonb_exists\(p_patch, 'evidence_layer'\)[\s\S]*?v_evidence NOT IN \(/.test(body));
  check("omitted → existing (evidence_layer örn.)", /v_evidence := v_existing\.evidence_layer/.test(body));
  check("nullable present string|null desteklenir (rationale örn.)", /jsonb_typeof\(p_patch -> 'rationale'\) NOT IN \('string','null'\)/.test(body));
  check("text sınırları update'te de (excerpt 50000/scheme 200/rationale 20000)", /length\(v_excerpt\) > 50000/.test(body) && /length\(v_translit_sch\) > 200/.test(body) && /length\(v_rationale\) > 20000/.test(body));
  check("BCP-47/ISO-15924 update'te", /v_excerpt_lang !~ '\^\[A-Za-z\]\{2,3\}/.test(body) && /v_excerpt_scr !~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(body));
  check("MERGED coupling (merged state) bloğu", /COUPLING \(merged state\)[\s\S]*?v_rat_status = 'from_source'[\s\S]*?v_excerpt IS NULL[\s\S]*?v_translit IS NOT NULL AND v_excerpt IS NULL[\s\S]*?\(v_ftrans IS NULL\) <> \(v_trans_lang IS NULL\)/.test(body));

  console.log("\n[E] changed_fields + no-op + audit + immutable");
  const order = MUTABLE.map(k => body.indexOf(`v_changed := v_changed || '${k}'`));
  check("changed_fields tam 13 alan mevcut", order.every(i => i >= 0));
  check("changed_fields sabit artan sıra (evidence_layer ilk)", order.every((p, i) => i === 0 || p > order[i - 1]));
  check("no-op → NO_CHANGES", /cardinality\(v_changed\) = 0 THEN\s*RAISE EXCEPTION 'YEBS_RELATION_SOURCE_NO_CHANGES'/.test(body));
  check("UPDATE relation/source_id/verification_status içermez", (() => { const u = body.match(/UPDATE public\.yebs_concept_relation_sources[\s\S]*?RETURNING/)?.[0] || ""; return !/\bconcept_relation_id\s*=/.test(u) && !/\bsource_id\s*=/.test(u) && !/\bverification_status\s*=/.test(u); })());
  check("UPDATE evidence_layer İÇERİR (mutable)", (() => { const u = body.match(/UPDATE public\.yebs_concept_relation_sources[\s\S]*?RETURNING/)?.[0] || ""; return /\bevidence_layer\s*=\s*v_evidence/.test(u); })());
  check("audit action=update entity=concept_relation_source, previous/new snapshot", /'update', 'concept_relation_source'[\s\S]*?to_jsonb\(v_existing\), to_jsonb\(v_updated\), v_changed, p_reason/.test(body));
  check("verification transition YOK", !/SET verification_status/.test(body));
  check("update RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_update_concept_relation_source_with_audit\([\s\S]*?\) TO service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
