// ============================================================
// YEBS API-A5A — Concept Relation UPDATE audit RPC harness'i (statik SQL). FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260906000000_yebs_concept_relation_mutations.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const body = (sql.match(/CREATE FUNCTION public\.yebs_update_concept_relation_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] UPDATE RPC imza + güvenlik");
  check("CREATE FUNCTION update (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_update_concept_relation_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_update_concept_relation_with_audit/.test(sql));
  check("RETURNS public.yebs_concept_relations", /yebs_update_concept_relation_with_audit[\s\S]*?RETURNS public\.yebs_concept_relations/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_update_concept_relation_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 param (…relation_id, expected_updated_at, patch, reason)", /p_relation_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_patch\s+jsonb,\s*p_reason\s+text/.test(body));

  console.log("\n[B] Patch allowlist yalnız relation_type + immutable");
  check("patch allowlist yalnız relation_type", /k NOT IN \('relation_type'\)/.test(body));
  check("source/target/status/id/timestamps patch-dışı", !/jsonb_exists\(p_patch, '(source_concept_id|target_concept_id|status|id|created_at|updated_at)'\)/.test(body) && !/k NOT IN \([^)]*'(source_concept_id|target_concept_id|status)'/.test(body));
  check("boş patch reddi", /p_patch = '\{\}'::jsonb THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(body));
  check("unknown key → INVALID_PATCH", /k NOT IN \('relation_type'\)\s*\)\s*THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(body));

  console.log("\n[C] Concurrency + gate + no-op");
  check("reason ZORUNLU + C0 reddi", /p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(body) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(body));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(body));
  check("hedef FOR UPDATE", /FROM public\.yebs_concept_relations\s*WHERE id = p_relation_id FOR UPDATE/.test(body));
  check("NOT_FOUND", /YEBS_CONCEPT_RELATION_NOT_FOUND/.test(body));
  check("draft status gate", /v_existing\.status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STATUS_LOCKED'/.test(body));
  check("stale", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_STALE_UPDATE'/.test(body));
  check("relation_type 5 enum", /v_new_type NOT IN \(\s*'broader_than','part_of','related_to','contrasted_with','corresponds_to'/.test(body));
  check("no-op reddi", /v_new_type IS NOT DISTINCT FROM v_existing\.relation_type THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_NO_CHANGES'/.test(body));

  console.log("\n[D] Evidence gate + tam re-validation");
  check("bağlı D9 evidence varsa 409", /FROM public\.yebs_concept_relation_sources s\s*WHERE s\.concept_relation_id = p_relation_id[\s\S]*?YEBS_CONCEPT_RELATION_HAS_SOURCES/.test(body));
  check("uçlar FOR KEY SHARE + tradition yeniden oku", /FROM public\.yebs_concepts c\s*WHERE c\.id = v_existing\.source_concept_id FOR KEY SHARE/.test(body) && /FROM public\.yebs_concepts c\s*WHERE c\.id = v_existing\.target_concept_id FOR KEY SHARE/.test(body));
  check("cross-tradition yeni tip için", /v_new_type IN \('broader_than','part_of','related_to'\)\s*AND v_src_trad IS DISTINCT FROM v_tgt_trad THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_CROSS_TRADITION'/.test(body));
  check("mirror yeni tip için", /v_new_type IN \('related_to','contrasted_with'\)[\s\S]*?YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE/.test(body));
  check("hiyerarşi duplicate + conflict yeni tip için", /v_new_type = 'broader_than'[\s\S]*?YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE[\s\S]*?YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT/.test(body));
  check("recursive cycle YOK", !/RECURSIVE|WITH RECURSIVE/i.test(body));

  console.log("\n[E] UPDATE + changed_fields + audit + immutable");
  check("UPDATE yalnız relation_type", /UPDATE public\.yebs_concept_relations\s*SET relation_type = v_new_type\s*WHERE id = p_relation_id/.test(body));
  check("UPDATE source/target/status içermez", (() => { const u = body.match(/UPDATE public\.yebs_concept_relations[\s\S]*?RETURNING/)?.[0] || ""; return !/source_concept_id\s*=/.test(u) && !/target_concept_id\s*=/.test(u) && !/\bstatus\s*=/.test(u); })());
  check("triple duplicate CONSTRAINT_NAME", /GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;[\s\S]*?yebs_concept_relations_source_target_type_key[\s\S]*?YEBS_CONCEPT_RELATION_DUPLICATE/.test(body));
  check("changed_fields = relation_type", /ARRAY\['relation_type'\]::text\[\]/.test(body));
  check("audit action=update entity=concept_relation, previous/new", /'update', 'concept_relation'[\s\S]*?to_jsonb\(v_existing\), to_jsonb\(v_updated\)/.test(body));

  console.log("\n[F] DELETE/transition yok + EXECUTE");
  check("DELETE FROM relations/concepts/sources YOK", !/DELETE FROM public\.yebs_concept_relations\b/.test(sql) && !/DELETE FROM public\.yebs_concepts\b/.test(sql) && !/DELETE FROM public\.yebs_sources\b/.test(sql));
  check("status/lifecycle transition YOK", !/SET status|'transition'/.test(body));
  check("update RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_update_concept_relation_with_audit\([\s\S]*?\) TO service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
