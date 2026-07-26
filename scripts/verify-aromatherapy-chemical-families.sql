-- ============================================================
-- verify-aromatherapy-chemical-families.sql
--
-- C2Q doğrulama harness'i — public.aromatherapy_chemical_families
-- (migration: supabase/migrations/20260813000000_aromatherapy_chemical_families.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor.
--   * PREFLIGHT: production migration'dan ÖNCE ayrı çalıştırılır (salt-okunur; veri değiştirmez).
--   * BÖLÜM A/B: migration SONRASI yapısal + güvenlik doğrulaması (salt-okunur).
--   * BÖLÜM C: tek BEGIN…ROLLBACK davranış testi (kalıcı yazma YOK); global registry olduğundan
--     parent seed zinciri YOKTUR; doğrudan chemical_families satırları test edilir.
--   * RESIDUAL: Bölüm C fixture code değerleri için kalıntı kontrolü (salt-okunur).
--   * BACKFILL YOK → BÖLÜM D YOK (C2Q boş global canonical foundation).
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PREFLIGHT — PRODUCTION MIGRATION ÖNCESİ (salt-okunur; hiçbir veri değişmez)
-- ═════════════════════════════════════════════════════════════════════════════
WITH pre(check_name, passed) AS (
  SELECT 'chemical_families_absent',
         (to_regclass('public.aromatherapy_chemical_families') IS NULL)
  UNION ALL SELECT 'identity_function_absent',
         NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_chemical_families_identity_guard')
  UNION ALL SELECT 'identity_trigger_absent',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aromatherapy_chemical_families_identity_guard')
  UNION ALL SELECT 'updated_at_trigger_absent',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aromatherapy_chemical_families_updated_at')
  UNION ALL SELECT 'legacy_preparation_chemical_family_columns_absent',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='aromatherapy_preparations'
                       AND column_name IN ('chemical_family','chemical_families','chemical_class','chemical_classes'))
  UNION ALL SELECT 'legacy_claim_chemical_family_columns_absent',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='aromatherapy_claims'
                       AND column_name IN ('chemical_family','chemical_families','chemical_class','chemical_classes'))
)
SELECT check_name, passed FROM pre
UNION ALL SELECT 'PREFLIGHT_OVERALL', bool_and(passed) FROM pre
ORDER BY check_name;

-- PREFLIGHT bilgi (informational; PASS/FAIL değil):
SELECT
  (SELECT count(*) FROM public.aromatherapy_preparations)              AS total_preparation_rows,
  (SELECT count(*) FROM public.aromatherapy_claims)                    AS total_claim_rows,
  (to_regclass('public.aromatherapy_components') IS NOT NULL)          AS component_table_present,
  false                                                               AS backfill_required;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; 28 kontrol + A_OVERALL = 29 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks(check_name, passed) AS (
  SELECT 'table_exists',
         (to_regclass('public.aromatherapy_chemical_families') IS NOT NULL)
  UNION ALL SELECT 'column_count_5',
         (SELECT count(*)=5 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='aromatherapy_chemical_families')
  UNION ALL SELECT 'id_uuid_notnull_default_gen_random_uuid',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_chemical_families' AND column_name='id'
                   AND data_type='uuid' AND is_nullable='NO' AND column_default LIKE '%gen_random_uuid%')
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_chemical_families'::regclass AND c.contype='p'
                   AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'code_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_chemical_families' AND column_name='code'
                   AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'status_text_notnull_default_active',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_chemical_families' AND column_name='status'
                   AND data_type='text' AND is_nullable='NO' AND column_default LIKE '%active%')
  UNION ALL SELECT 'created_at_timestamptz_notnull_default_now',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_chemical_families' AND column_name='created_at'
                   AND data_type='timestamp with time zone' AND is_nullable='NO' AND column_default LIKE '%now()%')
  UNION ALL SELECT 'updated_at_timestamptz_notnull_default_now',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_chemical_families' AND column_name='updated_at'
                   AND data_type='timestamp with time zone' AND is_nullable='NO' AND column_default LIKE '%now()%')
  UNION ALL SELECT 'no_tenant_id_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_chemical_families' AND column_name='tenant_id')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_chemical_families'
                       AND column_name IN ('tenant_id','name','name_tr','name_en','canonical_name','display_name',
                         'description','language_tag','script_code','parent_id','hierarchy_path','depth','family_type',
                         'chemical_class','functional_group','component_id','constituent_id','preparation_id','claim_id',
                         'source_id','passage_id','evidence_note','confidence','verification_status','verified_by',
                         'verified_at','cas','formula','pubchem_id','concentration','percentage','unit','chemotype',
                         'slug','icon','color','sort_order'))
  UNION ALL SELECT 'check_count_exactly_2',
         (SELECT count(*)=2 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_chemical_families'::regclass AND c.contype='c')
  UNION ALL SELECT 'named_code_check_contract',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%btrim(code)%'
             AND pg_get_constraintdef(c.oid) LIKE '%^[a-z][a-z0-9]%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%lower%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%translate%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_chemical_families_code_chk')
  UNION ALL SELECT 'named_status_check_exact_allowlist',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%active%'
             AND pg_get_constraintdef(c.oid) LIKE '%archived%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%deprecated%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%draft%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%deleted%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%unknown%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_chemical_families_status_chk')
  UNION ALL SELECT 'code_unique_exists',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_chemical_families_code_key' AND c.contype='u'
                   AND c.conrelid='public.aromatherapy_chemical_families'::regclass)
  UNION ALL SELECT 'code_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_chemical_families_code_key' AND con.contype='u')
          = ARRAY['code']::name[])
  UNION ALL SELECT 'fk_count_zero',
         (SELECT count(*)=0 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_chemical_families'::regclass AND c.contype='f')
  UNION ALL SELECT 'no_manual_secondary_indexes',
         (SELECT count(*)=2 FROM pg_indexes
          WHERE schemaname='public' AND tablename='aromatherapy_chemical_families')
  UNION ALL SELECT 'identity_guard_function_exists',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_chemical_families_identity_guard')
  UNION ALL SELECT 'identity_guard_function_contract',
         (SELECT pg_get_functiondef(p.oid) LIKE '%NEW.id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.code%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.created_at%'
             AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM%'
             AND pg_get_functiondef(p.oid) LIKE '%23514%'
             AND pg_get_functiondef(p.oid) NOT LIKE '%NEW.status%'
             AND pg_get_functiondef(p.oid) NOT LIKE '%NEW.updated_at%'
          FROM pg_proc p WHERE p.proname='aromatherapy_chemical_families_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger_before_update_row',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_chemical_families'::regclass
                   AND t.tgname='trg_aromatherapy_chemical_families_identity_guard' AND NOT t.tgisinternal
                   AND (t.tgtype & 1)=1 AND (t.tgtype & 2)=2 AND (t.tgtype & 16)=16)
  UNION ALL SELECT 'updated_at_trigger_before_update_row',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_chemical_families'::regclass
                   AND t.tgname='trg_aromatherapy_chemical_families_updated_at' AND NOT t.tgisinternal
                   AND (t.tgtype & 1)=1 AND (t.tgtype & 2)=2 AND (t.tgtype & 16)=16)
  UNION ALL SELECT 'updated_at_trigger_uses_set_updated_at',
         EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
                 WHERE t.tgrelid='public.aromatherapy_chemical_families'::regclass
                   AND t.tgname='trg_aromatherapy_chemical_families_updated_at'
                   AND p.proname='set_updated_at')
  UNION ALL SELECT 'exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t
          WHERE t.tgrelid='public.aromatherapy_chemical_families'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_chemical_families'::regclass)
  UNION ALL SELECT 'component_table_not_created_by_c2q',
         (to_regclass('public.aromatherapy_components') IS NULL
          AND to_regclass('public.aromatherapy_constituents') IS NULL
          AND to_regclass('public.aromatherapy_chemical_components') IS NULL)
  UNION ALL SELECT 'preparations_not_linked_to_chemical_families',
         (NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name='aromatherapy_preparations'
                        AND column_name IN ('chemical_family','chemical_families','chemical_family_id','chemical_class'))
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c
                          WHERE c.conrelid='public.aromatherapy_preparations'::regclass AND c.contype='f'
                            AND c.confrelid='public.aromatherapy_chemical_families'::regclass))
  UNION ALL SELECT 'claims_not_linked_to_chemical_families',
         (NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name='aromatherapy_claims'
                        AND column_name IN ('chemical_family','chemical_families','chemical_family_id','chemical_class'))
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c
                          WHERE c.conrelid='public.aromatherapy_claims'::regclass AND c.contype='f'
                            AND c.confrelid='public.aromatherapy_chemical_families'::regclass))
  UNION ALL SELECT 'preparation_chemotype_contract_unchanged',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_preparations' AND column_name='chemotype'
                   AND data_type='text' AND is_nullable='YES')
)
SELECT check_name, passed FROM checks
UNION ALL SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; 11 kontrol + B_OVERALL = 12 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec(check_name, passed) AS (
  SELECT s.check_name, s.passed
  FROM (VALUES ('public.aromatherapy_chemical_families')) AS g(tbl)
  CROSS JOIN LATERAL (VALUES
    ('rls_enabled',          (SELECT relrowsecurity FROM pg_class WHERE oid=g.tbl::regclass)),
    ('force_rls_false',      (SELECT relforcerowsecurity=false FROM pg_class WHERE oid=g.tbl::regclass)),
    ('policy_count_zero',    (SELECT count(*)=0 FROM pg_policy WHERE polrelid=g.tbl::regclass)),
    ('anon_no_dml',          NOT (has_table_privilege('anon',g.tbl,'SELECT') OR has_table_privilege('anon',g.tbl,'INSERT') OR has_table_privilege('anon',g.tbl,'UPDATE') OR has_table_privilege('anon',g.tbl,'DELETE'))),
    ('authenticated_no_dml', NOT (has_table_privilege('authenticated',g.tbl,'SELECT') OR has_table_privilege('authenticated',g.tbl,'INSERT') OR has_table_privilege('authenticated',g.tbl,'UPDATE') OR has_table_privilege('authenticated',g.tbl,'DELETE'))),
    ('public_no_dml',        NOT (has_table_privilege('public',g.tbl,'SELECT') OR has_table_privilege('public',g.tbl,'INSERT') OR has_table_privilege('public',g.tbl,'UPDATE') OR has_table_privilege('public',g.tbl,'DELETE'))),
    ('service_role_has_dml', (has_table_privilege('service_role',g.tbl,'SELECT') AND has_table_privilege('service_role',g.tbl,'INSERT') AND has_table_privilege('service_role',g.tbl,'UPDATE') AND has_table_privilege('service_role',g.tbl,'DELETE'))),
    ('service_role_no_truncate',   NOT has_table_privilege('service_role',g.tbl,'TRUNCATE')),
    ('service_role_no_references', NOT has_table_privilege('service_role',g.tbl,'REFERENCES')),
    ('service_role_no_trigger',    NOT has_table_privilege('service_role',g.tbl,'TRIGGER')),
    ('service_role_no_maintain',   NOT has_table_privilege('service_role',g.tbl,'MAINTAIN'))
  ) AS s(check_name, passed)
)
SELECT check_name, passed FROM sec
UNION ALL SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
--   6 pozitif + 14 negatif + C_OVERALL. Global registry → parent seed YOK.
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_status  text;
  v_updated timestamptz;
  NEWID     constant uuid := 'd0000001-0000-4000-8000-000000000001';  -- N12 id UPDATE hedefi
BEGIN
  -- ══ POZİTİF (6) ══
  INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('monoterpene_alcohol');
  RAISE NOTICE 'PASS P1: valid code insert (monoterpene_alcohol)';
  INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('ester');
  RAISE NOTICE 'PASS P2: ikinci valid code insert (ester)';

  UPDATE public.aromatherapy_chemical_families SET status='archived' WHERE code='monoterpene_alcohol';
  SELECT status INTO v_status FROM public.aromatherapy_chemical_families WHERE code='monoterpene_alcohol';
  IF v_status='archived' THEN RAISE NOTICE 'PASS P3: status active->archived';
  ELSE RAISE EXCEPTION 'FAIL P3: status beklenmeyen (=%)', v_status; END IF;

  -- P4: updated_at set_updated_at ile yönetiliyor → elle verilen eski değer override edilir.
  -- (now() transaction-sabiti olduğundan artış yerine "stale değer bump edildi" doğrulanır.)
  UPDATE public.aromatherapy_chemical_families SET updated_at=timestamptz '2000-01-01 00:00:00+00'
    WHERE code='ester';
  SELECT updated_at INTO v_updated FROM public.aromatherapy_chemical_families WHERE code='ester';
  IF v_updated = now() THEN RAISE NOTICE 'PASS P4: updated_at trigger bump (set_updated_at override)';
  ELSE RAISE EXCEPTION 'FAIL P4: updated_at bump yok (=%)', v_updated; END IF;

  UPDATE public.aromatherapy_chemical_families SET id=id WHERE code='ester';
  RAISE NOTICE 'PASS P5: no-op id SET izinli';
  UPDATE public.aromatherapy_chemical_families SET code=code WHERE code='ester';
  RAISE NOTICE 'PASS P6: no-op code SET izinli';

  -- ══ NEGATİF (14) ══  handler dagilimi: unique 1 / check 11 / not_null 2 / fk 0
  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('monoterpene_alcohol');
    RAISE EXCEPTION 'FAIL N1: duplicate code kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS N1: duplicate code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('');
    RAISE EXCEPTION 'FAIL N2: empty code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N2: empty code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('   ');
    RAISE EXCEPTION 'FAIL N3: whitespace-only code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N3: whitespace-only code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('Monoterpene');
    RAISE EXCEPTION 'FAIL N4: uppercase code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N4: uppercase code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('_monoterpene');
    RAISE EXCEPTION 'FAIL N5: leading underscore kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N5: leading underscore reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('monoterpene_');
    RAISE EXCEPTION 'FAIL N6: trailing underscore kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N6: trailing underscore reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('monoterpene__alcohol');
    RAISE EXCEPTION 'FAIL N7: double underscore kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N7: double underscore reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES ('monoterpene-alcohol');
    RAISE EXCEPTION 'FAIL N8: hyphen code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N8: hyphen code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code, status) VALUES ('valid_family_a', 'deprecated');
    RAISE EXCEPTION 'FAIL N9: invalid status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N9: invalid status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code) VALUES (NULL);
    RAISE EXCEPTION 'FAIL N10: NULL code kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N10: NULL code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_chemical_families (code, status) VALUES ('valid_family_b', NULL);
    RAISE EXCEPTION 'FAIL N11: NULL status kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N11: NULL status reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_chemical_families SET id=NEWID WHERE code='ester';
    RAISE EXCEPTION 'FAIL N12: id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N12: id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_chemical_families SET code='ester_v2' WHERE code='ester';
    RAISE EXCEPTION 'FAIL N13: code UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N13: code UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_chemical_families SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE code='ester';
    RAISE EXCEPTION 'FAIL N14: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N14: created_at UPDATE reddedildi'; END;

  RAISE NOTICE '-- C_OVERALL: tum davranissal testler PASS (6 pozitif + 14 negatif) --';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.


-- ═════════════════════════════════════════════════════════════════════════════
-- RESIDUAL — BÖLÜM C fixture kalıntı kontrolü (salt-okunur; 0 beklenir)
--   Yalnız C harness fixture code'larını hedefler; production kayıtları DAHİL DEĞİLDİR.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'aromatherapy_chemical_families' AS table_name,
       (SELECT count(*) FROM public.aromatherapy_chemical_families
        WHERE code IN ('monoterpene_alcohol','ester','valid_family_a','valid_family_b','ester_v2')) AS residual_rows;
