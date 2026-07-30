// ============================================================
// YEBS API-A4B — Claim Source ATTACH audit RPC + write-gate harness'i
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260830000000_yebs_claim_source_mutations.sql");

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
  const body = (sql.match(/CREATE FUNCTION public\.yebs_attach_claim_source_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] Transaction + şema/D7/AUD1 dokunmama");
  check("tek BEGIN;/COMMIT;", (sql.match(/^BEGIN;/m) || []).length === 1 && (sql.match(/^COMMIT;/m) || []).length === 1);
  check("yebs_claim_sources tablo drop/recreate/şema-ALTER YOK", !/DROP TABLE|CREATE TABLE public\.yebs_claim_sources|ALTER TABLE public\.yebs_claim_sources\s+(ADD|DROP|ALTER)\s+(COLUMN|CONSTRAINT)/.test(sql));
  check("D6/D7/AUD1 CHECK'ine dokunulmuyor", !/ALTER TABLE public\.(yebs_claims|yebs_audit_events)\b/.test(sql) && !/ADD CONSTRAINT yebs_claim_sources_/.test(sql));

  console.log("\n[B] Write-gate");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_claim_sources FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_claim_sources TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE", /yebs_claim_sources FROM PUBLIC/.test(sql) && /yebs_claim_sources FROM anon/.test(sql) && /yebs_claim_sources FROM authenticated/.test(sql));
  check("policy eklenmiyor / FORCE RLS açılmıyor", !/CREATE POLICY/.test(sql) && !/FORCE ROW LEVEL SECURITY/.test(sql));

  console.log("\n[C] ATTACH RPC imza + güvenlik");
  check("CREATE FUNCTION attach (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_attach_claim_source_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_attach_claim_source_with_audit/.test(sql));
  check("RETURNS public.yebs_claim_sources", /yebs_attach_claim_source_with_audit[\s\S]*?RETURNS public\.yebs_claim_sources/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_attach_claim_source_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("18 parametre (…p_rationale…p_reason)", /p_translation_language_tag\s+text DEFAULT NULL,\s*p_rationale\s+text DEFAULT NULL,\s*p_reason\s+text DEFAULT NULL/.test(body));

  console.log("\n[D] Enum + text sınırları + coupling");
  check("source_role 4 enum", ["primary_support", "supporting", "contradiction", "context"].every(t => new RegExp(`'${t}'`).test(body)) && /p_source_role NOT IN \(/.test(body));
  check("rationale_status 2 enum", /p_rationale_status NOT IN \(\s*'from_source','source_gives_no_rationale'/.test(body));
  check("source_id zorunlu", /p_source_id IS NULL THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_INVALID_INPUT'/.test(body));
  check("locator/url ≤2000", /length\(v_locator\) > 2000/.test(body) && /length\(v_url_frag\) > 2000/.test(body));
  check("excerpt/translit/ftrans ≤50000", /length\(v_excerpt\) > 50000/.test(body) && /length\(v_translit\) > 50000/.test(body) && /length\(v_ftrans\) > 50000/.test(body));
  check("scheme ≤200", /length\(v_translit_sch\) > 200/.test(body));
  check("rationale ≤20000", /length\(v_rationale\) > 20000/.test(body));
  check("zararlı C0 reddi (excerpt örn.)", /translate\(v_excerpt, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'/.test(body));
  check("BCP-47 excerpt/translation dili", /v_excerpt_lang !~ '\^\[A-Za-z\]\{2,3\}/.test(body) && /v_trans_lang !~ '\^\[A-Za-z\]\{2,3\}/.test(body));
  check("ISO-15924 script", /v_excerpt_scr !~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(body));
  check("coupling rationale↔status", /p_rationale_status = 'from_source' THEN[\s\S]*?v_rationale IS NULL[\s\S]*?ELSE[\s\S]*?v_rationale IS NOT NULL/.test(body));
  check("coupling excerpt↔dil/script", /v_excerpt IS NULL THEN[\s\S]*?v_excerpt_lang IS NOT NULL OR v_excerpt_scr IS NOT NULL[\s\S]*?ELSE[\s\S]*?v_excerpt_lang IS NULL/.test(body));
  check("coupling transliteration→excerpt", /v_translit IS NOT NULL AND v_excerpt IS NULL THEN/.test(body));
  check("coupling scheme→transliteration", /v_translit_sch IS NOT NULL AND v_translit IS NULL THEN/.test(body));
  check("coupling ftrans→excerpt", /v_ftrans IS NOT NULL AND v_excerpt IS NULL THEN/.test(body));
  check("coupling ftrans↔translation_lang", /\(v_ftrans IS NULL\) <> \(v_trans_lang IS NULL\)/.test(body));
  check("reason HAM fidelity + C0 reddi", /btrim\(p_reason\) = '' OR length\(p_reason\) > 2000[\s\S]*?YEBS_REASON_INVALID/.test(body) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(body));

  console.log("\n[E] Parent/Source + insert + audit");
  check("aktif admin gate", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(body));
  check("Claim FOR UPDATE + draft gate", /FROM public\.yebs_claims c\s*WHERE c\.id = p_claim_id FOR UPDATE/.test(body) && /v_claim_status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_CLAIM_LOCKED'/.test(body));
  check("Claim not found 404 kodu", /YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND/.test(body));
  check("Source FOR KEY SHARE (status gate YOK)", /FROM public\.yebs_sources WHERE id = p_source_id FOR KEY SHARE/.test(body) && !/yebs_sources[^\n;]*status/.test(body));
  check("Source not found kodu", /YEBS_CLAIM_SOURCE_SOURCE_NOT_FOUND/.test(body));
  check("INSERT verification_status içermez (default unverified)", /INSERT INTO public\.yebs_claim_sources \(\s*claim_id, source_id, source_role[\s\S]*?rationale, rationale_status\s*\)/.test(body) && !/INSERT INTO public\.yebs_claim_sources \([^)]*verification_status/.test(body));
  check("duplicate constraint/uyarı YOK", !/DUPLICATE|unique_violation/.test(body));
  check("audit action=create entity=claim_source", /'create', 'claim_source',/.test(body));
  check("audit changed_fields 15 alan (verification_status dahil)", /'claim_id','source_id','source_role'[\s\S]*?'rationale','rationale_status','verification_status'/.test(body));
  check("previous NULL new=created", /'committed', NULL, to_jsonb\(v_created\)/.test(body));

  console.log("\n[F] EXECUTE + yasak SQL");
  check("attach RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_attach_claim_source_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("attach RPC service_role REVOKE (write-gate ayrı)", /REVOKE ALL ON FUNCTION public\.yebs_attach_claim_source_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
  check("DELETE FROM yebs_claims YOK", !/DELETE FROM public\.yebs_claims\b/.test(sql));
  check("DELETE FROM yebs_sources YOK", !/DELETE FROM public\.yebs_sources/.test(sql));
  check("Claim/Source delete RPC YOK", !/yebs_delete_claim|yebs_delete_source|yebs_remove_claim\b/.test(sql));
  check("status/verification transition YOK", !/'transition'|SET verification_status|SET status/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
