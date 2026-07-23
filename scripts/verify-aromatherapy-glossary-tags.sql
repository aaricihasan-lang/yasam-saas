-- ============================================================
-- verify-aromatherapy-glossary-tags.sql
--
-- C2M-B doğrulama harness'i — İKİ TABLO:
--   public.aromatherapy_glossary_tags + public.aromatherapy_glossary_term_tags
-- (migration: supabase/migrations/20260806000000_aromatherapy_glossary_tags.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Bölüm C parent glossary_terms seed'lerini
--   transaction içinde üretir; mevcut production verisine BAĞIMLI DEĞİLDİR.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; iki tablo; FK/unique kolon SIRASI dahil)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks(grp, check_name, passed) AS (
  -- ── tags (18) ──
  SELECT 'tag','table_exists',
         (to_regclass('public.aromatherapy_glossary_tags') IS NOT NULL)
  UNION ALL SELECT 'tag','column_count_8',
         (SELECT count(*)=8 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags')
  UNION ALL SELECT 'tag','col_name_tr_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags' AND column_name='name_tr' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'tag','col_name_en_text_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags' AND column_name='name_en' AND data_type='text' AND is_nullable='YES')
  UNION ALL SELECT 'tag','col_description_tr_text_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags' AND column_name='description_tr' AND data_type='text' AND is_nullable='YES')
  UNION ALL SELECT 'tag','col_status_default_active',
         (SELECT column_default LIKE '%active%' FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags' AND column_name='status')
  UNION ALL SELECT 'tag','no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_tags'
                     AND column_name IN ('parent_tag_id','slug','canonical_key','tag_type','facet_type','icon','color','sort_order',
                                         'verification_status','verified_by','verified_at','revision','series_id'))
  UNION ALL SELECT 'tag','pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_tags'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tag','tenant_id_unique_candidate',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_glossary_tags_tenant_id_unique' AND con.contype='u')
          = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'tag','check_count_4',
         (SELECT count(*)=4 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_tags'::regclass AND c.contype='c')
  UNION ALL SELECT 'tag','normalized_unique_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_tags_name_tr_uidx')
  UNION ALL SELECT 'tag','normalized_index_expression_and_columns',
         (SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%translate%'
                 AND indexdef LIKE '%İIŞĞÇÖÜ%' AND indexdef NOT LIKE '%parent%'
          FROM pg_indexes WHERE indexname='aromatherapy_glossary_tags_name_tr_uidx')
  UNION ALL SELECT 'tag','identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_tags_identity_guard')
  UNION ALL SELECT 'tag','identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_tags'::regclass AND t.tgname='trg_aromatherapy_glossary_tags_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'tag','updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_tags'::regclass AND t.tgname='trg_aromatherapy_glossary_tags_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'tag','exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_tags'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'tag','trigger_order_identity_before_updated',
         ('trg_aromatherapy_glossary_tags_identity_guard' < 'trg_aromatherapy_glossary_tags_updated_at')
  UNION ALL SELECT 'tag','rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_tags'::regclass)

  -- ── term_tags (15) ──
  UNION ALL SELECT 'tt','table_exists',
         (to_regclass('public.aromatherapy_glossary_term_tags') IS NOT NULL)
  UNION ALL SELECT 'tt','column_count_5',
         (SELECT count(*)=5 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_tags')
  UNION ALL SELECT 'tt','no_updated_at_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_tags' AND column_name='updated_at')
  UNION ALL SELECT 'tt','pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_term_tags'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tt','natural_unique_3col',
         ((SELECT array_agg(a.attname ORDER BY k.ord)
           FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
           WHERE con.conname='aromatherapy_glossary_term_tags_natural_key' AND con.contype='u')
          = ARRAY['tenant_id','glossary_term_id','tag_id']::name[])
  UNION ALL SELECT 'tt','term_fk_2col_cascade',
         (EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_tags_term_fk'
                  AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_terms'::regclass AND c.confdeltype='c')
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_tags_term_fk')
              = ARRAY['tenant_id','glossary_term_id']::name[]
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.confkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_tags_term_fk')
              = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'tt','tag_fk_2col_restrict',
         (EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_tags_tag_fk'
                  AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_tags'::regclass AND c.confdeltype='r')
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_tags_tag_fk')
              = ARRAY['tenant_id','tag_id']::name[]
          AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM pg_constraint con CROSS JOIN unnest(con.confkey) WITH ORDINALITY AS k(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum WHERE con.conname='aromatherapy_glossary_term_tags_tag_fk')
              = ARRAY['tenant_id','id']::name[])
  UNION ALL SELECT 'tt','fk_count_exactly_2',
         (SELECT count(*)=2 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_tags'::regclass AND c.contype='f')
  UNION ALL SELECT 'tt','reverse_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_tags_reverse_idx' AND indexdef LIKE '%(tenant_id, tag_id)%')
  UNION ALL SELECT 'tt','identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_term_tags_identity_guard')
  UNION ALL SELECT 'tt','identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_tags'::regclass AND t.tgname='trg_aromatherapy_glossary_term_tags_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'tt','exactly_one_user_trigger',
         (SELECT count(*)=1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_tags'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'tt','rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_tags'::regclass)
  UNION ALL SELECT 'tt','glossary_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_terms_tenant_id_unique' AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'tt','tag_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_tags_tenant_id_unique' AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_tags'::regclass AND array_length(c.conkey,1)=2)
)
SELECT grp, check_name, passed FROM checks
UNION ALL SELECT 'tag','A_TAGS_OVERALL', bool_and(passed) FROM checks WHERE grp='tag'
UNION ALL SELECT 'tt','A_TERM_TAGS_OVERALL', bool_and(passed) FROM checks WHERE grp='tt'
UNION ALL SELECT 'zz','A_OVERALL', bool_and(passed) FROM checks
ORDER BY grp, check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; iki tablo, tablo başına 11 kontrol)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec(grp, check_name, passed) AS (
  SELECT g.grp, s.check_name, s.passed
  FROM (VALUES
    ('tag','public.aromatherapy_glossary_tags'),
    ('tt','public.aromatherapy_glossary_term_tags')
  ) AS g(grp, tbl)
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
SELECT grp, check_name, passed FROM sec
UNION ALL SELECT 'tag','B_TAGS_OVERALL', bool_and(passed) FROM sec WHERE grp='tag'
UNION ALL SELECT 'tt','B_TERM_TAGS_OVERALL', bool_and(passed) FROM sec WHERE grp='tt'
UNION ALL SELECT 'zz','B_OVERALL', bool_and(passed) FROM sec
ORDER BY grp, check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
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
  v_old timestamptz; v_new timestamptz; v_cnt integer; v_tag integer;
  T     constant uuid := '22222222-2222-2222-2222-222222222222';
  TB    constant uuid := '44444444-4444-4444-4444-444444444444';
  GT1   constant uuid := 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GT2   constant uuid := 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTDEL constant uuid := 'a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTB   constant uuid := 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  TAG1  constant uuid := 'aa000001-cccc-cccc-cccc-cccccccccccc';  -- 'GC-MS'
  TAG2  constant uuid := 'aa000002-cccc-cccc-cccc-cccccccccccc';  -- 'Fototoksisite' (rename/archive)
  TAGTR constant uuid := 'aa000003-cccc-cccc-cccc-cccccccccccc';  -- 'İnhalasyon' (Türkçe case-fold helper)
  TAGB  constant uuid := 'bb000001-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- tenant B tag
  NOTAG constant uuid := '99999999-9999-9999-9999-999999999999';
  NOTERM constant uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
BEGIN
  -- tenant B tag (cross-tenant testleri için)
  INSERT INTO public.aromatherapy_glossary_tags (id,tenant_id,name_tr) VALUES (TAGB,TB,'B-Tag');

  -- ══ POZİTİF (11) ══
  INSERT INTO public.aromatherapy_glossary_tags (id,tenant_id,name_tr) VALUES (TAG1,T,'GC-MS');
  RAISE NOTICE 'PASS: gecerli tag';

  INSERT INTO public.aromatherapy_glossary_tags (id,tenant_id,name_tr,updated_at)
    VALUES (TAG2,T,'Fototoksisite', timestamptz '2000-01-01 00:00:00+00');
  RAISE NOTICE 'PASS: ikinci gecerli tag';

  SELECT updated_at INTO v_old FROM public.aromatherapy_glossary_tags WHERE id=TAG2;
  UPDATE public.aromatherapy_glossary_tags SET name_tr='FototoksisiteYeni' WHERE id=TAG2;
  RAISE NOTICE 'PASS: tag rename';
  SELECT updated_at INTO v_new FROM public.aromatherapy_glossary_tags WHERE id=TAG2;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: rename updated_at degismedi'; END IF;

  UPDATE public.aromatherapy_glossary_tags SET status='archived' WHERE id=TAG2;
  RAISE NOTICE 'PASS: status active->archived';

  UPDATE public.aromatherapy_glossary_tags SET tenant_id=tenant_id WHERE id=TAG1;
  RAISE NOTICE 'PASS: no-op tag identity SET izinli';

  -- Türkçe case-fold helper tag (pozitif değil; negatif case-fold testi için)
  INSERT INTO public.aromatherapy_glossary_tags (id,tenant_id,name_tr) VALUES (TAGTR,T,'İnhalasyon');

  -- ══ POZİTİF: junction ══
  INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,TAG1);
  RAISE NOTICE 'PASS: gecerli term-tag link';

  INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,TAG2);
  RAISE NOTICE 'PASS: ayni term birden fazla tag';

  INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT2,TAG1);
  RAISE NOTICE 'PASS: ayni tag birden fazla term';

  UPDATE public.aromatherapy_glossary_term_tags SET tag_id=tag_id WHERE tenant_id=T AND glossary_term_id=GT1 AND tag_id=TAG1;
  RAISE NOTICE 'PASS: no-op junction identity SET izinli';

  -- glossary term DELETE CASCADE: yalnız link silinir, tag korunur.
  INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GTDEL,TAG2);
  DELETE FROM public.aromatherapy_glossary_terms WHERE id=GTDEL;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_glossary_term_tags WHERE glossary_term_id=GTDEL;
  SELECT count(*) INTO v_tag FROM public.aromatherapy_glossary_tags WHERE id=TAG2;
  IF v_cnt=0 AND v_tag=1 THEN RAISE NOTICE 'PASS: term DELETE CASCADE (link silindi, tag korundu)';
  ELSE RAISE EXCEPTION 'FAIL: term DELETE CASCADE beklenmeyen (link=%, tag=%)', v_cnt, v_tag; END IF;

  -- ══ NEGATİF: tags (12) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,'gc-ms');
    RAISE EXCEPTION 'FAIL: duplicate_normalized_tag kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate normalized tag reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,'inhalasyon');
    RAISE EXCEPTION 'FAIL: turkce_casefold_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: Turkce case-fold duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,'   GC-MS   ');
    RAISE EXCEPTION 'FAIL: whitespace_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: whitespace-normalized duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,'');
    RAISE EXCEPTION 'FAIL: empty_name_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty name_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,'   ');
    RAISE EXCEPTION 'FAIL: whitespace_name_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace name_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr,name_en) VALUES (T,'GecerliTag','');
    RAISE EXCEPTION 'FAIL: empty_name_en kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty name_en reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr,description_tr) VALUES (T,'GecerliTag2','   ');
    RAISE EXCEPTION 'FAIL: whitespace_description_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace description_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr,status) VALUES (T,'GecerliTag3','draft');
    RAISE EXCEPTION 'FAIL: invalid_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_tags (tenant_id,name_tr) VALUES (T,NULL);
    RAISE EXCEPTION 'FAIL: null_name_tr kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL name_tr reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_tags SET id='aa0000ff-cccc-cccc-cccc-cccccccccccc' WHERE id=TAG1;
    RAISE EXCEPTION 'FAIL: tag id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tag id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_tags SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE id=TAG1;
    RAISE EXCEPTION 'FAIL: tag tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tag tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_tags SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE id=TAG1;
    RAISE EXCEPTION 'FAIL: tag created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tag created_at UPDATE reddedildi'; END;

  -- ══ NEGATİF: junction (13) ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GTB,TAG1);
    RAISE EXCEPTION 'FAIL: cross_tenant_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,TAGB);
    RAISE EXCEPTION 'FAIL: cross_tenant_tag kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_tag reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,NOTERM,TAG1);
    RAISE EXCEPTION 'FAIL: nonexistent_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,NOTAG);
    RAISE EXCEPTION 'FAIL: nonexistent_tag kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_tag reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,TAG1);
    RAISE EXCEPTION 'FAIL: duplicate_junction kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate junction reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,NULL,TAG1);
    RAISE EXCEPTION 'FAIL: null_glossary_term_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL glossary_term_id reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_tags (tenant_id,glossary_term_id,tag_id) VALUES (T,GT1,NULL);
    RAISE EXCEPTION 'FAIL: null_tag_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL tag_id reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_tags SET id='ff0000ff-cccc-cccc-cccc-cccccccccccc' WHERE tenant_id=T AND glossary_term_id=GT1 AND tag_id=TAG1;
    RAISE EXCEPTION 'FAIL: junction id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_tags SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE tenant_id=T AND glossary_term_id=GT1 AND tag_id=TAG1;
    RAISE EXCEPTION 'FAIL: junction tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_tags SET glossary_term_id=GT2 WHERE tenant_id=T AND glossary_term_id=GT1 AND tag_id=TAG1;
    RAISE EXCEPTION 'FAIL: junction glossary_term_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction glossary_term_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_tags SET tag_id=TAG2 WHERE tenant_id=T AND glossary_term_id=GT2 AND tag_id=TAG1;
    RAISE EXCEPTION 'FAIL: junction tag_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction tag_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_tags SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE tenant_id=T AND glossary_term_id=GT1 AND tag_id=TAG1;
    RAISE EXCEPTION 'FAIL: junction created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction created_at UPDATE reddedildi'; END;

  BEGIN DELETE FROM public.aromatherapy_glossary_tags WHERE id=TAG1;
    RAISE EXCEPTION 'FAIL: tag DELETE (link var) kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: tag DELETE RESTRICT (link var)'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
