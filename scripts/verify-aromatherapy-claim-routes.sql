-- ============================================================
-- verify-aromatherapy-claim-routes.sql
--
-- C2N doğrulama harness'i — public.aromatherapy_claim_routes
-- (migration: supabase/migrations/20260809000000_aromatherapy_claim_routes.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor.
--   * PREFLIGHT: production migration'dan ÖNCE ayrı çalıştırılır (salt-okunur; veri değiştirmez).
--   * BÖLÜM A/B: migration SONRASI yapısal + güvenlik doğrulaması (salt-okunur).
--   * BÖLÜM C: tek BEGIN…ROLLBACK davranış testi (kalıcı yazma YOK); parent zinciri
--     (plant_taxa → preparations → claims) transaction içinde seed edilir; production verisine
--     BAĞIMLI DEĞİLDİR.
--   * BÖLÜM D: MIGRATION-CLOSURE backfill doğrulaması (salt-okunur; yalnız cutover ÖNCESİ).
--   * RESIDUAL: Bölüm C fixture UUID'leri için kalıntı kontrolü (salt-okunur).
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PREFLIGHT — PRODUCTION MIGRATION ÖNCESİ (salt-okunur; hiçbir veri değişmez)
-- ═════════════════════════════════════════════════════════════════════════════
WITH pre(check_name, passed) AS (
  SELECT 'claim_routes_table_absent',
         (to_regclass('public.aromatherapy_claim_routes') IS NULL)
  UNION ALL SELECT 'route_dictionary_table_absent',
         (to_regclass('public.aromatherapy_routes') IS NULL)
  UNION ALL SELECT 'claims_route_text_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='aromatherapy_claims'
                   AND column_name='route' AND data_type='text' AND is_nullable='YES')
  UNION ALL SELECT 'claims_route_chk_exact_allowlist',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%oral%'
             AND pg_get_constraintdef(c.oid) LIKE '%topical%'
             AND pg_get_constraintdef(c.oid) LIKE '%inhalation%'
             AND pg_get_constraintdef(c.oid) LIKE '%other%'
             AND pg_get_constraintdef(c.oid) LIKE '%unknown%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_claims_route_chk')
  UNION ALL SELECT 'claims_route_chk_validated',
         (SELECT c.convalidated FROM pg_constraint c WHERE c.conname='aromatherapy_claims_route_chk')
  UNION ALL SELECT 'claims_tenant_id_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claims_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'no_out_of_allowlist_route_rows',
         (SELECT count(*)=0 FROM public.aromatherapy_claims
          WHERE route IS NOT NULL AND route NOT IN ('oral','topical','inhalation','other','unknown'))
  UNION ALL SELECT 'identity_guard_function_absent',
         NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_claim_routes_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger_absent',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aromatherapy_claim_routes_identity_guard')
)
SELECT check_name, passed FROM pre
UNION ALL SELECT 'PREFLIGHT_OVERALL', bool_and(passed) FROM pre
ORDER BY check_name;

-- PREFLIGHT bilgi (informational; PASS/FAIL değil):
SELECT
  (SELECT count(*) FROM public.aromatherapy_claims)                          AS total_claim_rows,
  (SELECT count(*) FROM public.aromatherapy_claims WHERE route IS NOT NULL)  AS nonnull_route_rows,
  (SELECT array_agg(DISTINCT route ORDER BY route)
     FROM public.aromatherapy_claims WHERE route IS NOT NULL)                AS distinct_nonnull_routes;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; 29 kontrol + A_OVERALL = 30 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks(check_name, passed) AS (
  SELECT 'table_exists',
         (to_regclass('public.aromatherapy_claim_routes') IS NOT NULL)
  UNION ALL SELECT 'column_count_5',
         (SELECT count(*)=5 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='aromatherapy_claim_routes')
  UNION ALL SELECT 'id_uuid_notnull_default_gen_random_uuid',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_routes' AND column_name='id'
                   AND data_type='uuid' AND is_nullable='NO' AND column_default LIKE '%gen_random_uuid%')
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_claim_routes'::regclass AND c.contype='p'
                   AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tenant_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_routes' AND column_name='tenant_id'
                   AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'claim_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_routes' AND column_name='claim_id'
                   AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'route_code_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_routes' AND column_name='route_code'
                   AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'created_at_timestamptz_notnull_default_now',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='aromatherapy_claim_routes' AND column_name='created_at'
                   AND data_type='timestamp with time zone' AND is_nullable='NO' AND column_default LIKE '%now()%')
  UNION ALL SELECT 'no_updated_at_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_routes' AND column_name='updated_at')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_claim_routes'
                       AND column_name IN ('updated_at','status','name_tr','name_en','description','language_tag',
                         'script_code','source_id','passage_id','verification_status','verified_by','verified_at',
                         'evidence_note','provenance','confidence','slug','canonical_key','icon','color','sort_order',
                         'revision','series_id','tag_id','category_id','glossary_term_id'))
  UNION ALL SELECT 'check_count_exactly_1',
         (SELECT count(*)=1 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_claim_routes'::regclass AND c.contype='c')
  UNION ALL SELECT 'named_route_check_exact_allowlist',
         (SELECT pg_get_constraintdef(c.oid) LIKE '%route_code%'
             AND pg_get_constraintdef(c.oid) LIKE '%oral%'
             AND pg_get_constraintdef(c.oid) LIKE '%topical%'
             AND pg_get_constraintdef(c.oid) LIKE '%inhalation%'
             AND pg_get_constraintdef(c.oid) LIKE '%other%'
             AND pg_get_constraintdef(c.oid) LIKE '%unknown%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%lower%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%btrim%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%translate%'
             AND pg_get_constraintdef(c.oid) NOT LIKE '%IS NULL%'
          FROM pg_constraint c WHERE c.conname='aromatherapy_claim_routes_route_code_chk')
  UNION ALL SELECT 'natural_unique_exists',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_claim_routes_natural_key' AND c.contype='u'
                   AND c.conrelid='public.aromatherapy_claim_routes'::regclass)
  UNION ALL SELECT 'natural_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claim_routes_natural_key' AND con.contype='u')
          = ARRAY['tenant_id','claim_id','route_code']::name[])
  UNION ALL SELECT 'claim_fk_exists',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_claim_routes_claim_fk' AND c.contype='f'
                   AND c.conrelid='public.aromatherapy_claim_routes'::regclass)
  UNION ALL SELECT 'claim_fk_local_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claim_routes_claim_fk' AND con.contype='f')
          = ARRAY['tenant_id','claim_id']::name[])
  UNION ALL SELECT 'claim_fk_parent_target_and_order',
         ((SELECT c.confrelid='public.aromatherapy_claims'::regclass
           FROM pg_constraint c WHERE c.conname='aromatherapy_claim_routes_claim_fk')
          AND (SELECT array_agg(a.attname ORDER BY k.ord)
               FROM pg_constraint con CROSS JOIN unnest(con.confkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum
               WHERE con.conname='aromatherapy_claim_routes_claim_fk')
              = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'claim_fk_on_delete_cascade',
         (SELECT c.confdeltype='c' FROM pg_constraint c WHERE c.conname='aromatherapy_claim_routes_claim_fk')
  UNION ALL SELECT 'fk_count_exactly_1',
         (SELECT count(*)=1 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_claim_routes'::regclass AND c.contype='f')
  UNION ALL SELECT 'reverse_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_claim_routes_reverse_idx')
  UNION ALL SELECT 'reverse_index_exact_order_nonunique',
         (SELECT indexdef LIKE '%(tenant_id, route_code)%' AND indexdef NOT LIKE '%UNIQUE%'
          FROM pg_indexes WHERE indexname='aromatherapy_claim_routes_reverse_idx')
  UNION ALL SELECT 'identity_guard_function_exists',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_claim_routes_identity_guard')
  UNION ALL SELECT 'identity_guard_function_contract',
         (SELECT pg_get_functiondef(p.oid) LIKE '%NEW.id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.tenant_id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.claim_id%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.route_code%'
             AND pg_get_functiondef(p.oid) LIKE '%NEW.created_at%'
             AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM%'
             AND pg_get_functiondef(p.oid) LIKE '%23514%'
          FROM pg_proc p WHERE p.proname='aromatherapy_claim_routes_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger_before_update_row',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_claim_routes'::regclass
                   AND t.tgname='trg_aromatherapy_claim_routes_identity_guard' AND NOT t.tgisinternal
                   AND (t.tgtype & 1)=1 AND (t.tgtype & 2)=2 AND (t.tgtype & 16)=16)
  UNION ALL SELECT 'exactly_one_user_trigger',
         (SELECT count(*)=1 FROM pg_trigger t
          WHERE t.tgrelid='public.aromatherapy_claim_routes'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_claim_routes'::regclass)
  UNION ALL SELECT 'claims_parent_candidate_unique_exact_order',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_claims_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'legacy_claims_route_contract_unchanged',
         (EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='aromatherapy_claims' AND column_name='route'
                    AND data_type='text' AND is_nullable='YES')
          AND (SELECT c.convalidated FROM pg_constraint c WHERE c.conname='aromatherapy_claims_route_chk')
          AND (SELECT pg_get_constraintdef(c.oid) LIKE '%oral%'
                  AND pg_get_constraintdef(c.oid) LIKE '%topical%'
                  AND pg_get_constraintdef(c.oid) LIKE '%inhalation%'
                  AND pg_get_constraintdef(c.oid) LIKE '%other%'
                  AND pg_get_constraintdef(c.oid) LIKE '%unknown%'
               FROM pg_constraint c WHERE c.conname='aromatherapy_claims_route_chk'))
  UNION ALL SELECT 'route_dictionary_table_absent',
         (to_regclass('public.aromatherapy_routes') IS NULL)
)
SELECT check_name, passed FROM checks
UNION ALL SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; 11 kontrol + B_OVERALL = 12 satır)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec(check_name, passed) AS (
  SELECT s.check_name, s.passed
  FROM (VALUES ('public.aromatherapy_claim_routes')) AS g(tbl)
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
--   9 pozitif + 14 negatif + C_OVERALL. Parent zinciri transaction içinde seed edilir.
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
  TX       constant uuid := '33333333-3333-4333-8333-333333333333';  -- N11 hedef tenant
  CLAIMA   constant uuid := 'a0000003-0000-4000-8000-000000000003';
  CLAIMA2  constant uuid := 'a0000004-0000-4000-8000-000000000004';
  CLAIMDEL constant uuid := 'a0000005-0000-4000-8000-000000000005';
  CLAIMB   constant uuid := 'b0000003-0000-4000-8000-000000000003';  -- tenant B claim (cross-tenant)
  NOCLAIM  constant uuid := 'c0000009-0000-4000-8000-000000000009';  -- var olmayan claim
  NEWID    constant uuid := 'd0000001-0000-4000-8000-000000000001';  -- N10 id UPDATE hedefi
BEGIN
  -- ══ POZİTİF (9) ══
  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'oral');
  RAISE NOTICE 'PASS P1: oral link';
  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'topical');
  RAISE NOTICE 'PASS P2: topical link';
  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'inhalation');
  RAISE NOTICE 'PASS P3: inhalation link';
  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'other');
  RAISE NOTICE 'PASS P4: other link';
  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'unknown');
  RAISE NOTICE 'PASS P5: unknown link';

  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE tenant_id=T AND claim_id=CLAIMA;
  IF v_cnt=5 THEN RAISE NOTICE 'PASS P6: ayni claim birden cok route (=5)';
  ELSE RAISE EXCEPTION 'FAIL P6: ayni claim route sayisi beklenmeyen (=%)', v_cnt; END IF;

  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,'oral');
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE tenant_id=T AND route_code='oral';
  IF v_cnt=2 THEN RAISE NOTICE 'PASS P7: ayni route farkli claim (oral=2)';
  ELSE RAISE EXCEPTION 'FAIL P7: oral route sayisi beklenmeyen (=%)', v_cnt; END IF;

  UPDATE public.aromatherapy_claim_routes SET route_code=route_code
    WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
  RAISE NOTICE 'PASS P8: no-op identity UPDATE izinli';

  INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMDEL,'oral');
  DELETE FROM public.aromatherapy_claims WHERE id=CLAIMDEL;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_routes WHERE claim_id=CLAIMDEL;
  IF v_cnt=0 THEN RAISE NOTICE 'PASS P9: claim DELETE CASCADE (route baglari silindi)';
  ELSE RAISE EXCEPTION 'FAIL P9: CASCADE sonrasi kalan route (=%)', v_cnt; END IF;

  -- ══ NEGATİF (14) ══  handler dagilimi: unique 1 / check 9 / not_null 2 / fk 2
  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA,'oral');
    RAISE EXCEPTION 'FAIL N1: duplicate natural key kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS N1: duplicate natural key reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,'nasal');
    RAISE EXCEPTION 'FAIL N2: invalid route kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N2: invalid route reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,'Oral');
    RAISE EXCEPTION 'FAIL N3: uppercase route kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N3: uppercase route reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,'oral ');
    RAISE EXCEPTION 'FAIL N4: whitespace route kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N4: whitespace route reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,'');
    RAISE EXCEPTION 'FAIL N5: empty route kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N5: empty route reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMA2,NULL);
    RAISE EXCEPTION 'FAIL N6: NULL route_code kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N6: NULL route_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,NULL,'oral');
    RAISE EXCEPTION 'FAIL N7: NULL claim_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS N7: NULL claim_id reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,NOCLAIM,'oral');
    RAISE EXCEPTION 'FAIL N8: nonexistent claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS N8: nonexistent claim reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_claim_routes (tenant_id,claim_id,route_code) VALUES (T,CLAIMB,'oral');
    RAISE EXCEPTION 'FAIL N9: cross-tenant claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS N9: cross-tenant claim reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_routes SET id=NEWID
      WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
    RAISE EXCEPTION 'FAIL N10: id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N10: id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_routes SET tenant_id=TX
      WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
    RAISE EXCEPTION 'FAIL N11: tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N11: tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_routes SET claim_id=CLAIMA2
      WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
    RAISE EXCEPTION 'FAIL N12: claim_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N12: claim_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_routes SET route_code='topical'
      WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
    RAISE EXCEPTION 'FAIL N13: route_code UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N13: route_code UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_claim_routes SET created_at=timestamptz '2000-01-01 00:00:00+00'
      WHERE tenant_id=T AND claim_id=CLAIMA AND route_code='oral';
    RAISE EXCEPTION 'FAIL N14: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS N14: created_at UPDATE reddedildi'; END;

  RAISE NOTICE '-- C_OVERALL: tum davranissal testler PASS (9 pozitif + 14 negatif) --';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM D — MIGRATION-CLOSURE BACKFILL DOĞRULAMA (salt-okunur; 7 kontrol + D_OVERALL)
--
--   ⚠ CLOSURE-ONLY: yalnız production migration'dan HEMEN SONRA, writer cutover YAPILMADAN
--   önce migration-kapanışı için çalıştırılır. C2S/C2T writer cutover SONRASINDA yeniden
--   ÇALIŞTIRILMAMALIDIR. Gelecekte çoklu-route kayıtlar normal olacağından KONTROL 1/3/7
--   KALICI REGRESSION INVARIANT DEĞİLDİR (yalnız migration-anı tek-değerli backfill varsayımı).
-- ═════════════════════════════════════════════════════════════════════════════
WITH d(check_name, passed) AS (
  -- 1) claim_routes toplamı = claims WHERE route IS NOT NULL toplamı  [CLOSURE-ONLY]
  SELECT 'backfill_row_count_matches',
         ((SELECT count(*) FROM public.aromatherapy_claim_routes)
          = (SELECT count(*) FROM public.aromatherapy_claims WHERE route IS NOT NULL))
  -- 2) non-null route claim'in exact (tenant_id, claim_id, route=route_code) bağı yoksa sayı 0
  UNION ALL SELECT 'every_nonnull_route_claim_has_bond',
         (SELECT count(*)=0 FROM public.aromatherapy_claims c
          WHERE c.route IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.aromatherapy_claim_routes r
                            WHERE r.tenant_id=c.tenant_id AND r.claim_id=c.id AND r.route_code=c.route))
  -- 3) claims.route ile eşleşmeyen claim_routes satırı = 0  [CLOSURE-ONLY]
  UNION ALL SELECT 'no_claim_route_without_matching_claims_route',
         (SELECT count(*)=0 FROM public.aromatherapy_claim_routes r
          WHERE NOT EXISTS (SELECT 1 FROM public.aromatherapy_claims c
                            WHERE c.tenant_id=r.tenant_id AND c.id=r.claim_id AND c.route=r.route_code))
  -- 4) allowlist dışı route_code = 0
  UNION ALL SELECT 'no_out_of_allowlist_route_code',
         (SELECT count(*)=0 FROM public.aromatherapy_claim_routes
          WHERE route_code NOT IN ('oral','topical','inhalation','other','unknown'))
  -- 5) duplicate natural-key grubu = 0
  UNION ALL SELECT 'no_duplicate_natural_key',
         (SELECT count(*)=0 FROM (
            SELECT 1 FROM public.aromatherapy_claim_routes
            GROUP BY tenant_id, claim_id, route_code HAVING count(*)>1) AS dup)
  -- 6) orphan claim_routes (eşleşen claim yok) = 0
  UNION ALL SELECT 'no_orphan_claim_routes',
         (SELECT count(*)=0 FROM public.aromatherapy_claim_routes r
          WHERE NOT EXISTS (SELECT 1 FROM public.aromatherapy_claims c
                            WHERE c.tenant_id=r.tenant_id AND c.id=r.claim_id))
  -- 7) birden fazla route satırı olan claim = 0  [CLOSURE-ONLY]
  UNION ALL SELECT 'no_claim_with_multiple_routes',
         (SELECT count(*)=0 FROM (
            SELECT 1 FROM public.aromatherapy_claim_routes
            GROUP BY tenant_id, claim_id HAVING count(*)>1) AS multi)
)
SELECT check_name, passed FROM d
UNION ALL SELECT 'D_OVERALL', bool_and(passed) FROM d
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- RESIDUAL — BÖLÜM C fixture kalıntı kontrolü (salt-okunur; dördü de 0 beklenir)
--   Yalnız C harness fixture UUID'lerini hedefler; production backfill satırları DAHİL DEĞİLDİR.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'aromatherapy_claim_routes' AS table_name,
       (SELECT count(*) FROM public.aromatherapy_claim_routes
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
