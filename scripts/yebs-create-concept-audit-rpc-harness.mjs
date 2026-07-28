// ============================================================
// YEBS API-A2 — Concept CREATE audit RPC + write-gate doğrulama harness'i
//
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi.
// NEYİ KANITLAR: migration metnindeki RPC signature, SECURITY DEFINER, write-gate,
//   parent lock, audit changed_fields sırası, EXECUTE grant modeli.
// NEYİ KANITLAMAZ: canlı DB uygulaması/gerçek atomiklik (production apply işi).
//
// FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260822000000_yebs_concept_mutations.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

console.log("\n[A] Migration dosyası");
check("concept mutations migration mevcut", existsSync(MIG));
let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  console.log("\n[B] Write-gate (yebs_concepts)");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_concepts FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_concepts TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE",
    /REVOKE ALL ON TABLE public\.yebs_concepts FROM PUBLIC/.test(sql) &&
    /REVOKE ALL ON TABLE public\.yebs_concepts FROM anon/.test(sql) &&
    /REVOKE ALL ON TABLE public\.yebs_concepts FROM authenticated/.test(sql));
  check("ALTER TABLE yok (şema değişmez)", !/ALTER TABLE public\.yebs_concepts/.test(sql));
  check("A0/A1 tablo privilege dokunulmuyor (schools/traditions REVOKE/GRANT yok)",
    !/(REVOKE|GRANT)[^\n]*ON TABLE public\.(yebs_schools|yebs_traditions)\b/.test(sql));

  console.log("\n[C] CREATE RPC imzası + güvenlik");
  check("CREATE FUNCTION (CREATE OR REPLACE değil)", /CREATE FUNCTION public\.yebs_create_concept_with_audit\(/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.yebs_create_concept_with_audit/.test(sql));
  check("RETURNS public.yebs_concepts", /RETURNS public\.yebs_concepts/.test(sql));
  check("SECURITY DEFINER", /SECURITY DEFINER/.test(sql));
  check("search_path = pg_catalog, public", /SET search_path = pg_catalog, public/.test(sql));
  check("dynamic SQL (EXECUTE) yok", !/\bEXECUTE\b\s+format|EXECUTE\s+'/.test(sql));
  check("gövdede COMMIT/ROLLBACK ifadesi yok (tek COMMIT; ifadesi, ROLLBACK; yok)",
    (sql.match(/COMMIT;/g) || []).length === 1 && !/\bROLLBACK\s*;/.test(sql));
  check("8 parametre (actor,request,operation,tradition,school,slug,type,reason)",
    /p_actor_admin_id uuid,\s*p_request_id\s+uuid,\s*p_operation_id\s+uuid,\s*p_tradition_id\s+uuid,\s*p_school_id\s+uuid,\s*p_slug\s+text,\s*p_concept_type\s+text,\s*p_reason\s+text DEFAULT NULL/.test(sql));

  console.log("\n[D] Validation sırası + parent lock");
  check("request_id required", /YEBS_REQUEST_ID_REQUIRED/.test(sql));
  check("operation_id required", /YEBS_OPERATION_ID_REQUIRED/.test(sql));
  check("tradition_id required", /YEBS_TRADITION_ID_REQUIRED/.test(sql));
  check("slug regex D3 birebir", /p_slug !~ '\^\[a-z\]\[a-z0-9_\]\*\$'/.test(sql));
  check("concept_type 7-enum", /'energy_center', 'channel', 'vital_substance', 'anatomy_model',\s*'technique', 'principle', 'other'/.test(sql));
  check("reason opsiyonel fidelity (IF p_reason IS NOT NULL)", /IF p_reason IS NOT NULL THEN[\s\S]*?YEBS_REASON_INVALID/.test(sql));
  check("aktif admin (role=admin AND active)", /v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE/.test(sql));
  check("parent tradition FOR KEY SHARE", /FROM public\.yebs_traditions\s*WHERE id = p_tradition_id\s*FOR KEY SHARE/.test(sql));
  check("YEBS_PARENT_TRADITION_NOT_FOUND", /YEBS_PARENT_TRADITION_NOT_FOUND/.test(sql));
  check("school_id doluysa kompozit FOR KEY SHARE", /FROM public\.yebs_schools\s*WHERE id = p_school_id\s*AND tradition_id = p_tradition_id\s*FOR KEY SHARE/.test(sql));
  check("YEBS_PARENT_SCHOOL_NOT_FOUND", /YEBS_PARENT_SCHOOL_NOT_FOUND/.test(sql));
  check("parent status GATE EDİLMİYOR (status okuma yok tradition/school lock'ta)",
    !/yebs_traditions[\s\S]*?status/.test(sql.split("yebs_create_concept_with_audit")[1] || sql));

  console.log("\n[E] INSERT + hata sınıflandırma");
  check("INSERT yalnız 4 canonical alan (status/id/timestamps DB default)",
    /INSERT INTO public\.yebs_concepts \(\s*tradition_id, school_id, slug, concept_type\s*\)\s*VALUES \(\s*p_tradition_id, p_school_id, p_slug, p_concept_type\s*\)/.test(sql));
  check("unique_violation → CONCEPT_DUPLICATE", /unique_violation THEN\s*[\s\S]*?YEBS_CONCEPT_DUPLICATE/.test(sql));
  check("check_violation → INVALID_CONCEPT_INPUT", /check_violation THEN\s*RAISE EXCEPTION 'YEBS_INVALID_CONCEPT_INPUT'/.test(sql));

  console.log("\n[F] Audit sözleşmesi");
  check("action=create entity_type=concept", /'create',\s*'concept',/.test(sql));
  check("outcome committed, previous NULL", /'committed',\s*NULL,\s*to_jsonb\(v_created\)/.test(sql));
  check("changed_fields SABİT sıra [tradition_id, school_id, slug, concept_type]",
    /ARRAY\[\s*'tradition_id',\s*'school_id',\s*'slug',\s*'concept_type'\s*\]::text\[\]/.test(sql));
  check("reason raw (p_reason audit'e)", /to_jsonb\(v_created\),\s*ARRAY\[[\s\S]*?\]::text\[\],\s*p_reason,/.test(sql));
  check("audit INSERT INSERT'ten SONRA handler yok (rollback)", sql.indexOf("INSERT INTO public.yebs_audit_events") > sql.indexOf("INSERT INTO public.yebs_concepts"));

  console.log("\n[G] EXECUTE privilege modeli");
  check("create RPC REVOKE service_role", /REVOKE ALL ON FUNCTION public\.yebs_create_concept_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
  check("create RPC GRANT EXECUTE service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_create_concept_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("create RPC PUBLIC/anon/authenticated REVOKE",
    /yebs_create_concept_with_audit\([\s\S]*?\) FROM PUBLIC/.test(sql) &&
    /yebs_create_concept_with_audit\([\s\S]*?\) FROM anon/.test(sql) &&
    /yebs_create_concept_with_audit\([\s\S]*?\) FROM authenticated/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
