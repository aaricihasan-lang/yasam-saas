// ============================================================
// YEBS API-A5A — Concept Relation CREATE audit RPC + write-gate harness'i
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
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

check("migration mevcut", existsSync(MIG));
let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const TYPES = ["broader_than", "part_of", "related_to", "contrasted_with", "corresponds_to"];
  const body = (sql.match(/CREATE FUNCTION public\.yebs_create_concept_relation_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] Transaction + D8/D9/AUD1 dokunmama");
  check("tek BEGIN;/COMMIT;", (sql.match(/^BEGIN;/m) || []).length === 1 && (sql.match(/^COMMIT;/m) || []).length === 1);
  check("D8 tablo drop/recreate/şema-ALTER YOK", !/DROP TABLE|CREATE TABLE public\.yebs_concept_relations|ALTER TABLE public\.yebs_concept_relations\s+(ADD|DROP|ALTER)\s+(COLUMN|CONSTRAINT)/.test(sql));
  check("D9/AUD1 CHECK'ine dokunulmuyor", !/ALTER TABLE public\.(yebs_concept_relation_sources|yebs_audit_events)\b/.test(sql));
  check("Relation Source mutation YOK", !/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.yebs_concept_relation_sources/.test(sql) && !/CREATE (OR REPLACE )?FUNCTION public\.\w*relation_source/.test(sql));

  console.log("\n[B] Write-gate");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_concept_relations FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_concept_relations TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE", /yebs_concept_relations FROM PUBLIC/.test(sql) && /yebs_concept_relations FROM anon/.test(sql) && /yebs_concept_relations FROM authenticated/.test(sql));
  check("policy eklenmiyor / FORCE RLS açılmıyor", !/CREATE POLICY/.test(sql) && !/FORCE ROW LEVEL SECURITY/.test(sql));

  console.log("\n[C] CREATE RPC imza + güvenlik");
  check("CREATE FUNCTION create (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_create_concept_relation_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_create_concept_relation_with_audit/.test(sql));
  check("RETURNS public.yebs_concept_relations", /yebs_create_concept_relation_with_audit[\s\S]*?RETURNS public\.yebs_concept_relations/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_create_concept_relation_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 parametre (…relation_type…reason)", /p_target_concept_id uuid,\s*p_relation_type\s+text,\s*p_reason\s+text DEFAULT NULL/.test(body));

  console.log("\n[D] Self + enum + cross-tradition");
  check("uçlar zorunlu", /p_source_concept_id IS NULL OR p_target_concept_id IS NULL/.test(body));
  check("self-relation reddi", /p_source_concept_id = p_target_concept_id THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_INVALID_INPUT'/.test(body));
  check("relation_type 5 enum", TYPES.every(t => new RegExp(`'${t}'`).test(body)) && /p_relation_type NOT IN \(/.test(body));
  check("reason HAM fidelity + C0 reddi", /btrim\(p_reason\) = '' OR length\(p_reason\) > 2000[\s\S]*?YEBS_REASON_INVALID/.test(body) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(body));
  check("aktif admin gate", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(body));
  check("source Concept FOR KEY SHARE + tradition oku", /FROM public\.yebs_concepts c\s*WHERE c\.id = p_source_concept_id FOR KEY SHARE/.test(body));
  check("target Concept FOR KEY SHARE + tradition oku", /FROM public\.yebs_concepts c\s*WHERE c\.id = p_target_concept_id FOR KEY SHARE/.test(body));
  check("Concept status gate YOK", !/yebs_concepts[^\n;]*status/.test(body));
  check("SOURCE/TARGET_NOT_FOUND", /YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND/.test(body) && /YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND/.test(body));
  check("cross-tradition matrisi (broader/part/related aynı tradition)", /p_relation_type IN \('broader_than','part_of','related_to'\)\s*AND v_src_trad IS DISTINCT FROM v_tgt_trad THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_RELATION_CROSS_TRADITION'/.test(body));

  console.log("\n[E] Mirror + hiyerarşi + triple duplicate + cycle YOK");
  check("ayna-mükerrer (related_to/contrasted_with)", /p_relation_type IN \('related_to','contrasted_with'\) THEN[\s\S]*?source_concept_id = p_target_concept_id[\s\S]*?target_concept_id = p_source_concept_id[\s\S]*?YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE/.test(body));
  check("hiyerarşik semantik duplicate (part_of(B,A) / broader_than(B,A))", /YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE/.test(body));
  check("hiyerarşik doğrudan çelişki", /YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT/.test(body));
  check("triple duplicate CONSTRAINT_NAME ile ayrım", /GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;[\s\S]*?yebs_concept_relations_source_target_type_key[\s\S]*?YEBS_CONCEPT_RELATION_DUPLICATE/.test(body));
  check("PG_EXCEPTION_CONSTRAINT_NAME YOK", !/PG_EXCEPTION_CONSTRAINT_NAME/.test(sql));
  const sqlCode = sql.replace(/--.*$/gm, "");
  check("recursive/transitif cycle fonksiyonu YOK (yorum-dışı kod)", !/RECURSIVE/i.test(sqlCode));
  check("INSERT status içermez (draft default)", /INSERT INTO public\.yebs_concept_relations \(\s*source_concept_id, target_concept_id, relation_type\s*\)/.test(body) && !/INSERT INTO public\.yebs_concept_relations \([^)]*\bstatus\b/.test(body));

  console.log("\n[F] Audit + EXECUTE + yasak");
  check("audit action=create entity=concept_relation", /'create', 'concept_relation',/.test(body));
  check("audit changed_fields 3 alan", /'source_concept_id','target_concept_id','relation_type'/.test(body));
  check("previous NULL new=created", /'committed', NULL, to_jsonb\(v_created\)/.test(body));
  check("create RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_create_concept_relation_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("create RPC service_role REVOKE (write-gate ayrı)", /REVOKE ALL ON FUNCTION public\.yebs_create_concept_relation_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
  check("DELETE FROM relations/concepts/sources YOK", !/DELETE FROM public\.yebs_concept_relations\b/.test(sql) && !/DELETE FROM public\.yebs_concepts\b/.test(sql) && !/DELETE FROM public\.yebs_sources\b/.test(sql));
  check("status/inverse transition YOK (yorum-dışı kod)", !/'transition'|SET status|inverse/i.test(sql.replace(/--.*$/gm, "")));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
