-- ============================================================
-- verify-aromatherapy-claim-populations.sql
--
-- C2P doğrulama harness'i — public.aromatherapy_claim_populations
-- (migration: supabase/migrations/20260812000000_aromatherapy_claim_populations.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor.
--   * PREFLIGHT: production migration'dan ÖNCE ayrı çalıştırılır (salt-okunur; veri değiştirmez).
--   * BÖLÜM A/B: migration SONRASI yapısal + güvenlik doğrulaması (salt-okunur).
--   * BÖLÜM C: tek BEGIN…ROLLBACK davranış testi (kalıcı yazma YOK); parent zinciri
--     (plant_taxa → preparations → claims) transaction içinde seed edilir; production verisine
--     BAĞIMLI DEĞİLDİR.
--   * RESIDUAL: Bölüm C fixture UUID'leri için kalıntı kontrolü (salt-okunur).
--   * BACKFILL YOK → BÖLÜM D YOK (C2P boş kanonik tablo; kaynak population/age kolonu yok).
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PREFLIGHT — PRODUCTION MIGRATION ÖNCESİ (salt-okunur; hiçbir veri değişmez)
-- ═════════════════════════════════════════════════════════════════════════════
WITH pre(check_name, passed) AS (
  SELECT 'claim_populations_absent',
         (to_regclass('public.aromatherapy_claim_populations') IS NULL)
  UNION ALL SELECT 'population_vocabulary_absent',
         (to_regclass('public.aromatherapy_populations') IS NULL)
  UNION ALL SELECT 'claims_candidate_unique_exact',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claims_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'identity_function_absent',
         NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_claim_populations_identity_guard')
  UNION ALL SELECT 'identity_trigger_absent',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aromatherapy_claim_populations_identity_guard')
  UNION ALL SELECT 'legacy_claim_population_columns_absent',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='aromatherapy_claims'
                       AND column_name IN ('population','populations','population_code','age_min','age_max'))
)
SELECT check_name, passed FROM pre
UNION ALL SELECT 'PREFLIGHT_OVERALL', bool_and(passed) FROM pre
ORDER BY check_name;

-- PREFLIGHT bilgi (informational; PASS/FAIL değil):
SELECT
  (SELECT count(*) FROM public.aromatherapy_claims)  AS total_claim_rows,
  0                                                  AS population_source_columns,
  false                                              AS backfill_required;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; 34 kontrol + A_OVERALL = 35 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks(check_name, passed) AS (
  SELECT 'table_exists',
         (to_regclass('public.aromatherapy_claim_populations') IS NOT NULL)
  UNION ALL SELECT 'column_count_7',
         (SELECT count(*)=7 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='aromatherapy_claim_populations')
  UNION ALL SELECT 'id_uuid_notnull_default_gen_random_uuid',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='id'
                   AND data_type='uuid' AND is_nullable='NO' AND column_default LIKE '%gen_random_uuid%')
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_claim_populations'::regclass AND c.contype='p'
                   AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tenant_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='tenant_id'
                   AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'claim_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='claim_id'
                   AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'population_code_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='population_code'
                   AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'age_min_integer_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='age_min'
                   AND data_type='integer' AND is_nullable='YES' AND column_default IS NULL)
  UNION ALL SELECT 'age_max_integer_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='age_max'
                   AND data_type='integer' AND is_nullable='YES' AND column_default IS NULL)
  UNION ALL SELECT 'created_at_timestamptz_notnull_default_now',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_populations' AND column_name='created_at'
                   AND data_type='timestamp with time zone' AND is_nullable='NO' AND column_default LIKE '%now()%')
  UNION ALL SELECT 'no_updated_at_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_populations' AND column_name='updated_at')
  UNION ALL SELECT 'no_status_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_populations' AND column_name='status')
  UNION ALL SELECT 'no_age_unit_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_populations' AND column_name='age_unit')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_populations'
                       AND column_name IN ('updated_at','status','age_unit','name_tr','name_en','description',
                         'language_tag','script_code','trimester','pregnancy_stage','sex','gender','applicability_type',
                         'effect','safety_level','source_id','passage_id','evidence_note','verification_status',
                         'verified_by','verified_at','confidence','provenance','slug','canonical_key','icon','color',
                         'sort_order','revision','series_id','tag_id','category_id','glossary_term_id','route_id',
                         'route_code','chemical_family_id'))
  UNION ALL SELECT 'check_count_exactly_3',
         (SELECT count(*)=3 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_claim_populations'::regclass AND c.contype='c')
  UNION ALL SELECT 'named_population_check_exact_allowlist',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%population_code%'
             AND pg_get_constraintdef(c.oid) LIKE '%infant%'
             AND pg_get_constraintdef(c.oid) LIKE '%child%'
             AND pg_get_constraintdef(c.oid) LIKE '%adolescent%'
             AND pg_get_constraintdef(c.oid) LIKE '%adult%'
             AND pg_get_constraintdef(c.oid) LIKE '%older_adult%'
             AND pg_get_constraintdef(c.oid) LIKE '%pregnancy%'
             AND pg_get_constraintdef(c.oid) LIKE '%lactation%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%general%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%unknown%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%other%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%lower%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%btrim%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%translate%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_claim_populations_population_code_chk')
  UNION ALL SELECT 'named_age_bounds_check_contract',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%age_min%'
             AND pg_get_constraintdef(c.oid) LIKE '%age_max%'
             AND pg_get_constraintdef(c.oid) LIKE '%120%'
             AND pg_get_constraintdef(c.oid) LIKE '%age_min >= 0%'
             AND pg_get_constraintdef(c.oid) LIKE '%age_max >= 1%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_claim_populations_age_bounds_chk')
  UNION ALL SELECT 'named_age_order_check_contract',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%age_min < age_max%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%age_min <= age_max%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_claim_populations_age_order_chk')
  UNION ALL SELECT 'natural_unique_exists',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_claim_populations_natural_key' AND c.contype='u'
                   AND c.conrelid='public.aromatherapy_claim_populations'::regclass)
  UNION ALL SELECT 'natural_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claim_populations_natural_key' AND con.contype='u')
          = ARRAY['tenant_id','claim_id','population_code']::name[])
  UNION ALL SELECT 'claim_fk_exists',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_claim_populations_claim_fk' AND c.contype='f'
                   AND c.conrelid='public.aromatherapy_claim_populations'::regclass)
  UNION ALL SELECT 'claim_fk_local_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claim_populations_claim_fk' AND con.contype='f')
          = ARRAY['tenant_id','claim_id']::name[])
  UNION ALL SELECT 'claim_fk_parent_target_and_order',
         ((SELECT c.confrelid='public.aromatherapy_claims'::regclass
           FROM pg_constraint c WHERE c.conname='aromatherapy_claim_populations_claim_fk')
          AND (SELECT array_agg(a.attname ORDER BY k.ord)
               FROM pg_constraint con CROSS JOIN unnest(con.confkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum
               WHERE con.conname='aromatherapy_claim_populations_claim_fk')
              = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'claim_fk_on_delete_cascade',
         (SELECT c.confdeltype='c' FROM pg_constraint c WHERE c.conname='aromatherapy_claim_populations_claim_fk')
  UNION ALL SELECT 'fk_count_exactly_1',
         (SELECT count(*)=1 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_claim_populations'::regclass AND c.contype='f')
  UNION ALL SELECT 'reverse_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_claim_populations_reverse_idx')
  UNION ALL SELECT 'reverse_index_exact_order_nonunique',
         (SELECT indexdef LIKE '%(tenant_id, population_code)%' AND indexdef NOT LIKE '%UNIQUE%'
          FROM pg_indexes WHERE indexname='aromatherapy_claim_populations_reverse_idx')
  UNION ALL SELECT 'identity_guard_function_exists',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_claim_populations_identity_guard')
  UNION ALL SELECT 'identity_guard_function_contract',
         (SELECT pg_get_functiondef(p.oid) LIKE '%NEW.id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.tenant_id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.claim_id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.population_code%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.age_min%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.age_max%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.created_at%'
             AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM%'
             AND pg_get_functiondef(p.oid) LIKE '%23514%'
          FROM pg_proc p WHERE p.proname='aromatherapy_claim_populations_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger_before_update_row',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_claim_populations'::regclass
                   AND t.tgname='trg_aromatherapy_claim_populations_identity_guard' AND NOT t.tgisinternal
                   AND (t.tgtype & 1)=1 AND (t.tgtype & 2)=2 AND (t.tgtype & 16)=16)
  UNION ALL SELECT 'exactly_one_user_trigger',
         (SELECT count(*)=1 FROM pg_trigger t
          WHERE t.tgrelid='public.aromatherapy_claim_populations'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_claim_populations'::regclass)
  UNION ALL SELECT 'claims_parent_candidate_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claims_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'population_vocabulary_table_absent',
         (to_regclass('public.aromatherapy_populations') IS NULL)
)
SELECT check_name, passed FROM checks
UNION ALL SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; 11 kontrol + B_OVERALL = 12 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec(check_name, passed) AS (
  SELECT s.check_name, s.passed
  FROM (VALUES ('public.aromatherapy_claim_populations')) AS g(tbl)
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
--   9 pozitif + 21 negatif + C_OVERALL. Parent zinciri transaction içinde seed edilir.
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Seed: parent zinciri (tenant A: taxonA→prepA→claimA/claimA2/claimDEL; tenant B: taxonB→prepB→claimB).
INSERT INTO public.aromatherapy_plant_taxa (id, tenant_id, genus, species, taxon_rank, family) VALUES
  ('a0000001-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lavandula','angustifolia','species','Lamiaceae'),
  ('b0000001-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Mentha','piperita','species','Lamiaceae');

INSERT INTO public.aromatherapy_preparations (id, tenant_id, taxon_id, preparation_type, plant_part) VALUES
  ('a0000002-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','a0000001-0000-4000-8000-000000000001','essential_oil','flower'),
  ('b0000002-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','b0000001-0000-4000-8000-000000000001','essential_oil','leaf');

INSERT INTO public.aromatherapy_claims
  (id, tenant_id, preparation_id, claim_type, conclusion, conclusion_provenance, evidence_layer, rationale_status) VALUES
  ('a0000003-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','a0000002-0000-4000-8000-000000000002','use','iddia A','source_original','traditional','source_gives_no_rationale'),
  ('a0000004-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','a0000002-0000-4000-8000-000000000002','use','iddia A2','source_original','traditional','source_gives_no_rationale'),
  ('a0000005-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','a0000002-0000-4000-8000-000000000002','use','iddia DEL','source_original','traditional','source_gives_no_rationale'),
  ('b0000003-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','b0000002-0000-4000-8000-000000000002','use','iddia B','source_original','traditional','source_gives_no_rationale');

DO $$
DECLARE
  v_cnt integer;
  T        constant uuid := '11111111-1111-4111-8111-111111111111';
  TB       constant uuid := '22222222-2222-4222-8222-222222222222';
  TX       constant uuid := '33333333-3333-4333-8333-333333333333';  -- N16 hedef tenant
  CLAIMA   constant uuid := 'a0000003-0000-4000-8000-000000000003';
  CLAIMA2  constant uuid := 'a0000004-0000-4000-8000-000000000004';
  CLAIMDEL constant uuid := 'a0000005-0000-4000-8000-000000000005';
  CLAIMB   constant uuid := 'b0000003-0000-4000-8000-000000000003';  -- tenant B claim (cross-tenant)
  NOCLAIM  constant uuid := 'c0000009-0000-4000-8000-000000000009';  -- var olmayan claim
  NEWID    constant uuid := 'd0000001-0000-4000-8000-000000000001';  -- N15 id UPDATE hedefi
BEGIN
  -- ══ POZİTİF (9) ══
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA,'child');
  RAISE NOTICE 'PASS P1: child (yaş sınırı yok)';
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA,'pregnancy');
  RAISE NOTICE 'PASS P2: ayni claim + pregnancy (çoklu population)';
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,'child');
  RAISE NOTICE 'PASS P3: farkli claim + ayni population (child)';

  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA,'infant',NULL,1);
  RAISE NOTICE 'PASS P4: infant (yalniz age_max=1)';
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA,'adult',18,NULL);
  RAISE NOTICE 'PASS P5: adult (yalniz age_min=18)';
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA,'adolescent',13,18);
  RAISE NOTICE 'PASS P6: adolescent (age_min=13, age_max=18)';
  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA,'lactation');
  RAISE NOTICE 'PASS P7: lactation (yaş sınırı yok)';

  UPDATE public.aromatherapy_claim_populations SET population_code=population_code
    WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
  RAISE NOTICE 'PASS P8: no-op identity UPDATE izinli';

  INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMDEL,'child');
  DELETE FROM public.aromatherapy_claims WHERE id=CLAIMDEL;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_populations WHERE claim_id=CLAIMDEL;
  IF v_cnt=0 THEN RAISE NOTICE 'PASS P9: claim DELETE CASCADE (population baglari silindi)';
  ELSE RAISE EXCEPTION 'FAIL P9: CASCADE sonrasi kalan population (=%)', v_cnt; END IF;

  -- ══ NEGATİF (21) ══  handler dagilimi: unique 1 / check 16 / not_null 2 / fk 2
  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA,'child');
    RAISE EXCEPTION 'FAIL N1: duplicate natural key kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS N1: duplicate natural key reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,'senior');
    RAISE EXCEPTION 'FAIL N2: invalid population_code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N2: invalid population_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,'Child');
    RAISE EXCEPTION 'FAIL N3: uppercase population_code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N3: uppercase population_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,'child ');
    RAISE EXCEPTION 'FAIL N4: whitespace population_code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N4: whitespace population_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,'');
    RAISE EXCEPTION 'FAIL N5: empty population_code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N5: empty population_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA2,'adult',-1,NULL);
    RAISE EXCEPTION 'FAIL N6: age_min=-1 kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N6: age_min=-1 reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA2,'adult',NULL,0);
    RAISE EXCEPTION 'FAIL N7: age_max=0 kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N7: age_max=0 reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA2,'adult',121,NULL);
    RAISE EXCEPTION 'FAIL N8: age_min=121 kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N8: age_min=121 reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA2,'adult',NULL,121);
    RAISE EXCEPTION 'FAIL N9: age_max=121 kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N9: age_max=121 reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code,age_min,age_max) VALUES (T,CLAIMA2,'adult',18,18);
    RAISE EXCEPTION 'FAIL N10: age_min=age_max (boş aralık) kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N10: age_min=age_max boş aralık reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMA2,NULL);
    RAISE EXCEPTION 'FAIL N11: NULL population_code kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N11: NULL population_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,NULL,'child');
    RAISE EXCEPTION 'FAIL N12: NULL claim_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N12: NULL claim_id reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,NOCLAIM,'child');
    RAISE EXCEPTION 'FAIL N13: nonexistent claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS N13: nonexistent claim reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_populations (tenant_id,claim_id,population_code) VALUES (T,CLAIMB,'child');
    RAISE EXCEPTION 'FAIL N14: cross-tenant claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS N14: cross-tenant claim reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET id=NEWID
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N15: id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N15: id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET tenant_id=TX
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N16: tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N16: tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET claim_id=CLAIMA2
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N17: claim_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N17: claim_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET population_code='adult'
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N18: population_code UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N18: population_code UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET age_min=5
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N19: age_min UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N19: age_min UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET age_max=5
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N20: age_max UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N20: age_max UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_populations SET created_at=timestamptz '2000-01-01 00:00:00+00'
      WHERE tenant_id=T AND claim_id=CLAIMA AND population_code='child';
    RAISE EXCEPTION 'FAIL N21: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N21: created_at UPDATE reddedildi'; END;

  RAISE NOTICE '-- C_OVERALL: tum davranissal testler PASS (9 pozitif + 21 negatif) --';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.


-- ═════════════════════════════════════════════════════════════════════════════
-- RESIDUAL — BÖLÜM C fixture kalıntı kontrolü (salt-okunur; dördü de 0 beklenir)
--   Yalnız C harness fixture UUID'lerini hedefler; production kayıtları DAHİL DEĞİLDİR.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'aromatherapy_claim_populations' AS table_name,
       (SELECT count(*) FROM public.aromatherapy_claim_populations
        WHERE tenant_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) AS residual_rows
UNION ALL
SELECT 'aromatherapy_claims',
       (SELECT count(*) FROM public.aromatherapy_claims
        WHERE id IN ('a0000003-0000-4000-8000-000000000003','a0000004-0000-4000-8000-000000000004',
                     'a0000005-0000-4000-8000-000000000005','b0000003-0000-4000-8000-000000000003'))
UNION ALL
SELECT 'aromatherapy_preparations',
       (SELECT count(*) FROM public.aromatherapy_preparations
        WHERE id IN ('a0000002-0000-4000-8000-000000000002','b0000002-0000-4000-8000-000000000002'))
UNION ALL
SELECT 'aromatherapy_plant_taxa',
       (SELECT count(*) FROM public.aromatherapy_plant_taxa
        WHERE id IN ('a0000001-0000-4000-8000-000000000001','b0000001-0000-4000-8000-000000000001'))
ORDER BY table_name;
