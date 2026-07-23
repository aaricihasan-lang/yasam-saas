-- ============================================================
-- verify-aromatherapy-glossary-categories.sql
--
-- C2M-A doğrulama harness'i — İKİ TABLO:
--   public.aromatherapy_glossary_categories + public.aromatherapy_glossary_term_categories
-- (migration: supabase/migrations/20260804000000_aromatherapy_glossary_categories.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Bölüm C parent glossary_terms seed'lerini
--   transaction içinde üretir; mevcut production verisine BAĞIMLI DEĞİLDİR.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur; iki tablo)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks(grp, check_name, passed) AS (
  -- ── categories ──
  SELECT 'cat','table_exists',
         (to_regclass('public.aromatherapy_glossary_categories') IS NOT NULL)
  UNION ALL SELECT 'cat','column_count_9',
         (SELECT count(*)=9 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories')
  UNION ALL SELECT 'cat','col_parent_category_id_uuid_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories' AND column_name='parent_category_id' AND data_type='uuid' AND is_nullable='YES')
  UNION ALL SELECT 'cat','col_name_tr_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories' AND column_name='name_tr' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'cat','col_name_en_text_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories' AND column_name='name_en' AND data_type='text' AND is_nullable='YES')
  UNION ALL SELECT 'cat','col_status_default_active',
         (SELECT column_default LIKE '%active%' FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories' AND column_name='status')
  UNION ALL SELECT 'cat','no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_categories'
                     AND column_name IN ('slug','canonical_key','icon','color','sort_order',
                                         'verification_status','verified_by','verified_at','revision','series_id'))
  UNION ALL SELECT 'cat','pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_categories'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'cat','tenant_id_unique_candidate',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_categories_tenant_id_unique' AND c.contype='u' AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'cat','self_parent_fk_2col_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_categories_parent_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_categories'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='r')
  UNION ALL SELECT 'cat','check_count_5',
         (SELECT count(*)=5 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_categories'::regclass AND c.contype='c')
  UNION ALL SELECT 'cat','sibling_unique_index_exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_categories_sibling_name_uidx')
  UNION ALL SELECT 'cat','sibling_index_nulls_not_distinct',
         COALESCE((SELECT indnullsnotdistinct FROM pg_index WHERE indexrelid='aromatherapy_glossary_categories_sibling_name_uidx'::regclass), false)
  UNION ALL SELECT 'cat','sibling_index_expression_and_columns',
         (SELECT indexdef LIKE '%tenant_id%' AND indexdef LIKE '%parent_category_id%' AND indexdef LIKE '%translate%' AND indexdef LIKE '%İIŞĞÇÖÜ%'
          FROM pg_indexes WHERE indexname='aromatherapy_glossary_categories_sibling_name_uidx')
  UNION ALL SELECT 'cat','identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_categories_identity_guard')
  UNION ALL SELECT 'cat','identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_categories'::regclass AND t.tgname='trg_aromatherapy_glossary_categories_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'cat','updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_categories'::regclass AND t.tgname='trg_aromatherapy_glossary_categories_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'cat','exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_categories'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'cat','trigger_order_identity_before_updated',
         ('trg_aromatherapy_glossary_categories_identity_guard' < 'trg_aromatherapy_glossary_categories_updated_at')
  UNION ALL SELECT 'cat','rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_categories'::regclass)

  -- ── term_categories (junction) ──
  UNION ALL SELECT 'tc','table_exists',
         (to_regclass('public.aromatherapy_glossary_term_categories') IS NOT NULL)
  UNION ALL SELECT 'tc','column_count_5',
         (SELECT count(*)=5 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_categories')
  UNION ALL SELECT 'tc','no_updated_at_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_categories' AND column_name='updated_at')
  UNION ALL SELECT 'tc','pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_term_categories'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'tc','natural_unique_3col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_categories_natural_key' AND c.contype='u' AND array_length(c.conkey,1)=3)
  UNION ALL SELECT 'tc','term_fk_2col_cascade',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_categories_term_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='c')
  UNION ALL SELECT 'tc','category_fk_2col_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_categories_category_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_categories'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='r')
  UNION ALL SELECT 'tc','fk_count_exactly_2',
         (SELECT count(*)=2 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_categories'::regclass AND c.contype='f')
  UNION ALL SELECT 'tc','reverse_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_categories_reverse_idx' AND indexdef LIKE '%(tenant_id, category_id)%')
  UNION ALL SELECT 'tc','identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_term_categories_identity_guard')
  UNION ALL SELECT 'tc','identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_categories'::regclass AND t.tgname='trg_aromatherapy_glossary_term_categories_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'tc','exactly_one_user_trigger',
         (SELECT count(*)=1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_categories'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'tc','rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_categories'::regclass)
  UNION ALL SELECT 'tc','glossary_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_terms_tenant_id_unique' AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'tc','category_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_categories_tenant_id_unique' AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_categories'::regclass AND array_length(c.conkey,1)=2)
)
SELECT grp, check_name, passed FROM checks
UNION ALL SELECT 'cat','A_CATEGORIES_OVERALL', bool_and(passed) FROM checks WHERE grp='cat'
UNION ALL SELECT 'tc','A_TERM_CATEGORIES_OVERALL', bool_and(passed) FROM checks WHERE grp='tc'
UNION ALL SELECT 'zz','A_OVERALL', bool_and(passed) FROM checks
ORDER BY grp, check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; iki tablo, tablo başına 11 kontrol)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec(grp, check_name, passed) AS (
  SELECT g.grp, s.check_name, s.passed
  FROM (VALUES
    ('cat','public.aromatherapy_glossary_categories'),
    ('tc','public.aromatherapy_glossary_term_categories')
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
UNION ALL SELECT 'cat','B_CATEGORIES_OVERALL', bool_and(passed) FROM sec WHERE grp='cat'
UNION ALL SELECT 'tc','B_TERM_CATEGORIES_OVERALL', bool_and(passed) FROM sec WHERE grp='tc'
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
  v_old timestamptz; v_new timestamptz; v_cnt integer; v_cat integer;
  T     constant uuid := '22222222-2222-2222-2222-222222222222';
  TB    constant uuid := '44444444-4444-4444-4444-444444444444';
  GT1   constant uuid := 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GT2   constant uuid := 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTDEL constant uuid := 'a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTB   constant uuid := 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  CROOT constant uuid := 'ca000001-cccc-cccc-cccc-cccccccccccc';  -- 'Kimya' root
  CCHILD constant uuid := 'ca000002-cccc-cccc-cccc-cccccccccccc'; -- 'Monoterpenler' under CROOT
  CSIB  constant uuid := 'ca000003-cccc-cccc-cccc-cccccccccccc';  -- 'Seskiterpenler' (rename/move/archive)
  COIK  constant uuid := 'ca000004-cccc-cccc-cccc-cccccccccccc';  -- 'Ortak' under CROOT
  COIK2 constant uuid := 'ca000005-cccc-cccc-cccc-cccccccccccc';  -- 'Ortak' under CCHILD (farklı parent → serbest)
  CTERM constant uuid := 'ca000006-cccc-cccc-cccc-cccccccccccc';  -- leaf w/ term link (category DELETE RESTRICT)
  CSELF constant uuid := 'ca000007-cccc-cccc-cccc-cccccccccccc';  -- self-parent testi
  CB    constant uuid := 'cb000001-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- tenant B root
  NOCAT constant uuid := '99999999-9999-9999-9999-999999999999';
  NOTERM constant uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
BEGIN
  -- tenant B root (cross-tenant testleri için)
  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (CB,TB,NULL,'B-Kok');

  -- ══ POZİTİF: categories ══
  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (CROOT,T,NULL,'Kimya');
  RAISE NOTICE 'PASS: root kategori';

  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (CCHILD,T,CROOT,'Monoterpenler');
  RAISE NOTICE 'PASS: child kategori';

  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr,updated_at)
    VALUES (CSIB,T,CROOT,'Seskiterpenler', timestamptz '2000-01-01 00:00:00+00');
  RAISE NOTICE 'PASS: ayni parent altinda farkli isimli sibling';

  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (COIK,T,CROOT,'Ortak');
  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (COIK2,T,CCHILD,'Ortak');
  RAISE NOTICE 'PASS: ayni normalize isim farkli parent altinda serbest';

  -- rename + updated_at bump (CSIB eski updated_at 2000'den)
  SELECT updated_at INTO v_old FROM public.aromatherapy_glossary_categories WHERE id=CSIB;
  UPDATE public.aromatherapy_glossary_categories SET name_tr='SeskiterpenlerYeni' WHERE id=CSIB;
  RAISE NOTICE 'PASS: kategori rename';
  SELECT updated_at INTO v_new FROM public.aromatherapy_glossary_categories WHERE id=CSIB;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: rename updated_at degismedi'; END IF;

  UPDATE public.aromatherapy_glossary_categories SET parent_category_id=CCHILD WHERE id=CSIB;
  RAISE NOTICE 'PASS: parent move';

  UPDATE public.aromatherapy_glossary_categories SET status='archived' WHERE id=CSIB;
  RAISE NOTICE 'PASS: status active->archived';

  UPDATE public.aromatherapy_glossary_categories SET tenant_id=tenant_id WHERE id=CROOT;
  RAISE NOTICE 'PASS: no-op category identity SET izinli';

  -- CTERM: leaf w/ term link (category DELETE RESTRICT testi için)
  INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (CTERM,T,NULL,'EtiketliLeaf');

  -- ══ POZİTİF: junction ══
  INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,CROOT);
  RAISE NOTICE 'PASS: gecerli term-category link';

  INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,CCHILD);
  RAISE NOTICE 'PASS: ayni term birden fazla kategori';

  INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT2,CROOT);
  RAISE NOTICE 'PASS: ayni kategori birden fazla term';

  INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT2,CTERM);

  UPDATE public.aromatherapy_glossary_term_categories SET category_id=category_id WHERE tenant_id=T AND glossary_term_id=GT1 AND category_id=CROOT;
  RAISE NOTICE 'PASS: no-op junction identity SET izinli';

  -- glossary term DELETE CASCADE: yalnız link silinir, kategori korunur.
  INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GTDEL,CSIB);
  DELETE FROM public.aromatherapy_glossary_terms WHERE id=GTDEL;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_glossary_term_categories WHERE glossary_term_id=GTDEL;
  SELECT count(*) INTO v_cat FROM public.aromatherapy_glossary_categories WHERE id=CSIB;
  IF v_cnt=0 AND v_cat=1 THEN RAISE NOTICE 'PASS: term DELETE CASCADE (link silindi, kategori korundu)';
  ELSE RAISE EXCEPTION 'FAIL: term DELETE CASCADE beklenmeyen (link=%, cat=%)', v_cnt, v_cat; END IF;

  -- ══ NEGATİF: categories ══
  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,CB,'X-cross');
    RAISE EXCEPTION 'FAIL: cross_tenant_parent kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_parent reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NOCAT,'X-noparent');
    RAISE EXCEPTION 'FAIL: nonexistent_parent kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_parent reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (id,tenant_id,parent_category_id,name_tr) VALUES (CSELF,T,CSELF,'X-self');
    RAISE EXCEPTION 'FAIL: self_parent kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: self_parent reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,'kimya');
    RAISE EXCEPTION 'FAIL: duplicate_root_name kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate normalized root name reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,CROOT,'monoterpenler');
    RAISE EXCEPTION 'FAIL: duplicate_sibling_name kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate normalized sibling name reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,'KİMYA');
    RAISE EXCEPTION 'FAIL: turkce_casefold_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: Turkce case-fold duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,'   Kimya   ');
    RAISE EXCEPTION 'FAIL: whitespace_duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: whitespace-normalized duplicate reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,'');
    RAISE EXCEPTION 'FAIL: empty_name_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty name_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,'   ');
    RAISE EXCEPTION 'FAIL: whitespace_name_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace name_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr,name_en) VALUES (T,NULL,'GecerliAd','');
    RAISE EXCEPTION 'FAIL: empty_name_en kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty name_en reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr,description_tr) VALUES (T,NULL,'GecerliAd2','   ');
    RAISE EXCEPTION 'FAIL: whitespace_description_tr kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace description_tr reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr,status) VALUES (T,NULL,'GecerliAd3','draft');
    RAISE EXCEPTION 'FAIL: invalid_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_categories (tenant_id,parent_category_id,name_tr) VALUES (T,NULL,NULL);
    RAISE EXCEPTION 'FAIL: null_name_tr kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL name_tr reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_categories SET id='ca0000ff-cccc-cccc-cccc-cccccccccccc' WHERE id=CROOT;
    RAISE EXCEPTION 'FAIL: category id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: category id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_categories SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE id=CROOT;
    RAISE EXCEPTION 'FAIL: category tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: category tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_categories SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE id=CROOT;
    RAISE EXCEPTION 'FAIL: category created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: category created_at UPDATE reddedildi'; END;

  BEGIN DELETE FROM public.aromatherapy_glossary_categories WHERE id=CROOT;
    RAISE EXCEPTION 'FAIL: parent category DELETE (child var) kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: parent category DELETE RESTRICT (child var)'; END;

  BEGIN DELETE FROM public.aromatherapy_glossary_categories WHERE id=CTERM;
    RAISE EXCEPTION 'FAIL: category DELETE (term link var) kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: category DELETE RESTRICT (term link var)'; END;

  -- ══ NEGATİF: junction ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GTB,CROOT);
    RAISE EXCEPTION 'FAIL: cross_tenant_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,CB);
    RAISE EXCEPTION 'FAIL: cross_tenant_category kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_category reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,NOTERM,CROOT);
    RAISE EXCEPTION 'FAIL: nonexistent_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,NOCAT);
    RAISE EXCEPTION 'FAIL: nonexistent_category kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_category reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,CROOT);
    RAISE EXCEPTION 'FAIL: duplicate_junction kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate junction reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,NULL,CROOT);
    RAISE EXCEPTION 'FAIL: null_glossary_term_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL glossary_term_id reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_categories (tenant_id,glossary_term_id,category_id) VALUES (T,GT1,NULL);
    RAISE EXCEPTION 'FAIL: null_category_id kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL category_id reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_categories SET id='cf0000ff-cccc-cccc-cccc-cccccccccccc' WHERE tenant_id=T AND glossary_term_id=GT1 AND category_id=CROOT;
    RAISE EXCEPTION 'FAIL: junction id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_categories SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE tenant_id=T AND glossary_term_id=GT1 AND category_id=CROOT;
    RAISE EXCEPTION 'FAIL: junction tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction tenant_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_categories SET glossary_term_id=GT2 WHERE tenant_id=T AND glossary_term_id=GT1 AND category_id=CROOT;
    RAISE EXCEPTION 'FAIL: junction glossary_term_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction glossary_term_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_categories SET category_id=CCHILD WHERE tenant_id=T AND glossary_term_id=GT2 AND category_id=CROOT;
    RAISE EXCEPTION 'FAIL: junction category_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction category_id UPDATE reddedildi'; END;

  BEGIN UPDATE public.aromatherapy_glossary_term_categories SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE tenant_id=T AND glossary_term_id=GT1 AND category_id=CROOT;
    RAISE EXCEPTION 'FAIL: junction created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: junction created_at UPDATE reddedildi'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
