// ============================================================
// YEBS API-A3 — Source CREATE audit RPC + şema genişletme + write-gate harness'i
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260826000000_yebs_source_mutations.sql");

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
  const OLD_TYPES = ["classical_text","book","journal_article","regulatory_document","monograph","standard","database_record","thesis","website","oral_tradition_record","other"];
  const NEW_TYPES = ["institutional_report","archival_document","media_recording","interview_record","field_observation_record","experiential_record"];

  console.log("\n[A] Transaction + additif şema");
  check("tek BEGIN;/COMMIT;", (sql.match(/^BEGIN;/m)||[]).length===1 && (sql.match(/^COMMIT;/m)||[]).length===1);
  check("accessed_on date ADD COLUMN (IF NOT EXISTS yok → fail-closed)",
    /ALTER TABLE public\.yebs_sources\s*ADD COLUMN accessed_on date;/.test(sql) && !/ADD COLUMN IF NOT EXISTS accessed_on/.test(sql));
  check("source_type CHECK exact adla DROP", /DROP CONSTRAINT yebs_sources_source_type_chk;/.test(sql));
  check("source_type CHECK exact adla ADD", /ADD CONSTRAINT yebs_sources_source_type_chk CHECK/.test(sql));
  check("tablo drop/recreate YOK", !/DROP TABLE|CREATE TABLE public\.yebs_sources/.test(sql));
  check("D5/claim_sources/relation_sources/audit tablolarına ALTER yok",
    !/ALTER TABLE public\.(yebs_claim_sources|yebs_concept_relation_sources|yebs_audit_events)\b/.test(sql));

  console.log("\n[B] source_type 17 değer (11 eski superset + 6 yeni)");
  for (const t of OLD_TYPES) check(`eski değer korunuyor: ${t}`, new RegExp(`'${t}'`).test(sql));
  for (const t of NEW_TYPES) check(`yeni değer mevcut: ${t}`, new RegExp(`'${t}'`).test(sql));
  // ADD CONSTRAINT bloğunda tam 17 değer
  const addBlock = (sql.match(/ADD CONSTRAINT yebs_sources_source_type_chk CHECK \([\s\S]*?\);/)||[""])[0];
  check("ADD CHECK bloğunda 17 exact değer", (addBlock.match(/'[a-z_]+'/g)||[]).length === 17, `bulunan=${(addBlock.match(/'[a-z_]+'/g)||[]).length}`);

  console.log("\n[C] Write-gate");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_sources FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_sources TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE", /yebs_sources FROM PUBLIC/.test(sql) && /yebs_sources FROM anon/.test(sql) && /yebs_sources FROM authenticated/.test(sql));
  check("policy eklenmiyor / FORCE RLS açılmıyor", !/CREATE POLICY/.test(sql) && !/FORCE ROW LEVEL SECURITY/.test(sql));

  console.log("\n[D] CREATE RPC imza + güvenlik");
  check("CREATE FUNCTION create (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_create_source_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_create_source_with_audit/.test(sql));
  check("RETURNS public.yebs_sources", /yebs_create_source_with_audit[\s\S]*?RETURNS public\.yebs_sources/.test(sql));
  check("SECURITY DEFINER + search_path", /yebs_create_source_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("22 parametre (…accessed_on date…reason)", /p_tradition_context_id uuid\s+DEFAULT NULL,\s*p_accessed_on\s+date\s+DEFAULT NULL,\s*p_notes\s+text\s+DEFAULT NULL,\s*p_reason\s+text\s+DEFAULT NULL/.test(sql));

  console.log("\n[E] Validation + normalizasyon");
  check("source_type 17 enum kontrolü (RPC body)", /p_source_type NOT IN \(\s*'classical_text'[\s\S]*?'experiential_record'\s*\)/.test(sql));
  check("title zorunlu btrim nonblank", /p_title IS NULL OR btrim\(p_title\) = ''/.test(sql));
  check("language_tag BCP-47", /v_lang !~ '\^\[A-Za-z\]\{2,3\}/.test(sql));
  check("doi lower(btrim) normalize", /v_doi := nullif\(lower\(btrim\(coalesce\(p_doi, ''\)\)\), ''\)/.test(sql));
  check("doi 10.% guard", /v_doi IS NOT NULL AND v_doi NOT LIKE '10\.%'/.test(sql));
  check("pmid btrim normalize + regex", /v_pmid := nullif\(btrim\(coalesce\(p_pmid, ''\)\), ''\)/.test(sql) && /v_pmid !~ '\^\[1-9\]\[0-9\]\*\$'/.test(sql));
  check("isbn boşluk/tire sıyır + x→X", /translate\(regexp_replace\(coalesce\(p_isbn, ''\), '\[\[:space:\]-\]', '', 'g'\), 'x', 'X'\)/.test(sql));
  check("url dış btrim + http(s)", /v_url := nullif\(btrim\(coalesce\(p_url, ''\)\), ''\)/.test(sql) && /v_url !~ '\^https\?:\/\/'/.test(sql));
  check("publication_year -3000..2100", /p_publication_year < -3000 OR p_publication_year > 2100/.test(sql));
  check("opsiyonel insan alanı btrim→NULL (authors örn.)", /v_authors\s*:= nullif\(btrim\(coalesce\(p_authors, ''\)\), ''\)/.test(sql));
  check("reason HAM fidelity (btrim yalnız boşluk)", /IF p_reason IS NOT NULL THEN[\s\S]*?btrim\(p_reason\) = '' OR length\(p_reason\) > 2000[\s\S]*?YEBS_REASON_INVALID/.test(sql));

  console.log("\n[F] Parent + insert + duplicate ayrımı");
  check("aktif admin gate", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(sql));
  check("tradition_context FOR KEY SHARE (status gate YOK)", /FROM public\.yebs_traditions\s*WHERE id = p_tradition_context_id FOR KEY SHARE/.test(sql));
  check("YEBS_SOURCE_TRADITION_NOT_FOUND", /YEBS_SOURCE_TRADITION_NOT_FOUND/.test(sql));
  check("INSERT status içermez (draft default)", /INSERT INTO public\.yebs_sources \(\s*source_type, title, language_tag[\s\S]*?document_no, tradition_context_id, accessed_on, notes\s*\)/.test(sql) && !/INSERT INTO public\.yebs_sources \([^)]*status/.test(sql));
  // 42601 REGRESYON KAPISI: geçerli diagnostics öğesi
  check("GET STACKED DIAGNOSTICS = CONSTRAINT_NAME (geçerli öğe)", /GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;/.test(sql));
  check("hatalı PG_EXCEPTION_CONSTRAINT_NAME YOK (42601 kapısı)", !/PG_EXCEPTION_CONSTRAINT_NAME/.test(sql));
  check("doi dup → DOI_DUPLICATE", /v_constraint = 'yebs_sources_doi_key' THEN\s*RAISE EXCEPTION 'YEBS_SOURCE_DOI_DUPLICATE'/.test(sql));
  check("pmid dup → PMID_DUPLICATE", /v_constraint = 'yebs_sources_pmid_key' THEN\s*RAISE EXCEPTION 'YEBS_SOURCE_PMID_DUPLICATE'/.test(sql));
  check("isbn duplicate kontrolü YOK (isbn unique index yok)", !/yebs_sources_isbn_key/.test(sql));

  console.log("\n[G] Audit + EXECUTE");
  check("audit action=create entity=source", /'create', 'source',/.test(sql));
  check("audit changed_fields 18 alan", /'source_type','title','language_tag'[\s\S]*?'accessed_on','notes'/.test(sql));
  check("previous NULL new=created", /'committed', NULL, to_jsonb\(v_created\)/.test(sql));
  check("create RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_create_source_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("create RPC service_role REVOKE (write-gate ayrı)", /REVOKE ALL ON FUNCTION public\.yebs_create_source_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
