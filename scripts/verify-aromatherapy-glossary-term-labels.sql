-- ============================================================
-- verify-aromatherapy-glossary-term-labels.sql
--
-- C2M-C doğrulama harness'i — public.aromatherapy_glossary_term_labels
-- (migration: supabase/migrations/20260807000000_aromatherapy_glossary_term_labels.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Bölüm C parent glossary_terms seed'lerini
--   transaction içinde üretir; mevcut production verisine BAĞIMLI DEĞİLDİR.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; tam 24 kontrol)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT 'table_exists' AS check_name,
         (to_regclass('public.aromatherapy_glossary_term_labels') IS NOT NULL) AS passed
  UNION ALL SELECT 'column_count_10',
         (SELECT count(*)=10 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels')
  UNION ALL SELECT 'col_label_text_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels' AND column_name='label_text' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_label_type_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels' AND column_name='label_type' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_language_tag_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels' AND column_name='language_tag' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_script_code_text_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels' AND column_name='script_code' AND data_type='text' AND is_nullable='YES')
  UNION ALL SELECT 'col_status_default_active',
         (SELECT column_default LIKE '%active%' FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels' AND column_name='status')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_labels'
                     AND column_name IN ('is_primary','is_preferred','is_searchable','source_id','passage_id',
                                         'verification_status','verified_by','verified_at','confidence','evidence_note',
                                         'provenance','description','notes','valid_from','valid_to','canonical_key','slug','revision','series_id'))
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_term_labels'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tenant_id_unique_candidate',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_glossary_term_labels_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'check_count_5',
         (SELECT count(*)=5 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_labels'::regclass AND c.contype='c')
  UNION ALL SELECT 'normalized_unique_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_labels_term_lang_text_uidx')
  UNION ALL SELECT 'normalized_unique_index_expression_and_columns',
         (SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%glossary_term_id%'
                 AND indexdef LIKE '%lower(btrim(language_tag))%' AND indexdef LIKE '%CASE%'
                 AND indexdef LIKE '%tr-%' AND indexdef LIKE '%translate%' AND indexdef LIKE '%İIŞĞÇÖÜ%'
                 AND indexdef NOT LIKE '%NULLS NOT DISTINCT%'
          FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_labels_term_lang_text_uidx')
  UNION ALL SELECT 'reverse_lookup_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_labels_lookup_idx')
  UNION ALL SELECT 'reverse_lookup_index_expression_and_columns',
         (SELECT indexdef NOT LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%'
                 AND indexdef LIKE '%lower(btrim(language_tag))%' AND indexdef LIKE '%CASE%'
                 AND indexdef LIKE '%translate%' AND indexdef LIKE '%İIŞĞÇÖÜ%'
                 AND indexdef NOT LIKE '%glossary_term_id%' AND indexdef NOT LIKE '%label_type%'
                 AND indexdef NOT LIKE '%script_code%' AND indexdef NOT LIKE '%status%'
          FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_labels_lookup_idx')
  UNION ALL SELECT 'term_fk_2col_cascade',
         (EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_labels_term_fk'
                  AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_terms'::regclass AND c.confdeltype='c')
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_labels_term_fk')
              = ARRAY['tenant_id','glossary_term_id']::name[]
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.confkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_labels_term_fk')
              = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'fk_count_exactly_1',
         (SELECT count(*)=1 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_labels'::regclass AND c.contype='f')
  UNION ALL SELECT 'identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_term_labels_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_labels'::regclass AND t.tgname='trg_aromatherapy_glossary_term_labels_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_labels'::regclass AND t.tgname='trg_aromatherapy_glossary_term_labels_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_labels'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'trigger_order_identity_before_updated',
         ('trg_aromatherapy_glossary_term_labels_identity_guard' < 'trg_aromatherapy_glossary_term_labels_updated_at')
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_labels'::regclass)
  UNION ALL SELECT 'glossary_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_terms_tenant_id_unique' AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2)
)
SELECT check_name, passed FROM checks
UNION ALL SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; tam 11 kontrol)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec AS (
  SELECT 'rls_enabled' AS check_name,
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_labels'::regclass) AS passed
  UNION ALL SELECT 'force_rls_false',
         (SELECT relforcerowsecurity=false FROM pg_class WHERE oid='public.aromatherapy_glossary_term_labels'::regclass)
  UNION ALL SELECT 'policy_count_zero',
         (SELECT count(*)=0 FROM pg_policy WHERE polrelid='public.aromatherapy_glossary_term_labels'::regclass)
  UNION ALL SELECT 'anon_no_dml',
         NOT (has_table_privilege('anon','public.aromatherapy_glossary_term_labels','SELECT')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_labels','INSERT')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_labels','UPDATE')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_labels','DELETE'))
  UNION ALL SELECT 'authenticated_no_dml',
         NOT (has_table_privilege('authenticated','public.aromatherapy_glossary_term_labels','SELECT')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_labels','INSERT')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_labels','UPDATE')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_labels','DELETE'))
  UNION ALL SELECT 'public_no_dml',
         NOT (has_table_privilege('public','public.aromatherapy_glossary_term_labels','SELECT')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_labels','INSERT')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_labels','UPDATE')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_labels','DELETE'))
  UNION ALL SELECT 'service_role_has_dml',
         (has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','SELECT')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','INSERT')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','UPDATE')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','DELETE'))
  UNION ALL SELECT 'service_role_no_truncate',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','TRUNCATE')
  UNION ALL SELECT 'service_role_no_references',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','REFERENCES')
  UNION ALL SELECT 'service_role_no_trigger',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','TRIGGER')
  UNION ALL SELECT 'service_role_no_maintain',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_labels','MAINTAIN')
)
SELECT check_name, passed FROM sec
UNION ALL SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; 13 pozitif + 22 negatif)
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Seed: parent glossary_terms (tenant A: GT1,GT2,GTDEL; tenant B: GTB).
INSERT INTO public.aromatherapy_glossary_terms (id, tenant_id, canonical_term_tr, short_definition_tr) VALUES
  ('a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','terim1','tanim1'),
  ('a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','terim2','tanim2'),
  ('a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','terimdel','tanimdel'),
  ('a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','terimb','tanimb');

DO $$
DECLARE
  v_old timestamptz; v_new timestamptz; v_cnt integer;
  T     constant uuid := '22222222-2222-2222-2222-222222222222';
  TB    constant uuid := '44444444-4444-4444-4444-444444444444';
  GT1   constant uuid := 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GT2   constant uuid := 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTDEL constant uuid := 'a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTB   constant uuid := 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  L1    constant uuid := 'e1111111-cccc-cccc-cccc-cccccccccccc';  -- (GT1,'Ölmez Çiçek',synonym,tr) — immutable testleri
  LEDIT constant uuid := 'e2222222-cccc-cccc-cccc-cccccccccccc';  -- edit/bump/archive testleri
  LDEL  constant uuid := 'e3333333-cccc-cccc-cccc-cccccccccccc';  -- CASCADE testi
  NOTERM constant uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
BEGIN
  -- ══ POZİTİF (13) ══
  INSERT INTO public.aromatherapy_glossary_term_labels (id,tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (L1,T,GT1,'Ölmez Çiçek','synonym','tr');
  RAISE NOTICE 'PASS: synonym insert';

  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GC-MS','abbreviation','en');
  RAISE NOTICE 'PASS: abbreviation insert';

  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GC/MS','spelling_variant','en');
  RAISE NOTICE 'PASS: spelling_variant insert';

  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'Helichrysum angustifolium','former_name','en');
  RAISE NOTICE 'PASS: former_name insert';

  -- aynı term + aynı label text + farklı language_tag → serbest
  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'Immortelle','synonym','en');
  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'Immortelle','synonym','fr');
  RAISE NOTICE 'PASS: ayni term ayni text farkli language_tag kabul';

  -- aynı label + aynı dil + farklı canonical term → ambiguity kabul (tenant-global unique DEĞİL)
  INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT2,'GC-MS','abbreviation','en');
  RAISE NOTICE 'PASS: ayni label farkli term ambiguity kabul';

  -- edit/bump/archive testleri için LEDIT (eski updated_at)
  INSERT INTO public.aromatherapy_glossary_term_labels (id,tenant_id,glossary_term_id,label_text,label_type,language_tag,updated_at)
    VALUES (LEDIT,T,GT2,'DuzeltAd','synonym','en', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_glossary_term_labels WHERE id=LEDIT;
  UPDATE public.aromatherapy_glossary_term_labels SET label_text='DuzeltAdYeni' WHERE id=LEDIT;
  RAISE NOTICE 'PASS: label_text edit';
  SELECT updated_at INTO v_new FROM public.aromatherapy_glossary_term_labels WHERE id=LEDIT;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: edit updated_at degismedi'; END IF;

  UPDATE public.aromatherapy_glossary_term_labels SET label_type='abbreviation' WHERE id=LEDIT;
  RAISE NOTICE 'PASS: label_type edit';

  UPDATE public.aromatherapy_glossary_term_labels SET language_tag='fr', script_code='Latn' WHERE id=LEDIT;
  RAISE NOTICE 'PASS: language_tag + script_code edit';

  UPDATE public.aromatherapy_glossary_term_labels SET status='archived' WHERE id=LEDIT;
  RAISE NOTICE 'PASS: active->archived';

  UPDATE public.aromatherapy_glossary_term_labels SET tenant_id=tenant_id WHERE id=L1;
  RAISE NOTICE 'PASS: no-op identity SET izinli';

  -- parent glossary term DELETE CASCADE: label silinir.
  INSERT INTO public.aromatherapy_glossary_term_labels (id,tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (LDEL,T,GTDEL,'SilAd','synonym','tr');
  DELETE FROM public.aromatherapy_glossary_terms WHERE id=GTDEL;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_glossary_term_labels WHERE id=LDEL;
  IF v_cnt=0 THEN RAISE NOTICE 'PASS: term DELETE CASCADE (label silindi)';
  ELSE RAISE EXCEPTION 'FAIL: term DELETE CASCADE beklenmeyen (label=%)', v_cnt; END IF;

  -- ══ NEGATİF: UNIQUE (4) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'Ölmez Çiçek','synonym','tr');
    RAISE EXCEPTION 'FAIL: duplicate_same_term_lang kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate same-term/same-lang reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'  Ölmez   Çiçek  ','synonym','tr');
    RAISE EXCEPTION 'FAIL: whitespace_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: whitespace-normalized duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'ÖLMEZ ÇİÇEK','synonym','tr');
    RAISE EXCEPTION 'FAIL: turkce_casefold_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: Turkce case-fold duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'Ölmez Çiçek','abbreviation','tr');
    RAISE EXCEPTION 'FAIL: same_form_diff_type kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: ayni lexical form farkli label_type reddedildi'; END;

  -- ══ NEGATİF: CHECK payload (9) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'','synonym','en');
    RAISE EXCEPTION 'FAIL: empty_label_text kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty label_text reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'   ','synonym','en');
    RAISE EXCEPTION 'FAIL: whitespace_label_text kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace label_text reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel1','nickname','en');
    RAISE EXCEPTION 'FAIL: invalid_label_type kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid label_type reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel2','synonym','');
    RAISE EXCEPTION 'FAIL: empty_language_tag kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty language_tag reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel3','synonym','  ');
    RAISE EXCEPTION 'FAIL: whitespace_language_tag kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace language_tag reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel4','synonym','english');
    RAISE EXCEPTION 'FAIL: invalid_language_tag_format kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid language_tag format reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag,script_code)
    VALUES (T,GT1,'GecerliLabel5','synonym','en','');
    RAISE EXCEPTION 'FAIL: empty_script_code kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty script_code reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag,script_code)
    VALUES (T,GT1,'GecerliLabel6','synonym','en','latn');
    RAISE EXCEPTION 'FAIL: invalid_script_code_format kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid script_code format reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag,status)
    VALUES (T,GT1,'GecerliLabel7','synonym','en','draft');
    RAISE EXCEPTION 'FAIL: invalid_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid status reddedildi'; END;

  -- ══ NEGATİF: NOT NULL (3) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,NULL,'synonym','en');
    RAISE EXCEPTION 'FAIL: null_label_text kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL label_text reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel8',NULL,'en');
    RAISE EXCEPTION 'FAIL: null_label_type kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL label_type reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GT1,'GecerliLabel9','synonym',NULL);
    RAISE EXCEPTION 'FAIL: null_language_tag kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL language_tag reddedildi'; END;

  -- ══ NEGATİF: FK (2) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,GTB,'GecerliLabel10','synonym','en');
    RAISE EXCEPTION 'FAIL: cross_tenant_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_labels (tenant_id,glossary_term_id,label_text,label_type,language_tag)
    VALUES (T,NOTERM,'GecerliLabel11','synonym','en');
    RAISE EXCEPTION 'FAIL: nonexistent_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_term reddedildi'; END;

  -- ══ NEGATİF: IDENTITY (4; SQLSTATE 23514 = check_violation) ══
  BEGIN UPDATE public.aromatherapy_glossary_term_labels SET id='e10000ff-cccc-cccc-cccc-cccccccccccc' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_labels SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tenant_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_labels SET glossary_term_id=GT2 WHERE id=L1;
    RAISE EXCEPTION 'FAIL: glossary_term_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: glossary_term_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_labels SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: created_at UPDATE reddedildi'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
