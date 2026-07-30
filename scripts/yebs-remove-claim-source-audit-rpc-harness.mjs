// ============================================================
// YEBS API-A4B — Claim Source REMOVE (detach) audit RPC harness'i (statik SQL). FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260902000000_yebs_claim_source_mutations.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  const body = (sql.match(/CREATE FUNCTION public\.yebs_remove_claim_source_with_audit\([\s\S]*?\$\$;/) || [""])[0];

  console.log("\n[A] REMOVE RPC imza + güvenlik");
  check("CREATE FUNCTION remove (OR REPLACE değil)", /CREATE FUNCTION public\.yebs_remove_claim_source_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_remove_claim_source_with_audit/.test(sql));
  check("RETURNS public.yebs_claim_sources", /yebs_remove_claim_source_with_audit[\s\S]*?RETURNS public\.yebs_claim_sources/.test(sql));
  check("SECURITY DEFINER + güvenli search_path", /yebs_remove_claim_source_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 param (…claim_source_id, expected_updated_at, reason)", /p_claim_id\s+uuid,\s*p_claim_source_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_reason\s+text/.test(body));

  console.log("\n[B] Gate + concurrency + ownership");
  check("reason ZORUNLU + fidelity + C0 reddi", /p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(body) && /translate\(p_reason, e'\\t\\n\\r', ''\) ~ '\[\[:cntrl:\]\]'[\s\S]*?YEBS_REASON_INVALID/.test(body));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(body));
  check("aktif admin gate", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(body));
  check("hedef junction FOR UPDATE", /FROM public\.yebs_claim_sources\s*WHERE id = p_claim_source_id FOR UPDATE/.test(body));
  check("NOT_FOUND", /YEBS_CLAIM_SOURCE_NOT_FOUND/.test(body));
  check("path aidiyeti (claim_id eşleşmesi)", /v_existing\.claim_id IS DISTINCT FROM p_claim_id THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_NOT_FOUND'/.test(body));
  check("parent Claim FOR UPDATE + draft gate", /FROM public\.yebs_claims c\s*WHERE c\.id = v_existing\.claim_id FOR UPDATE/.test(body) && /v_claim_status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_CLAIM_LOCKED'/.test(body));
  check("stale", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_CLAIM_SOURCE_STALE_UPDATE'/.test(body));

  console.log("\n[C] Audit-önce + yalnız junction DELETE + snapshot");
  // audit INSERT'i DELETE'ten ÖNCE gelmeli (indeks sırası)
  const iAudit = body.indexOf("INSERT INTO public.yebs_audit_events");
  const iDelete = body.indexOf("DELETE FROM public.yebs_claim_sources");
  check("önce audit, sonra DELETE (sıra)", iAudit > 0 && iDelete > 0 && iAudit < iDelete);
  check("audit action=remove entity=claim_source", /'remove', 'claim_source',/.test(body));
  check("full previous snapshot (previous=existing, new=NULL)", /'committed', to_jsonb\(v_existing\), NULL, ARRAY\[\]::text\[\]/.test(body));
  check("yalnız junction DELETE (WHERE id)", /DELETE FROM public\.yebs_claim_sources WHERE id = p_claim_source_id;/.test(body));
  check("removed canonical row return", /RETURN v_existing;/.test(body));

  console.log("\n[D] Yasak: Claim/Source silme yok + EXECUTE");
  check("DELETE FROM yebs_claims YOK", !/DELETE FROM public\.yebs_claims\b/.test(sql));
  check("DELETE FROM yebs_sources YOK", !/DELETE FROM public\.yebs_sources/.test(sql));
  check("status/verification transition YOK", !/SET status|SET verification_status|'transition'/.test(sql));
  check("remove RPC EXECUTE yalnız service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_remove_claim_source_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("remove RPC service_role REVOKE", /REVOKE ALL ON FUNCTION public\.yebs_remove_claim_source_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
  // Yalnızca 3 RPC (attach/update/remove); dördüncü fonksiyon yok
  check("migration'da tam 3 CREATE FUNCTION (statement)", (sql.match(/^CREATE FUNCTION public\./gm) || []).length === 3);
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
