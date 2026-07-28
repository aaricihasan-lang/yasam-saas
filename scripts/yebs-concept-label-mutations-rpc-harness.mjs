// ============================================================
// YEBS API-A2 — Concept Label CREATE/UPDATE/DELETE audit RPC + write-gate harness'i
//
// SALT-OKUNUR statik SQL/migration kaynak-sözleşmesi denetimi.
// Kritik: delete audit action = 'remove' (AUD1 action CHECK'inden birebir).
// FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG = resolve(ROOT, "supabase/migrations/20260823000000_yebs_concept_label_mutations.sql");
const AUD1 = resolve(ROOT, "supabase/migrations/20260803010000_yebs_audit_events.sql");

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

console.log("\n[A] Migration + AUD1 kaynak");
check("label mutations migration mevcut", existsSync(MIG));
check("AUD1 migration mevcut", existsSync(AUD1));
let sql = "", aud = "";
try { sql = readFileSync(MIG, "utf8"); aud = readFileSync(AUD1, "utf8"); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (sql && aud) {
  console.log("\n[B] AUD1 action gerçek doğrulama (delete=remove)");
  check("AUD1 action CHECK 'remove' içerir", /action IN \([\s\S]*?'remove'[\s\S]*?\)/.test(aud));
  check("AUD1 action CHECK 'delete' İÇERMEZ", !/action IN \([\s\S]*?'delete'[\s\S]*?\)/.test(aud));
  check("AUD1 entity_type 'concept_label' içerir", /entity_type IN \([\s\S]*?'concept_label'[\s\S]*?\)/.test(aud));
  check("delete RPC action='remove' kullanıyor", /'remove', 'concept_label'/.test(sql));
  check("delete RPC 'delete' action KULLANMIYOR", !/'delete',\s*'concept_label'/.test(sql));

  console.log("\n[C] Write-gate (yebs_concept_labels)");
  check("REVOKE ALL PRIVILEGES service_role", /REVOKE ALL PRIVILEGES ON TABLE public\.yebs_concept_labels FROM service_role/.test(sql));
  check("GRANT SELECT service_role", /GRANT SELECT ON TABLE public\.yebs_concept_labels TO service_role/.test(sql));
  check("PUBLIC/anon/authenticated REVOKE",
    /yebs_concept_labels FROM PUBLIC/.test(sql) && /yebs_concept_labels FROM anon/.test(sql) && /yebs_concept_labels FROM authenticated/.test(sql));
  check("ALTER TABLE yok", !/ALTER TABLE public\.yebs_concept_labels/.test(sql));
  check("AUD1/D3/D4 şeması ALTER yok", !/ALTER TABLE public\.yebs_(audit_events|concepts)\b/.test(sql));

  console.log("\n[D] Üç RPC imzası + güvenlik");
  for (const fn of ["yebs_create_concept_label_with_audit", "yebs_update_concept_label_with_audit", "yebs_delete_concept_label_with_audit"]) {
    check(`${fn} CREATE FUNCTION`, new RegExp(`CREATE FUNCTION public\\.${fn}\\(`).test(sql));
    check(`${fn} SECURITY DEFINER + search_path`, new RegExp(`${fn}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = pg_catalog, public`).test(sql));
    check(`${fn} RETURNS public.yebs_concept_labels`, new RegExp(`${fn}[\\s\\S]*?RETURNS public\\.yebs_concept_labels`).test(sql));
    check(`${fn} EXECUTE yalnız service_role`, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) TO service_role`).test(sql));
  }
  check("create imzası 11 param (…scheme DEFAULT NULL, is_primary DEFAULT false, reason DEFAULT NULL)",
    /p_transliteration_scheme text DEFAULT NULL,\s*p_is_primary\s+boolean DEFAULT false,\s*p_reason\s+text DEFAULT NULL/.test(sql));

  console.log("\n[E] Canonical validation (D4 birebir)");
  check("language_tag BCP-47", /\^\[A-Za-z\]\{2,3\}\(-\[A-Za-z0-9\]\{2,8\}\)\*\$/.test(sql));
  check("script_code ISO-15924", /\^\[A-Z\]\[a-z\]\{3\}\$/.test(sql));
  check("label nonblank", /btrim\(p_label\) = ''/.test(sql));
  check("label_kind 5-enum", /'original', 'transliteration', 'faithful_translation', 'common_name', 'alternative'/.test(sql));
  check("transliteration coupling (non-null → transliteration + nonblank)",
    /p_transliteration_scheme IS NOT NULL THEN\s*IF p_label_kind <> 'transliteration' OR btrim\(p_transliteration_scheme\) = '' THEN/.test(sql));
  check("is_primary NULL reddi", /p_is_primary IS NULL THEN\s*RAISE EXCEPTION 'YEBS_INVALID_LABEL_INPUT'/.test(sql));

  console.log("\n[F] Parent lock + draft gate + concurrency");
  check("create: parent concept FOR SHARE", /yebs_create_concept_label_with_audit[\s\S]*?FROM public\.yebs_concepts c\s*WHERE c\.id = p_concept_id\s*FOR SHARE/.test(sql));
  check("create: parent draft gate CONCEPT_STATUS_LOCKED", /yebs_create_concept_label_with_audit[\s\S]*?v_concept_status IS DISTINCT FROM 'draft' THEN\s*RAISE EXCEPTION 'YEBS_CONCEPT_STATUS_LOCKED'/.test(sql));
  check("update/delete: label FOR UPDATE + concept_id eşleşme",
    /FROM public\.yebs_concept_labels\s*WHERE id = p_label_id\s*AND concept_id = p_concept_id\s*FOR UPDATE/.test(sql));
  check("LABEL_NOT_FOUND", /YEBS_LABEL_NOT_FOUND/.test(sql));
  check("update: stale (label updated_at)", /yebs_update_concept_label_with_audit[\s\S]*?v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_LABEL_STALE_UPDATE'/.test(sql));
  check("delete: stale", /yebs_delete_concept_label_with_audit[\s\S]*?v_existing\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s*RAISE EXCEPTION 'YEBS_LABEL_STALE_UPDATE'/.test(sql));

  console.log("\n[G] Duplicate vs primary conflict ayrımı");
  check("GET STACKED DIAGNOSTICS constraint name", /GET STACKED DIAGNOSTICS v_constraint = PG_EXCEPTION_CONSTRAINT_NAME/.test(sql));
  check("primary index → LABEL_PRIMARY_CONFLICT", /v_constraint = 'yebs_concept_labels_primary_key' THEN\s*RAISE EXCEPTION 'YEBS_LABEL_PRIMARY_CONFLICT'/.test(sql));
  check("identity → LABEL_DUPLICATE", /ELSE\s*RAISE EXCEPTION 'YEBS_LABEL_DUPLICATE'/.test(sql));
  check("constraint adı client'a sızmıyor (yalnız iç sınıflandırma)", !/RAISE EXCEPTION v_constraint/.test(sql));

  console.log("\n[H] reason zorunluluk farkı");
  check("create reason OPSİYONEL (IF p_reason IS NOT NULL)", /yebs_create_concept_label_with_audit[\s\S]*?IF p_reason IS NOT NULL THEN[\s\S]*?YEBS_REASON_INVALID/.test(sql));
  check("update reason ZORUNLU", /yebs_update_concept_label_with_audit[\s\S]*?p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(sql));
  check("delete reason ZORUNLU", /yebs_delete_concept_label_with_audit[\s\S]*?p_reason IS NULL OR btrim\(p_reason\) = '' OR length\(p_reason\) > 2000 THEN\s*RAISE EXCEPTION 'YEBS_REASON_INVALID'/.test(sql));

  console.log("\n[I] Audit changed_fields + previous/new");
  check("create changed_fields 7-alan sıra",
    /'concept_id', 'language_tag', 'script_code', 'label', 'label_kind',\s*'transliteration_scheme', 'is_primary'/.test(sql));
  check("update changed_fields sabit 6-alan sıra",
    sql.indexOf("v_changed := v_changed || 'language_tag'") < sql.indexOf("v_changed := v_changed || 'script_code'") &&
    sql.indexOf("v_changed := v_changed || 'script_code'") < sql.indexOf("v_changed := v_changed || 'label'") &&
    sql.indexOf("v_changed := v_changed || 'label'") < sql.indexOf("v_changed := v_changed || 'label_kind'") &&
    sql.indexOf("v_changed := v_changed || 'label_kind'") < sql.indexOf("v_changed := v_changed || 'transliteration_scheme'") &&
    sql.indexOf("v_changed := v_changed || 'transliteration_scheme'") < sql.indexOf("v_changed := v_changed || 'is_primary'"));
  check("update no-op → LABEL_NO_CHANGES", /cardinality\(v_changed\) = 0 THEN\s*RAISE EXCEPTION 'YEBS_LABEL_NO_CHANGES'/.test(sql));
  check("delete previous=existing new=NULL",
    /'committed', to_jsonb\(v_existing\), NULL,\s*ARRAY\[\s*'language_tag', 'script_code', 'label', 'label_kind',\s*'transliteration_scheme', 'is_primary'\s*\]/.test(sql));
  check("delete 6-alan changed_fields", /'language_tag', 'script_code', 'label', 'label_kind',\s*'transliteration_scheme', 'is_primary'/.test(sql));
  check("delete DELETE ifadesi + snapshot önce", sql.indexOf("v_existing") < sql.indexOf("DELETE FROM public.yebs_concept_labels"));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
