// ============================================================
// YEBS API-A4A — Claim CREATE audit RPC + write-gate harness'i
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
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

check("migration mevcut", existsSync(MIG));
let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const TYPES = ["identity", "function", "relationship", "practice", "safety", "research_finding"];
  const PROV = ["source_original", "faithful_translation", "editorial_explanation", "editorial_interpretation"];
  const LAYERS = ["classical_textual", "traditional", "ethnographic", "clinical", "experimental", "scientific_review", "regulatory", "experiential", "energetic_metaphysical"];
  const SAFETY_OUT = ["harm_shown", "risk_suspected", "contraindicated", "source_does_not_recommend", "not_classified_as_risk", "insufficient_data", "conflicting", "unknown"];
  const RESEARCH_OUT = ["positive_finding", "no_effect_found", "mixed_findings", "insufficient_data", "no_study_done", "conflicting", "unknown"];

  const createBody = (sql.match(/CREATE FUNCTION public\.yebs_create_claim_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] Transaction + şema dokunmama");
  check("tek BEGIN;/COMMIT;", (sql.match(/^BEGIN;/m) || []).length === 1 && (sql.match(/^COMMIT;/m) || []).length === 1);
  check("yebs_claims tablo drop/recreate/ALTER-şema YOK", !/DROP TABLE|CREATE TABLE public\.yebs_claims|ALTER TABLE public\.yebs_claims\s+(ADD|DROP|ALTER)\s+COLUMN/.test(sql));
  check("D6/D7/audit CHECK'ine dokunulmuyor", !/ALTER TABLE public\.(yebs_claim_sources|yebs_audit_events)\b/.test(sql) && !/ADD CONSTRAINT yebs_claims_/.test(sql));
  check("Claim Source mutation / attach YOK (yalnız yorum referansı sayılmaz)",
    !/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.yebs_claim_sources/.test(sql)
    && !/CREATE (OR REPLACE )?FUNCTION public\.\w*claim_source/.test(sql)
    && !/attach_source|link_source|claim_source_with_audit/.test(sql));

  console.log("\n[B] Write-gate (A1/A2/A3 kalıbı)");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_claims FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_claims TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE", /yebs_claims FROM PUBLIC/.test(sql) && /yebs_claims FROM anon/.test(sql) && /yebs_claims FROM authenticated/.test(sql));
  check("policy eklenmiyor / FORCE RLS açılmıyor", !/CREATE POLICY/.test(sql) && !/FORCE ROW LEVEL SECURITY/.test(sql));

  console.log("\n[C] CREATE RPC imza + güvenlik");
  check("CREATE FUNCTION create (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_create_claim_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_create_claim_with_audit/.test(sql));
  check("RETURNS public.yebs_claims", /yebs_create_claim_with_audit[\s\S]*?RETURNS public\.yebs_claims/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_create_claim_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("11 parametre (…p_safety_topic…p_reason)", /p_outcome_type\s+text DEFAULT NULL,\s*p_safety_topic\s+text DEFAULT NULL,\s*p_reason\s+text DEFAULT NULL/.test(createBody));

  console.log("\n[D] Enum + coupling + claim_text");
  check("claim_type 6 enum (RPC body)", TYPES.every(t => new RegExp(`'${t}'`).test(createBody)) && /p_claim_type NOT IN \(/.test(createBody));
  check("provenance_kind 4 enum", PROV.every(t => new RegExp(`'${t}'`).test(createBody)) && /p_provenance_kind NOT IN \(/.test(createBody));
  check("evidence_layer 9 enum", LAYERS.every(t => new RegExp(`'${t}'`).test(createBody)) && /p_evidence_layer NOT IN \(/.test(createBody));
  check("claim_text btrim nonblank + ≤20000", /v_claim_text := btrim\(p_claim_text\)/.test(createBody) && /length\(v_claim_text\) > 20000/.test(createBody));
  check("claim_text zararlı C0 kontrol karakter reddi (tab/LF/CR hariç)", /translate\(v_claim_text, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'/.test(createBody));
  check("safety coupling: safety→snake zorunlu / diğer→NULL", /p_claim_type = 'safety' THEN[\s\S]*?v_safety_topic !~ '\^\[a-z\]\[a-z0-9_\]\*\$'[\s\S]*?ELSE[\s\S]*?v_safety_topic IS NOT NULL/.test(createBody));
  check("outcome safety zorunlu kümesi", SAFETY_OUT.every(t => new RegExp(`'${t}'`).test(createBody)));
  check("outcome research opsiyonel kümesi", RESEARCH_OUT.every(t => new RegExp(`'${t}'`).test(createBody)) && /p_claim_type = 'research_finding' THEN/.test(createBody));
  check("diğer claim_type → outcome_type NULL zorunlu", /ELSE\s*IF v_outcome_type IS NOT NULL THEN\s*RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT'/.test(createBody));
  check("reason HAM fidelity + C0 reddi", /btrim\(p_reason\) = '' OR length\(p_reason\) > 2000[\s\S]*?YEBS_REASON_INVALID/.test(createBody) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(createBody));

  console.log("\n[E] Parent + insert + audit");
  check("aktif admin gate", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(createBody));
  check("concept_id zorunlu", /p_concept_id IS NULL THEN\s*RAISE EXCEPTION 'YEBS_INVALID_CLAIM_INPUT'/.test(createBody));
  check("Concept FOR KEY SHARE (status gate YOK)", /PERFORM 1 FROM public\.yebs_concepts WHERE id = p_concept_id FOR KEY SHARE;/.test(createBody) && !/yebs_concepts[^\n;]*status/.test(createBody));
  check("YEBS_CLAIM_CONCEPT_NOT_FOUND", /YEBS_CLAIM_CONCEPT_NOT_FOUND/.test(createBody));
  check("INSERT status içermez (draft default)", /INSERT INTO public\.yebs_claims \(\s*concept_id, claim_type, claim_text, provenance_kind, evidence_layer,\s*outcome_type, safety_topic\s*\)/.test(createBody) && !/INSERT INTO public\.yebs_claims \([^)]*\bstatus\b/.test(createBody));
  check("duplicate constraint/error YOK", !/DOI_DUPLICATE|PMID_DUPLICATE|CLAIM_DUPLICATE|unique_violation/.test(createBody));
  check("audit action=create entity=claim", /'create', 'claim',/.test(createBody));
  check("audit changed_fields 7 alan", /'concept_id','claim_type','claim_text','provenance_kind','evidence_layer',\s*'outcome_type','safety_topic'/.test(createBody));
  check("previous NULL new=created", /'committed', NULL, to_jsonb\(v_created\)/.test(createBody));

  console.log("\n[F] EXECUTE + yasak SQL");
  check("create RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_create_claim_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("create RPC service_role REVOKE (write-gate ayrı)", /REVOKE ALL ON FUNCTION public\.yebs_create_claim_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
  check("DELETE FROM yebs_claims YOK", !/DELETE FROM public\.yebs_claims/.test(sql));
  check("remove/delete RPC YOK", !/yebs_delete_claim|yebs_remove_claim|'remove', 'claim'/.test(sql));
  check("status transition RPC YOK", !/'transition'|'publish'|'approve'|'archive', 'claim'/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
