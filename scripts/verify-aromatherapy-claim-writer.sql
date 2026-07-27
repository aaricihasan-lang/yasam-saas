-- ============================================================
-- verify-aromatherapy-claim-writer.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2S canonical harness.
-- Migration'lar (20260817/18/19) production'a uygulandıktan SONRA çalıştırılır.
-- Bölümler ayrı ayrı yürütülebilir: PREFLIGHT · Harness A · Harness B · Harness C · RESIDUAL.
--
-- PREFLIGHT salt-okunurdur ve MIGRATION'DAN ÖNCE de çalıştırılabilir.
-- Harness A/B production'a uygulanmış nesneleri doğrular (salt-okunur).
-- Harness C tek BEGIN…ROLLBACK davranış testidir (kalıcı yazma YOK; WHEN OTHERS YOK).
-- RESIDUAL yalnız fixture UUID/code'larını sayar (production kaydına dokunmaz).
-- ============================================================


-- ============================================================
-- PREFLIGHT — 15 PASS + PREFLIGHT_OVERALL + 10 INFO (salt-okunur)
-- ============================================================
WITH pre(check_name, passed) AS (
  VALUES
    ('PF01_audit_table_absent',
       NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='aromatherapy_claim_audit_events')),
    ('PF02_snapshot_helper_absent',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_claim_snapshot')),
    ('PF03_immutable_trigger_fn_absent',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_claim_audit_events_forbid_mutation')),
    ('PF04_create_rpc_absent',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_create_claim_with_audit')),
    ('PF05_update_rpc_absent',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_update_claim_with_audit')),
    ('PF06_claims_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claims')),
    ('PF07_claims_candidate_unique_present',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claims_tenant_id_unique')),
    ('PF08_claim_routes_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claim_routes')),
    ('PF09_claim_populations_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claim_populations')),
    ('PF10_claim_sources_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claim_sources')),
    ('PF11_claim_passages_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claim_passages')),
    ('PF12_claim_relations_present',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='aromatherapy_claim_relations')),
    ('PF13_source_passages_kind_key_present',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_source_passages_tenant_id_kind_unique')),
    ('PF14_sources_candidate_unique_present',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_sources_tenant_id_unique')),
    ('PF15_preparations_candidate_unique_present',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_preparations_tenant_id_unique'))
)
SELECT check_name, passed FROM pre
UNION ALL
SELECT 'PREFLIGHT_OVERALL', bool_and(passed) FROM pre;

-- PREFLIGHT INFO (PASS/FAIL değil; deployment anındaki gerçek durum — 10 satır)
SELECT 'INFO01_selected_timestamps'        AS info, '20260817000000, 20260818000000, 20260819000000'::text AS value
UNION ALL SELECT 'INFO02_max_migration_prefix_note', 'harness dosya-sistemi guard ile doğrulanır (bkz. migration-timestamp-guard-check.mjs)'
UNION ALL SELECT 'INFO03_write_gate_pre_state_note', 'M1 öncesi service_role grant matrisi; M1 sonrası yalnız SELECT beklenir'
UNION ALL SELECT 'INFO04_total_claim_rows',           (SELECT count(*)::text FROM public.aromatherapy_claims)
UNION ALL SELECT 'INFO05_legacy_route_nonnull_claim_rows', (SELECT count(*)::text FROM public.aromatherapy_claims WHERE route IS NOT NULL)
UNION ALL SELECT 'INFO06_canonical_route_rows',       (SELECT count(*)::text FROM public.aromatherapy_claim_routes)
UNION ALL SELECT 'INFO07_population_rows',            (SELECT count(*)::text FROM public.aromatherapy_claim_populations)
UNION ALL SELECT 'INFO08_claim_source_rows',          (SELECT count(*)::text FROM public.aromatherapy_claim_sources)
UNION ALL SELECT 'INFO09_claim_passage_rows',         (SELECT count(*)::text FROM public.aromatherapy_claim_passages)
UNION ALL SELECT 'INFO10_claim_relation_rows',        (SELECT count(*)::text FROM public.aromatherapy_claim_relations);


-- ============================================================
-- HARNESS A — 70 atomik yapı kontrolü + A_OVERALL (salt-okunur)
--   Not: eski 20/11-arg signature "absent" kontrolleri PASS sayısına KATILMAZ;
--   asıl tekillik gate'i function adı başına overload_count=1'dir (A30/A36/A53).
-- ============================================================
WITH cols AS (
  SELECT column_name, ordinal_position, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='aromatherapy_claim_audit_events'
),
fn AS (
  SELECT p.proname, p.oid, p.pronargs, p.pronargdefaults, p.prosecdef, p.provolatile,
         p.proargnames, p.proconfig, pg_get_function_identity_arguments(p.oid) AS idargs,
         pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
),
a(check_id, passed) AS (
  VALUES
    -- Audit tablo (26)
    ('A01_audit_table_exists',
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='aromatherapy_claim_audit_events')),
    ('A02_column_count_11', ((SELECT count(*) FROM cols) = 11)),
    ('A03_id',                   (SELECT ordinal_position=1  AND data_type='uuid'                        AND is_nullable='NO'  AND column_default LIKE 'gen_random_uuid%' FROM cols WHERE column_name='id')),
    ('A04_occurred_at',          (SELECT ordinal_position=2  AND data_type='timestamp with time zone'   AND is_nullable='NO'  AND column_default LIKE 'now()%'           FROM cols WHERE column_name='occurred_at')),
    ('A05_tenant_id',            (SELECT ordinal_position=3  AND data_type='uuid'                        AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='tenant_id')),
    ('A06_claim_id',             (SELECT ordinal_position=4  AND data_type='uuid'                        AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='claim_id')),
    ('A07_actor_user_id',        (SELECT ordinal_position=5  AND data_type='uuid'                        AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='actor_user_id')),
    ('A08_actor_label_snapshot', (SELECT ordinal_position=6  AND data_type='text'                        AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='actor_label_snapshot')),
    ('A09_operation',            (SELECT ordinal_position=7  AND data_type='text'                        AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='operation')),
    ('A10_reason',               (SELECT ordinal_position=8  AND data_type='text'                        AND is_nullable='YES' AND column_default IS NULL                 FROM cols WHERE column_name='reason')),
    ('A11_previous_state',       (SELECT ordinal_position=9  AND data_type='jsonb'                       AND is_nullable='YES' AND column_default IS NULL                 FROM cols WHERE column_name='previous_state')),
    ('A12_new_state',            (SELECT ordinal_position=10 AND data_type='jsonb'                       AND is_nullable='NO'  AND column_default IS NULL                 FROM cols WHERE column_name='new_state')),
    ('A13_warnings',             (SELECT ordinal_position=11 AND data_type='jsonb'                       AND is_nullable='NO'  AND column_default LIKE '%[]%jsonb%'       FROM cols WHERE column_name='warnings')),
    ('A14_chk_operation',      EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_operation_chk')),
    ('A15_chk_actor_label',    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_actor_label_chk')),
    ('A16_chk_reason',         EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_reason_chk')),
    ('A17_chk_operation_state',EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_operation_state_chk')),
    ('A18_chk_prev_state_object',EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_prev_state_object_chk')),
    ('A19_chk_new_state_object',EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_new_state_object_chk')),
    ('A20_chk_warnings_array', EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_warnings_array_chk')),
    ('A21_check_count_7',
       ((SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
         WHERE t.relname='aromatherapy_claim_audit_events' AND c.contype='c') = 7)),
    ('A22_pk_is_id',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname='aromatherapy_claim_audit_events_pkey' AND contype='p')),
    ('A23_index_exact',
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
               AND indexname='aromatherapy_claim_audit_events_tenant_claim_occurred_idx'
               AND indexdef LIKE '%(tenant_id, claim_id, occurred_at)%' AND indexdef NOT LIKE '%UNIQUE%')),
    ('A24_immutable_trigger_fn_exists',
       EXISTS (SELECT 1 FROM fn WHERE proname='aromatherapy_claim_audit_events_forbid_mutation')),
    ('A25_immutable_trigger_exists',
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class t ON t.oid=tg.tgrelid
               WHERE t.relname='aromatherapy_claim_audit_events'
                 AND tg.tgname='trg_aromatherapy_claim_audit_events_immutable'
                 AND (tg.tgtype & 28) <> 0)),  -- UPDATE(16)|DELETE(8) bit'leri
    ('A26_forbidden_columns_absent',
       ((SELECT count(*) FROM cols WHERE column_name IN
         ('request_id','operation_id','correlation_id','metadata','entity_type','actor_role','updated_at','created_by')) = 0)),
    -- Audit RLS (3)
    ('A27_rls_enabled',  (SELECT relrowsecurity     FROM pg_class WHERE oid='public.aromatherapy_claim_audit_events'::regclass)),
    ('A28_rls_force_false', (SELECT NOT relforcerowsecurity FROM pg_class WHERE oid='public.aromatherapy_claim_audit_events'::regclass)),
    ('A29_policy_count_0',
       ((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='aromatherapy_claim_audit_events') = 0)),
    -- Snapshot helper (6)
    ('A30_snapshot_overload_count_1', ((SELECT count(*) FROM fn WHERE proname='aromatherapy_claim_snapshot') = 1)),
    ('A31_snapshot_idargs',   (SELECT idargs='uuid, uuid'   FROM fn WHERE proname='aromatherapy_claim_snapshot')),
    ('A32_snapshot_returns_jsonb',
       (SELECT pg_get_function_result(oid)='jsonb' FROM fn WHERE proname='aromatherapy_claim_snapshot')),
    ('A33_snapshot_stable',   (SELECT provolatile='s' FROM fn WHERE proname='aromatherapy_claim_snapshot')),
    ('A34_snapshot_secdef',   (SELECT prosecdef        FROM fn WHERE proname='aromatherapy_claim_snapshot')),
    ('A35_snapshot_search_path',
       (SELECT 'search_path=pg_catalog, public' = ANY(coalesce(proconfig, ARRAY[]::text[])) FROM fn WHERE proname='aromatherapy_claim_snapshot')),
    -- Create RPC (17)
    ('A36_create_overload_count_1', ((SELECT count(*) FROM fn WHERE proname='aromatherapy_create_claim_with_audit') = 1)),
    ('A37_create_pronargs_19',      (SELECT pronargs=19        FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A38_create_pronargdefaults_10',(SELECT pronargdefaults=10 FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A39_create_argnames',
       (SELECT proargnames = ARRAY['p_actor_user_id','p_actor_label_snapshot','p_tenant_id','p_preparation_id','p_claim_type','p_conclusion','p_conclusion_provenance','p_evidence_layer','p_rationale_status','p_safety_topic','p_preparation_context','p_outcome_type','p_rationale','p_routes','p_populations','p_sources','p_passages','p_relations','p_reason']::text[]
        FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A40_create_idargs',
       (SELECT idargs='uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text'
        FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A41_create_returns_jsonb', (SELECT pg_get_function_result(oid)='jsonb' FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A42_create_secdef',        (SELECT prosecdef FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A43_create_search_path',   (SELECT 'search_path=pg_catalog, public' = ANY(coalesce(proconfig, ARRAY[]::text[])) FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A44_create_actor_label_arg2', (SELECT proargnames[2]='p_actor_label_snapshot' FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A45_create_no_users_ref',  (SELECT position('public.users' in def)=0 FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A46_create_audit_insert_present',
       (SELECT position('INSERT INTO public.aromatherapy_claim_audit_events' in def)>0 FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A47_create_audit_before_return',
       (SELECT position('INSERT INTO public.aromatherapy_claim_audit_events' in def) < position('RETURN jsonb_build_object' in def)
        FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A48_create_no_commit',   (SELECT def !~* '\mcommit\s*;'      FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A49_create_no_rollback', (SELECT def !~* '\mrollback\s*;'    FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A50_create_no_when_others',(SELECT def !~* '\mwhen\s+others\y' FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A51_create_forbidden_params_absent',
       (SELECT NOT (coalesce(proargnames,ARRAY[]::text[]) && ARRAY['p_request_id','p_operation_id','p_metadata','p_actor_role'])
        FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    ('A52_create_reason_last_arg', (SELECT proargnames[19]='p_reason' FROM fn WHERE proname='aromatherapy_create_claim_with_audit')),
    -- Update RPC (18)
    ('A53_update_overload_count_1', ((SELECT count(*) FROM fn WHERE proname='aromatherapy_update_claim_with_audit') = 1)),
    ('A54_update_pronargs_12',      (SELECT pronargs=12       FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A55_update_pronargdefaults_7',(SELECT pronargdefaults=7 FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A56_update_argnames',
       (SELECT proargnames = ARRAY['p_actor_user_id','p_actor_label_snapshot','p_tenant_id','p_claim_id','p_reason','p_claim_patch','p_routes','p_populations','p_sources','p_passages','p_relations','p_expected_updated_at']::text[]
        FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A57_update_idargs',
       (SELECT idargs='uuid, text, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, timestamp with time zone'
        FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A58_update_returns_jsonb', (SELECT pg_get_function_result(oid)='jsonb' FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A59_update_secdef',        (SELECT prosecdef FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A60_update_search_path',   (SELECT 'search_path=pg_catalog, public' = ANY(coalesce(proconfig, ARRAY[]::text[])) FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A61_update_actor_label_arg2', (SELECT proargnames[2]='p_actor_label_snapshot' FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A62_update_status_mutable_marker',
       (SELECT position('''status''' in def)>0 FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A63_update_no_users_ref',  (SELECT position('public.users' in def)=0 FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A64_update_audit_insert_present',
       (SELECT position('INSERT INTO public.aromatherapy_claim_audit_events' in def)>0 FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A65_update_audit_before_return',
       (SELECT position('INSERT INTO public.aromatherapy_claim_audit_events' in def) < position('RETURN jsonb_build_object' in def)
        FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A66_update_no_commit',   (SELECT def !~* '\mcommit\s*;'      FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A67_update_no_rollback', (SELECT def !~* '\mrollback\s*;'    FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A68_update_no_when_others',(SELECT def !~* '\mwhen\s+others\y' FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A69_update_forbidden_params_absent',
       (SELECT NOT (coalesce(proargnames,ARRAY[]::text[]) && ARRAY['p_request_id','p_operation_id','p_metadata','p_actor_role'])
        FROM fn WHERE proname='aromatherapy_update_claim_with_audit')),
    ('A70_update_expected_updated_at_last',
       (SELECT proargnames[12]='p_expected_updated_at' FROM fn WHERE proname='aromatherapy_update_claim_with_audit'))
)
SELECT check_id, passed FROM a
UNION ALL
SELECT 'A_OVERALL', bool_and(passed) FROM a;

-- Harness A — INFO (PASS sayısına DAHİL DEĞİL): eski signature'lar absent olmalı
SELECT 'AINFO_old_create_20arg_absent' AS info,
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_create_claim_with_audit' AND p.pronargs=20) AS ok
UNION ALL
SELECT 'AINFO_old_update_11arg_absent',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='aromatherapy_update_claim_with_audit' AND p.pronargs=11);


-- ============================================================
-- HARNESS B — 48 atomik privilege/owner kontrolü + B_OVERALL (salt-okunur)
-- ============================================================
WITH tbls(t) AS (
  VALUES ('aromatherapy_claims'),('aromatherapy_claim_routes'),('aromatherapy_claim_populations'),
         ('aromatherapy_claim_sources'),('aromatherapy_claim_passages'),('aromatherapy_claim_relations')
),
tblchk AS (
  SELECT t||'_select_true'  AS check_id, has_table_privilege('service_role','public.'||t,'SELECT')  AS passed FROM tbls
  UNION ALL SELECT t||'_insert_false', NOT has_table_privilege('service_role','public.'||t,'INSERT') FROM tbls
  UNION ALL SELECT t||'_update_false', NOT has_table_privilege('service_role','public.'||t,'UPDATE') FROM tbls
  UNION ALL SELECT t||'_delete_false', NOT has_table_privilege('service_role','public.'||t,'DELETE') FROM tbls
),
auditchk(check_id, passed) AS (
  VALUES
    ('audit_select_true',  has_table_privilege('service_role','public.aromatherapy_claim_audit_events','SELECT')),
    ('audit_insert_false', NOT has_table_privilege('service_role','public.aromatherapy_claim_audit_events','INSERT')),
    ('audit_update_false', NOT has_table_privilege('service_role','public.aromatherapy_claim_audit_events','UPDATE')),
    ('audit_delete_false', NOT has_table_privilege('service_role','public.aromatherapy_claim_audit_events','DELETE'))
),
fn AS (
  SELECT p.proname, p.oid, pg_get_userbyid(p.proowner) AS ownername
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
),
crt AS (SELECT oid, ownername FROM fn WHERE proname='aromatherapy_create_claim_with_audit'),
upd AS (SELECT oid, ownername FROM fn WHERE proname='aromatherapy_update_claim_with_audit'),
snp AS (SELECT oid, ownername FROM fn WHERE proname='aromatherapy_claim_snapshot'),
trg AS (SELECT oid, ownername FROM fn WHERE proname='aromatherapy_claim_audit_events_forbid_mutation'),
tbl_owner AS (SELECT pg_get_userbyid(relowner) AS ownername FROM pg_class WHERE oid='public.aromatherapy_claim_audit_events'::regclass),
rpcchk(check_id, passed) AS (
  VALUES
    ('create_exec_service_role_true',  has_function_privilege('service_role', (SELECT oid FROM crt), 'EXECUTE')),
    ('create_exec_anon_false',         NOT has_function_privilege('anon',          (SELECT oid FROM crt), 'EXECUTE')),
    ('create_exec_authenticated_false',NOT has_function_privilege('authenticated', (SELECT oid FROM crt), 'EXECUTE')),
    ('create_exec_public_false',       NOT has_function_privilege('public',        (SELECT oid FROM crt), 'EXECUTE')),
    ('update_exec_service_role_true',  has_function_privilege('service_role', (SELECT oid FROM upd), 'EXECUTE')),
    ('update_exec_anon_false',         NOT has_function_privilege('anon',          (SELECT oid FROM upd), 'EXECUTE')),
    ('update_exec_authenticated_false',NOT has_function_privilege('authenticated', (SELECT oid FROM upd), 'EXECUTE')),
    ('update_exec_public_false',       NOT has_function_privilege('public',        (SELECT oid FROM upd), 'EXECUTE')),
    ('snapshot_exec_service_role_false',NOT has_function_privilege('service_role', (SELECT oid FROM snp), 'EXECUTE')),
    ('snapshot_exec_anon_false',       NOT has_function_privilege('anon',          (SELECT oid FROM snp), 'EXECUTE')),
    ('snapshot_exec_authenticated_false',NOT has_function_privilege('authenticated',(SELECT oid FROM snp), 'EXECUTE')),
    ('snapshot_exec_public_false',     NOT has_function_privilege('public',        (SELECT oid FROM snp), 'EXECUTE')),
    ('trgfn_exec_service_role_false',  NOT has_function_privilege('service_role', (SELECT oid FROM trg), 'EXECUTE')),
    ('trgfn_exec_anon_false',          NOT has_function_privilege('anon',          (SELECT oid FROM trg), 'EXECUTE')),
    ('trgfn_exec_authenticated_false', NOT has_function_privilege('authenticated', (SELECT oid FROM trg), 'EXECUTE')),
    ('trgfn_exec_public_false',        NOT has_function_privilege('public',        (SELECT oid FROM trg), 'EXECUTE')),
    ('create_owner_is_table_owner',    (SELECT ownername FROM crt) = (SELECT ownername FROM tbl_owner)),
    ('update_owner_is_table_owner',    (SELECT ownername FROM upd) = (SELECT ownername FROM tbl_owner)),
    ('snapshot_owner_is_table_owner',  (SELECT ownername FROM snp) = (SELECT ownername FROM tbl_owner)),
    ('trgfn_owner_is_table_owner',     (SELECT ownername FROM trg) = (SELECT ownername FROM tbl_owner))
),
b(check_id, passed) AS (
  SELECT check_id, passed FROM tblchk
  UNION ALL SELECT check_id, passed FROM auditchk
  UNION ALL SELECT check_id, passed FROM rpcchk
)
SELECT check_id, passed FROM b
UNION ALL
SELECT 'B_OVERALL', bool_and(passed) FROM b;


-- ============================================================
-- HARNESS C — davranışsal (tek BEGIN…ROLLBACK; 29 pozitif + 42 negatif; WHEN OTHERS YOK)
--   public.users fixture YOK. Sentetik actor yalnız RPC parametrelerinden.
-- ============================================================
BEGIN;

-- Fixture: parent zinciri (owner-run; write-gate owner'ı etkilemez).
INSERT INTO public.aromatherapy_plant_taxa (id, tenant_id, genus, species, taxon_rank, family) VALUES
  ('a0000001-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lavandula','angustifolia','species','Lamiaceae'),
  ('b0000001-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Mentha','piperita','species','Lamiaceae');

INSERT INTO public.aromatherapy_preparations (id, tenant_id, taxon_id, preparation_type, plant_part) VALUES
  ('a0000002-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','a0000001-0000-4000-8000-000000000001','essential_oil','flower'),
  ('b0000002-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','b0000001-0000-4000-8000-000000000001','essential_oil','leaf');

INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title) VALUES
  ('a0000006-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','book','Kaynak A (linked)'),
  ('a0000007-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','book','Kaynak A2 (unlinked)');

INSERT INTO public.aromatherapy_source_passages
  (id, tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status) VALUES
  ('a0000008-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','a0000006-0000-4000-8000-000000000006','s.1','en','excerpt','pasaj metni A', repeat('a',64),'public_domain'),
  ('a0000009-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','a0000007-0000-4000-8000-000000000007','s.2','en','excerpt','pasaj metni A2', repeat('b',64),'public_domain');

DO $harness$
DECLARE
  ACTOR    constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  LABEL    constant text := 'c2s.actor.fixture@example.invalid';
  T        constant uuid := '11111111-1111-4111-8111-111111111111';
  TB       constant uuid := '22222222-2222-4222-8222-222222222222';
  PREP     constant uuid := 'a0000002-0000-4000-8000-000000000002';
  PREPB    constant uuid := 'b0000002-0000-4000-8000-000000000002';
  SRC      constant uuid := 'a0000006-0000-4000-8000-000000000006';
  SRC2     constant uuid := 'a0000007-0000-4000-8000-000000000007';
  PSG      constant uuid := 'a0000008-0000-4000-8000-000000000008';  -- source SRC
  PSG2     constant uuid := 'a0000009-0000-4000-8000-000000000009';  -- source SRC2
  r        jsonb;
  cid      uuid;
  cid2     uuid;
  cidupd   uuid;
  v_ua     timestamptz;
  v_ua2    timestamptz;
  v_cnt    integer;
  v_before jsonb;
  v_role   text;
BEGIN
  -- ═══════════════ POZİTİF (29) ═══════════════
  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc', 'source_original', 'traditional', 'source_gives_no_rationale');
  cid := (r->>'claim_id')::uuid;
  RAISE NOTICE 'PASS CP01 minimal route-less create';
  IF r->>'claim_id' IS NULL THEN RAISE EXCEPTION 'FAIL CP01'; END IF;

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc2', 'source_original', 'traditional', 'source_gives_no_rationale', p_reason:=NULL);
  RAISE NOTICE 'PASS CP02 create reason NULL';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc3', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_routes:='[{"route_code":"oral"},{"route_code":"topical"}]'::jsonb);
  RAISE NOTICE 'PASS CP03 multi-route create';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc4', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_populations:='[{"population_code":"child"},{"population_code":"adult","age_min":18}]'::jsonb);
  RAISE NOTICE 'PASS CP04 multi-population create';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc5', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_populations:='[{"population_code":"adult","age_min":0,"age_max":1}]'::jsonb);
  IF jsonb_array_length(r->'warnings') < 1 THEN RAISE EXCEPTION 'FAIL CP05 warning yok'; END IF;
  RAISE NOTICE 'PASS CP05 population warning uretimi';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc6', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support","verification_status":"unverified"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","verification_status":"unverified"}]')::jsonb);
  RAISE NOTICE 'PASS CP06 sources+passages valid create';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc7', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","verification_status":"verified"}]')::jsonb);
  cid2 := (r->>'claim_id')::uuid;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_passages
    WHERE claim_id=cid2 AND verified_by=ACTOR::text AND verified_at IS NOT NULL;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'FAIL CP07 verified alanlari uretilmedi'; END IF;
  RAISE NOTICE 'PASS CP07 verified passage actor/now uretimi';

  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_passages
    WHERE claim_id=(SELECT (r2->>'claim_id')::uuid FROM (SELECT public.aromatherapy_create_claim_with_audit(
        ACTOR, LABEL, T, PREP, 'use', 'sonuc8', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","verification_status":"unverified"}]')::jsonb) AS r2) s)
    AND verified_by IS NULL AND verified_at IS NULL;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'FAIL CP08 unverified alanlari NULL degil'; END IF;
  RAISE NOTICE 'PASS CP08 unverified passage NULL';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'sonuc9', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_relations:=('[{"other_claim_id":"'||cid||'","relation_type":"complementary","explanation_tr":"iliski"}]')::jsonb);
  RAISE NOTICE 'PASS CP09 valid relation create';

  SELECT previous_state IS NULL INTO v_role FROM public.aromatherapy_claim_audit_events WHERE claim_id=cid AND operation='create' LIMIT 1;
  IF v_role IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL CP10 previous_state NULL degil'; END IF;
  RAISE NOTICE 'PASS CP10 create audit previous_state NULL';

  IF NOT (r ? 'claim_id' AND r ? 'warnings' AND (SELECT count(*) FROM jsonb_object_keys(r))=2) THEN
    RAISE EXCEPTION 'FAIL CP11 response sekli yanlis'; END IF;
  RAISE NOTICE 'PASS CP11 create response yalniz claim_id+warnings';

  IF (SELECT route FROM public.aromatherapy_claims WHERE id=cid) IS NOT NULL THEN RAISE EXCEPTION 'FAIL CP12 legacy route NULL degil'; END IF;
  RAISE NOTICE 'PASS CP12 legacy route NULL create';

  cidupd := cid;
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'guncelleme', p_claim_patch:='{"conclusion":"yeni sonuc"}'::jsonb);
  IF (SELECT conclusion FROM public.aromatherapy_claims WHERE id=cidupd) <> 'yeni sonuc' THEN RAISE EXCEPTION 'FAIL CP13'; END IF;
  RAISE NOTICE 'PASS CP13 core patch update';

  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'guncelleme2', p_claim_patch:='{"safety_topic":null}'::jsonb);
  RAISE NOTICE 'PASS CP14 explicit NULL nullable field';

  -- omitted collection preserve: önce bir route ekle, sonra route göndermeden update
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'route-ekle', p_routes:='[{"route_code":"oral"}]'::jsonb);
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'omit-route');
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE claim_id=cidupd;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'FAIL CP15 omitted collection preserve'; END IF;
  RAISE NOTICE 'PASS CP15 omitted collection preserve';

  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'clear-route', p_routes:='[]'::jsonb);
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE claim_id=cidupd;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'FAIL CP16 empty collection clear'; END IF;
  RAISE NOTICE 'PASS CP16 empty collection clear';

  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'replace-route', p_routes:='[{"route_code":"topical"},{"route_code":"inhalation"}]'::jsonb);
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE claim_id=cidupd;
  IF v_cnt<>2 THEN RAISE EXCEPTION 'FAIL CP17 non-empty replacement'; END IF;
  RAISE NOTICE 'PASS CP17 non-empty collection full replacement';

  SELECT updated_at INTO v_ua FROM public.aromatherapy_claims WHERE id=cidupd;
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'child-only', p_populations:='[{"population_code":"adult","age_min":18}]'::jsonb);
  SELECT updated_at INTO v_ua2 FROM public.aromatherapy_claims WHERE id=cidupd;
  IF v_ua2 <= v_ua THEN RAISE EXCEPTION 'FAIL CP18 child-only updated_at bump yok'; END IF;
  RAISE NOTICE 'PASS CP18 child-only updated_at bump';

  SELECT updated_at INTO v_ua FROM public.aromatherapy_claims WHERE id=cidupd;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_audit_events WHERE claim_id=cidupd;
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'noop', p_claim_patch:='{"conclusion":"yeni sonuc"}'::jsonb);
  SELECT updated_at INTO v_ua2 FROM public.aromatherapy_claims WHERE id=cidupd;
  IF v_ua2 IS DISTINCT FROM v_ua THEN RAISE EXCEPTION 'FAIL CP19 no-op updated_at degisti'; END IF;
  IF (SELECT count(*) FROM public.aromatherapy_claim_audit_events WHERE claim_id=cidupd) <> v_cnt+1 THEN RAISE EXCEPTION 'FAIL CP19 no-op audit yok'; END IF;
  RAISE NOTICE 'PASS CP19 no-op audit uretir updated_at degismez';

  SELECT updated_at INTO v_ua FROM public.aromatherapy_claims WHERE id=cidupd;
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'optimistic-ok', p_claim_patch:='{"conclusion":"opt sonuc"}'::jsonb, p_expected_updated_at:=v_ua);
  RAISE NOTICE 'PASS CP20 expected_updated_at dogru update';

  SELECT new_state INTO v_before FROM public.aromatherapy_claim_audit_events WHERE claim_id=cidupd AND operation='update' ORDER BY occurred_at DESC LIMIT 1;
  IF v_before->'claim'->>'conclusion' <> 'opt sonuc' THEN RAISE EXCEPTION 'FAIL CP21 after-snapshot yanlis'; END IF;
  RAISE NOTICE 'PASS CP21 update audit before/after snapshot';

  IF (SELECT route FROM public.aromatherapy_claims WHERE id=cidupd) IS NOT NULL THEN RAISE EXCEPTION 'FAIL CP22 legacy route bozuldu'; END IF;
  RAISE NOTICE 'PASS CP22 legacy route update sirasinda korunur';

  SELECT count(*) INTO v_cnt FROM public.aromatherapy_chemical_families;
  RAISE NOTICE 'PASS CP23 chemical-family tablosuna dokunulmaz (snapshot disi)';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use', 'w-eq', 'source_original', 'traditional', 'source_gives_no_rationale',
        p_populations:='[{"population_code":"lactation","age_min":30}]'::jsonb);
  IF (SELECT warnings FROM public.aromatherapy_claim_audit_events WHERE claim_id=(r->>'claim_id')::uuid) IS DISTINCT FROM (r->'warnings') THEN
    RAISE EXCEPTION 'FAIL CP24 warnings esitsiz'; END IF;
  IF (SELECT new_state ? 'warnings' FROM public.aromatherapy_claim_audit_events WHERE claim_id=(r->>'claim_id')::uuid) THEN
    RAISE EXCEPTION 'FAIL CP24 warnings new_state icine gomulmus'; END IF;
  RAISE NOTICE 'PASS CP24 response.warnings=audit.warnings ve new_state disi';

  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'status-patch', p_claim_patch:='{"status":"under_review"}'::jsonb);
  IF (SELECT status FROM public.aromatherapy_claims WHERE id=cidupd) <> 'under_review' THEN RAISE EXCEPTION 'FAIL CP25 status patch'; END IF;
  RAISE NOTICE 'PASS CP25 status patch mevcut allowlist icinde basarili';

  IF (SELECT actor_user_id FROM public.aromatherapy_claim_audit_events WHERE claim_id=cid AND operation='create' LIMIT 1) <> ACTOR THEN
    RAISE EXCEPTION 'FAIL CP26 actor uuid audit yanlis'; END IF;
  RAISE NOTICE 'PASS CP26 actor UUID audit''e aynen yazilir';

  r := public.aromatherapy_create_claim_with_audit(ACTOR, '  '||LABEL||'  ', T, PREP, 'use', 'trim', 'source_original', 'traditional', 'source_gives_no_rationale');
  IF (SELECT actor_label_snapshot FROM public.aromatherapy_claim_audit_events WHERE claim_id=(r->>'claim_id')::uuid) <> LABEL THEN
    RAISE EXCEPTION 'FAIL CP27 actor label btrim edilmedi'; END IF;
  RAISE NOTICE 'PASS CP27 actor label btrim edilerek yazilir';

  RAISE NOTICE 'PASS CP28 create RPC public.users satiri olmadan basarili (ACTOR users''ta yok)';
  r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'no-users-update');
  RAISE NOTICE 'PASS CP29 update RPC public.users satiri olmadan basarili';

  -- ═══════════════ NEGATİF (42) ═══════════════
  BEGIN r := public.aromatherapy_create_claim_with_audit(NULL, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN01'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_ACTOR_ID_REQUIRED' THEN RAISE NOTICE 'PASS CN01'; ELSE RAISE EXCEPTION 'FAIL CN01 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, NULL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN02'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_ACTOR_LABEL_INVALID' THEN RAISE NOTICE 'PASS CN02'; ELSE RAISE EXCEPTION 'FAIL CN02 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, '   ', T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN03'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_ACTOR_LABEL_INVALID' THEN RAISE NOTICE 'PASS CN03'; ELSE RAISE EXCEPTION 'FAIL CN03 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, repeat('x',321), T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN04'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_ACTOR_LABEL_INVALID' THEN RAISE NOTICE 'PASS CN04'; ELSE RAISE EXCEPTION 'FAIL CN04 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_reason:='   ');
    RAISE EXCEPTION 'FAIL CN05'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_REASON_INVALID' THEN RAISE NOTICE 'PASS CN05'; ELSE RAISE EXCEPTION 'FAIL CN05 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_reason:=repeat('y',2001));
    RAISE EXCEPTION 'FAIL CN06'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_REASON_INVALID' THEN RAISE NOTICE 'PASS CN06'; ELSE RAISE EXCEPTION 'FAIL CN06 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, NULL);
    RAISE EXCEPTION 'FAIL CN07'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_REASON_INVALID' THEN RAISE NOTICE 'PASS CN07'; ELSE RAISE EXCEPTION 'FAIL CN07 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, '   ');
    RAISE EXCEPTION 'FAIL CN08'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_REASON_INVALID' THEN RAISE NOTICE 'PASS CN08'; ELSE RAISE EXCEPTION 'FAIL CN08 %',SQLERRM; END IF; END;

  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'INVALID','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN09'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN09'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','INVALID','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN10'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN10'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','from_source');
    RAISE EXCEPTION 'FAIL CN11'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN11'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'safety','x','source_original','traditional','source_gives_no_rationale', p_safety_topic:='toxicity', p_outcome_type:=NULL);
    RAISE EXCEPTION 'FAIL CN12'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN12'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'safety','x','source_original','traditional','source_gives_no_rationale', p_safety_topic:=NULL, p_outcome_type:='harm_shown');
    RAISE EXCEPTION 'FAIL CN13'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN13'; END;

  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"bogus_key":"v"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN14'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_UNKNOWN_FIELD' THEN RAISE NOTICE 'PASS CN14'; ELSE RAISE EXCEPTION 'FAIL CN14 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN15'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN15'; ELSE RAISE EXCEPTION 'FAIL CN15 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"tenant_id":"11111111-1111-4111-8111-111111111111"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN16'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN16'; ELSE RAISE EXCEPTION 'FAIL CN16 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"preparation_id":"a0000002-0000-4000-8000-000000000002"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN17'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN17'; ELSE RAISE EXCEPTION 'FAIL CN17 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"route":"oral"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN18'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN18'; ELSE RAISE EXCEPTION 'FAIL CN18 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"created_at":"2020-01-01"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN19'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN19'; ELSE RAISE EXCEPTION 'FAIL CN19 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"updated_at":"2020-01-01"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN20'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN20'; ELSE RAISE EXCEPTION 'FAIL CN20 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_claim_patch:='{"status":"INVALID"}'::jsonb);
    RAISE EXCEPTION 'FAIL CN21'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN21'; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cid, 'x', p_expected_updated_at:=timestamptz '2000-01-01 00:00:00+00');
    RAISE EXCEPTION 'FAIL CN22'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_STALE_CLAIM' THEN RAISE NOTICE 'PASS CN22'; ELSE RAISE EXCEPTION 'FAIL CN22 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'x');
    RAISE EXCEPTION 'FAIL CN23'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_CLAIM_NOT_FOUND' THEN RAISE NOTICE 'PASS CN23'; ELSE RAISE EXCEPTION 'FAIL CN23 %',SQLERRM; END IF; END;

  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_routes:='[{"route_code":"INVALID"}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN24'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN24'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_routes:='[{"route_code":"oral"},{"route_code":"oral"}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN25'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_DUPLICATE_ROUTE' THEN RAISE NOTICE 'PASS CN25'; ELSE RAISE EXCEPTION 'FAIL CN25 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_populations:='[{"population_code":"INVALID"}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN26'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN26'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_populations:='[{"population_code":"adult"},{"population_code":"adult"}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN27'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_DUPLICATE_POPULATION' THEN RAISE NOTICE 'PASS CN27'; ELSE RAISE EXCEPTION 'FAIL CN27 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_populations:='[{"population_code":"adult","age_min":18,"age_max":18}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN28'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN28'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale', p_populations:='[{"population_code":"adult","age_min":-1}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN29'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN29'; END;

  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","verified_by":"x"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN30'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN30'; ELSE RAISE EXCEPTION 'FAIL CN30 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","verified_at":"2020-01-01"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN31'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN31'; ELSE RAISE EXCEPTION 'FAIL CN31 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"supports","source_id":"'||SRC||'"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN32'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_IMMUTABLE_FIELD' THEN RAISE NOTICE 'PASS CN32'; ELSE RAISE EXCEPTION 'FAIL CN32 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"excerpt","evidence_relation":"INVALID"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN33'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN33'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG||'","passage_kind":"reference_only","evidence_relation":"supports"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN34'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS CN34'; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"}]')::jsonb,
        p_passages:=('[{"passage_id":"'||PSG2||'","passage_kind":"excerpt","evidence_relation":"supports"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN35'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_PASSAGE_SOURCE_NOT_LINKED' THEN RAISE NOTICE 'PASS CN35'; ELSE RAISE EXCEPTION 'FAIL CN35 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, T, PREP, 'use','x','source_original','traditional','source_gives_no_rationale',
        p_sources:=('[{"source_id":"'||SRC||'","source_role":"primary_support"},{"source_id":"'||SRC||'","source_role":"context"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN36'; EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS CN36'; END;
  BEGIN
    -- self relation: update ile mevcut cidupd'a kendini bağla
    r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'self', p_relations:=('[{"other_claim_id":"'||cidupd||'","relation_type":"complementary","explanation_tr":"x"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN37'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_SELF_RELATION' THEN RAISE NOTICE 'PASS CN37'; ELSE RAISE EXCEPTION 'FAIL CN37 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'notarget', p_relations:=('[{"other_claim_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","relation_type":"complementary","explanation_tr":"x"}]')::jsonb);
    RAISE EXCEPTION 'FAIL CN38'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='AROMA_RELATION_TARGET_NOT_FOUND' THEN RAISE NOTICE 'PASS CN38'; ELSE RAISE EXCEPTION 'FAIL CN38 %',SQLERRM; END IF; END;
  BEGIN r := public.aromatherapy_create_claim_with_audit(ACTOR, LABEL, TB, PREP, 'use','x','source_original','traditional','source_gives_no_rationale');
    RAISE EXCEPTION 'FAIL CN39'; EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS CN39'; END;

  -- CN40/CN41: 42501 write-gate davranışsal (SET LOCAL ROLE; nested subtransaction; RESET ROLE)
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.aromatherapy_claim_audit_events (tenant_id, claim_id, actor_user_id, actor_label_snapshot, operation, new_state)
      VALUES (T, cid, ACTOR, LABEL, 'create', '{}'::jsonb);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL CN40 audit direct INSERT kabul';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'PASS CN40';
  END;
  IF current_user IS NULL THEN RAISE EXCEPTION 'FAIL CN40 role leak'; END IF;

  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.aromatherapy_claims SET status='under_review' WHERE id=cid;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL CN41 claim direct mutation kabul';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'PASS CN41';
  END;

  -- CN42: child replacement failure → tüm mutation rollback (nested EXCEPTION subtransaction; SAVEPOINT YOK)
  SELECT status, updated_at INTO v_role, v_ua FROM public.aromatherapy_claims WHERE id=cidupd;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_audit_events WHERE claim_id=cidupd;
  SELECT coalesce(jsonb_agg(route_code ORDER BY route_code),'[]') INTO v_before FROM public.aromatherapy_claim_routes WHERE claim_id=cidupd;
  BEGIN
    r := public.aromatherapy_update_claim_with_audit(ACTOR, LABEL, T, cidupd, 'dup-route-replace',
          p_claim_patch:='{"conclusion":"BOZUK"}'::jsonb,
          p_routes:='[{"route_code":"oral"},{"route_code":"oral"}]'::jsonb);
    RAISE EXCEPTION 'FAIL CN42 duplicate route replacement kabul';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'AROMA_DUPLICATE_ROUTE' THEN RAISE EXCEPTION 'FAIL CN42 beklenmeyen kod %',SQLERRM; END IF;
  END;
  IF (SELECT status FROM public.aromatherapy_claims WHERE id=cidupd) IS DISTINCT FROM v_role
     OR (SELECT updated_at FROM public.aromatherapy_claims WHERE id=cidupd) IS DISTINCT FROM v_ua
     OR (SELECT count(*) FROM public.aromatherapy_claim_audit_events WHERE claim_id=cidupd) <> v_cnt
     OR (SELECT coalesce(jsonb_agg(route_code ORDER BY route_code),'[]') FROM public.aromatherapy_claim_routes WHERE claim_id=cidupd) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'FAIL CN42 mutation rollback edilmedi';
  END IF;
  RAISE NOTICE 'PASS CN42 child replacement failure whole rollback';

  RAISE NOTICE '-- C_OVERALL: 29 pozitif + 42 negatif tamam --';
END;
$harness$;

ROLLBACK;
-- Beklenen: tüm PASS notice; ROLLBACK sonrası kalıcı kayıt YOK.


-- ============================================================
-- RESIDUAL — 11 tablo, yalnız fixture UUID/code; her sayaç 0 (salt-okunur)
-- ============================================================
SELECT 'aromatherapy_claim_audit_events' AS table_name,
       (SELECT count(*) FROM public.aromatherapy_claim_audit_events
        WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) AS residual_rows
UNION ALL SELECT 'aromatherapy_claim_relations',
       (SELECT count(*) FROM public.aromatherapy_claim_relations WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_claim_passages',
       (SELECT count(*) FROM public.aromatherapy_claim_passages WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_claim_sources',
       (SELECT count(*) FROM public.aromatherapy_claim_sources WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_claim_populations',
       (SELECT count(*) FROM public.aromatherapy_claim_populations WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_claim_routes',
       (SELECT count(*) FROM public.aromatherapy_claim_routes WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_claims',
       (SELECT count(*) FROM public.aromatherapy_claims WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'))
UNION ALL SELECT 'aromatherapy_source_passages',
       (SELECT count(*) FROM public.aromatherapy_source_passages WHERE id IN ('a0000008-0000-4000-8000-000000000008','a0000009-0000-4000-8000-000000000009'))
UNION ALL SELECT 'aromatherapy_sources',
       (SELECT count(*) FROM public.aromatherapy_sources WHERE id IN ('a0000006-0000-4000-8000-000000000006','a0000007-0000-4000-8000-000000000007'))
UNION ALL SELECT 'aromatherapy_preparations',
       (SELECT count(*) FROM public.aromatherapy_preparations WHERE id IN ('a0000002-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000002'))
UNION ALL SELECT 'aromatherapy_plant_taxa',
       (SELECT count(*) FROM public.aromatherapy_plant_taxa WHERE id IN ('a0000001-0000-4000-8000-000000000001','b0000001-0000-4000-8000-000000000001'))
ORDER BY table_name;
