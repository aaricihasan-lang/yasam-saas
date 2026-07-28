// ============================================================
// YEBS API-A3 — Source UPDATE audit RPC harness'i (statik SQL sözleşmesi). FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
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

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const MUTABLE = ["source_type","title","language_tag","script_code","authors","organization","publisher","publication_year","dating_note","edition","doi","pmid","isbn","url","document_no","tradition_context_id","accessed_on","notes"];

  console.log("\n[A] UPDATE RPC imza + güvenlik");
  check("CREATE FUNCTION update (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_update_source_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_update_source_with_audit/.test(sql));
  check("RETURNS public.yebs_sources", /yebs_update_source_with_audit[\s\S]*?RETURNS public\.yebs_sources/.test(sql));
  check("SECURITY DEFINER + search_path", /yebs_update_source_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 param (…source_id, expected_updated_at, patch, reason)", /p_source_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_patch\s+jsonb,\s*p_reason\s+text/.test(sql));

  console.log("\n[B] Patch allowlist 18 + kontrol");
  check("patch allowlist tam 18 mutable anahtar", MUTABLE.every(k => new RegExp(`'${k}'`).test(sql)));
  check("status patch-dışı", !/k NOT IN \([^)]*'status'/.test(sql));
  check("id/created_at/updated_at patch-dışı", !/k NOT IN \([^)]*'(id|created_at|updated_at)'/.test(sql));
  check("boş patch reddi", /p_patch = '\{\}'::jsonb THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(sql));
  check("unknown key → INVALID_PATCH", /k NOT IN \([\s\S]*?\)\s*\)\s*THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(sql));

  console.log("\n[C] Concurrency + gate");
  check("reason ZORUNLU", /p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(sql));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(sql));
  check("hedef FOR UPDATE", /FROM public\.yebs_sources\s*WHERE id = p_source_id FOR UPDATE/.test(sql));
  check("SOURCE_NOT_FOUND", /YEBS_SOURCE_NOT_FOUND/.test(sql));
  check("draft status gate", /v_existing\.status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_SOURCE_STATUS_LOCKED'/.test(sql));
  check("stale", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_SOURCE_STALE_UPDATE'/.test(sql));

  console.log("\n[D] Merge + normalize + strict tipler");
  check("omitted → existing (title örn.)", /v_title := v_existing\.title/.test(sql));
  check("script_code explicit null desteklenir", /jsonb_typeof\(p_patch -> 'script_code'\) = 'null'/.test(sql));
  check("publication_year number|null + integer + range", /jsonb_typeof\(p_patch -> 'publication_year'\) NOT IN \('number', 'null'\)/.test(sql) && /floor\(\(p_patch -> 'publication_year'\)::numeric\)/.test(sql));
  check("accessed_on YYYY-MM-DD strict", /p_patch ->> 'accessed_on'\) !~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$'/.test(sql));
  check("doi re-normalize + 10.%", /v_doi := nullif\(lower\(btrim\(p_patch ->> 'doi'\)\), ''\)/.test(sql));
  check("isbn re-normalize (translate/regexp)", /translate\(regexp_replace\(p_patch ->> 'isbn', '\[\[:space:\]-\]', '', 'g'\), 'x', 'X'\)/.test(sql));
  check("tradition_context_id mutable + null + existence", /v_trad_ctx IS NOT NULL AND v_trad_ctx IS DISTINCT FROM v_existing\.tradition_context_id/.test(sql) && /FROM public\.yebs_traditions WHERE id = v_trad_ctx FOR KEY SHARE/.test(sql));

  console.log("\n[E] changed_fields + no-op + audit");
  // 18 alan sabit sıra
  const order = MUTABLE.map(k => sql.indexOf(`v_changed := v_changed || '${k}'`));
  check("changed_fields tam 18 alan mevcut", order.every(i => i >= 0));
  check("changed_fields sabit artan sıra", order.every((p,i)=> i===0 || p>order[i-1]));
  check("no-op → NO_CHANGES", /cardinality\(v_changed\) = 0 THEN\s*RAISE EXCEPTION 'YEBS_SOURCE_NO_CHANGES'/.test(sql));
  check("update unique_violation → doi/pmid dup ayrımı", /UPDATE public\.yebs_sources[\s\S]*?GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;[\s\S]*?YEBS_SOURCE_DOI_DUPLICATE[\s\S]*?YEBS_SOURCE_PMID_DUPLICATE/.test(sql));
  check("hatalı PG_EXCEPTION_CONSTRAINT_NAME YOK", !/PG_EXCEPTION_CONSTRAINT_NAME/.test(sql));
  check("UPDATE status kolonu içermez", !/SET[\s\S]*?\bstatus\s*=/.test(sql.match(/UPDATE public\.yebs_sources[\s\S]*?RETURNING/)?.[0] || ""));
  check("audit action=update entity=source, previous/new snapshot", /'update', 'source'[\s\S]*?to_jsonb\(v_existing\), to_jsonb\(v_updated\), v_changed, p_reason/.test(sql));

  console.log("\n[F] DELETE/remove yok + EXECUTE");
  check("remove/DELETE RPC YOK", !/yebs_delete_source|yebs_remove_source|'remove', 'source'/.test(sql));
  check("DELETE FROM yebs_sources YOK", !/DELETE FROM public\.yebs_sources/.test(sql));
  check("update RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_update_source_with_audit\([\s\S]*?\) TO service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
