// ============================================================
// YEBS API-A2 — Concept UPDATE audit RPC doğrulama harness'i
//
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi.
// FAIL → process.exit(1).
// ============================================================

import { readFileSync } from "node:fs";
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

let sql = "";
try { sql = readFileSync(MIG, "utf8"); ok("migration okunabildi"); }
catch (e) { bad("migration okunamadı", String(e && e.message)); }

if (sql) {
  // Yalnız update RPC gövdesini izole et (audit changed_fields karışmasın).
  const idx = sql.indexOf("yebs_update_concept_with_audit");
  const body = idx >= 0 ? sql.slice(idx) : sql;

  console.log("\n[A] UPDATE RPC imzası + güvenlik");
  check("CREATE FUNCTION update", /CREATE FUNCTION public\.yebs_update_concept_with_audit\(/.test(sql));
  check("CREATE OR REPLACE değil", !/CREATE OR REPLACE FUNCTION public\.yebs_update_concept_with_audit/.test(sql));
  check("RETURNS public.yebs_concepts", /CREATE FUNCTION public\.yebs_update_concept_with_audit[\s\S]*?RETURNS public\.yebs_concepts/.test(sql));
  check("SECURITY DEFINER + search_path", /yebs_update_concept_with_audit[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql));
  check("7 parametre (…,concept_id,expected_updated_at,patch,reason)",
    /p_concept_id\s+uuid,\s*p_expected_updated_at timestamptz,\s*p_patch\s+jsonb,\s*p_reason\s+text/.test(sql));

  console.log("\n[B] Patch allowlist (yalnız slug, concept_type)");
  check("patch anahtar allowlist slug/concept_type", /k NOT IN \('slug', 'concept_type'\)/.test(sql));
  check("boş patch reddi", /p_patch = '\{\}'::jsonb THEN\s*RAISE EXCEPTION 'YEBS_INVALID_PATCH'/.test(sql));
  check("patch object olmalı", /jsonb_typeof\(p_patch\) <> 'object'/.test(sql));
  check("tradition_id patch-dışı (whitelist'te yok → INVALID_PATCH)", !/k NOT IN \([^)]*tradition_id/.test(sql));
  check("status patch-dışı", !/k NOT IN \([^)]*status/.test(sql));
  check("school_id patch-dışı", !/k NOT IN \([^)]*school_id/.test(sql));

  console.log("\n[C] Concurrency + gate");
  check("reason ZORUNLU (null/blank/>2000 → REASON_INVALID)", /p_reason IS NULL\s*OR btrim\(p_reason\) = ''\s*OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(sql));
  check("expected_updated_at required", /p_expected_updated_at IS NULL THEN\s*RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED'/.test(sql));
  check("hedef FOR UPDATE", /FROM public\.yebs_concepts\s*WHERE id = p_concept_id\s*FOR UPDATE/.test(sql));
  check("CONCEPT_NOT_FOUND", /YEBS_CONCEPT_NOT_FOUND/.test(body));
  check("draft status gate", /v_existing\.status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED'/.test(sql));
  check("stale (updated_at IS DISTINCT FROM expected)", /v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_STALE_UPDATE'/.test(sql));

  console.log("\n[D] Merge + changed_fields + no-op");
  check("slug omitted→existing", /jsonb_exists\(p_patch, 'slug'\) THEN\s*v_slug := p_patch ->> 'slug';\s*ELSE\s*v_slug := v_existing\.slug/.test(sql));
  check("concept_type omitted→existing", /jsonb_exists\(p_patch, 'concept_type'\) THEN\s*v_concept_type := p_patch ->> 'concept_type';\s*ELSE\s*v_concept_type := v_existing\.concept_type/.test(sql));
  check("merged concept_type enum re-validate", /v_concept_type NOT IN \(\s*'energy_center'/.test(sql));
  check("changed_fields sabit sıra slug→concept_type",
    sql.indexOf("v_changed := v_changed || 'slug'") < sql.indexOf("v_changed := v_changed || 'concept_type'"));
  check("no-op → CONCEPT_NO_CHANGES (UPDATE'ten önce)",
    /cardinality\(v_changed\) = 0 THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_NO_CHANGES'/.test(sql));

  console.log("\n[E] UPDATE + audit");
  check("UPDATE yalnız slug + concept_type", /SET slug\s*=\s*v_slug,\s*concept_type = v_concept_type/.test(sql));
  check("update unique_violation → CONCEPT_DUPLICATE", /UPDATE public\.yebs_concepts[\s\S]*?unique_violation THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_DUPLICATE'/.test(sql));
  check("audit action=update entity=concept", /'update',\s*'concept',/.test(sql));
  check("previous=existing new=updated", /to_jsonb\(v_existing\),\s*to_jsonb\(v_updated\)/.test(sql));
  check("audit changed_fields = v_changed", /to_jsonb\(v_updated\),\s*v_changed,\s*p_reason/.test(sql));

  console.log("\n[F] EXECUTE privilege");
  check("update RPC GRANT EXECUTE service_role", /GRANT EXECUTE ON FUNCTION public\.yebs_update_concept_with_audit\([\s\S]*?\) TO service_role/.test(sql));
  check("update RPC REVOKE service_role", /REVOKE ALL ON FUNCTION public\.yebs_update_concept_with_audit\([\s\S]*?\) FROM service_role/.test(sql));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
