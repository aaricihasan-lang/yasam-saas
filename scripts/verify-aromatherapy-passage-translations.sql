-- ============================================================
-- verify-aromatherapy-passage-translations.sql
--
-- C2I doğrulama harness'i — public.aromatherapy_passage_translations
-- (migration: supabase/migrations/20260725000000_aromatherapy_passage_translations.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR (yazma yok).
--   Bölüm C tek transaction + ROLLBACK'tir (kalıcı yazma YOK). Harness migration'ı
--   KENDİSİ OLUŞTURMAZ; migration ile kurulmuş production tablosunu bekler.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASH SÖZLEŞMESİ (geliştirici notu — migration hash ÜRETMEZ):
--   * translation_hash service_role uygulama/API katmanında Node.js crypto ile üretilir.
--   * translation_hash = SHA-256( translated_text'in BİREBİR UTF-8 byte dizisi ) → 64 hex.
--   * Hash öncesi trim/lowercase/Unicode-normalize/whitespace-collapse/punct/line-ending/
--     dilsel-normalize/JSON YOK.
--   * source_passage_content_hash, parent passage.content_hash'e DÖRT-KOLON FK ile pinlenir
--     (tenant + passage + exact content_hash + exact original_lang; reference_only'ye çeviri yasak).
--   * DB yalnız formatı ('^[0-9a-f]{64}$') zorlar; içerik-karşılığı app sözleşmesidir.
-- ─────────────────────────────────────────────────────────────────────────────
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT 'parent_4col_candidate_key' AS check_name,
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid='public.aromatherapy_source_passages'::regclass
                   AND c.contype='u'
                   AND c.conname='aromatherapy_source_passages_tenant_id_content_lang_unique'
                   AND array_length(c.conkey,1)=4) AS passed
  UNION ALL
  SELECT 'table_exists',
         (to_regclass('public.aromatherapy_passage_translations') IS NOT NULL)
  UNION ALL
  SELECT 'column_count_22',
         (SELECT count(*) = 22 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='aromatherapy_passage_translations')
  UNION ALL
  SELECT 'col_provenance_jsonb',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_passage_translations' AND column_name='provenance' AND data_type='jsonb')
  UNION ALL
  SELECT 'col_revision_integer',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_passage_translations' AND column_name='revision' AND data_type='integer')
  UNION ALL
  SELECT 'col_reviewed_at_timestamptz',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_passage_translations' AND column_name='reviewed_at' AND data_type='timestamp with time zone')
  UNION ALL
  SELECT 'status_default_draft',
         (SELECT column_default LIKE '%draft%' FROM information_schema.columns
          WHERE table_name='aromatherapy_passage_translations' AND column_name='status')
  UNION ALL
  SELECT 'review_status_default_unreviewed',
         (SELECT column_default LIKE '%unreviewed%' FROM information_schema.columns
          WHERE table_name='aromatherapy_passage_translations' AND column_name='review_status')
  UNION ALL
  SELECT 'revision_default_1',
         (SELECT column_default = '1' FROM information_schema.columns
          WHERE table_name='aromatherapy_passage_translations' AND column_name='revision')
  UNION ALL
  SELECT 'method_source_fidelity_rights_no_default',
         (SELECT bool_and(column_default IS NULL) FROM information_schema.columns
          WHERE table_name='aromatherapy_passage_translations'
            AND column_name IN ('translation_method','translation_source','fidelity','translation_rights_status'))
  UNION ALL
  SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
           WHERE c.conrelid='public.aromatherapy_passage_translations'::regclass
             AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL
  SELECT 'candidate_key_tenant_id',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid='public.aromatherapy_passage_translations'::regclass
                   AND c.contype='u'
                   AND c.conname='aromatherapy_passage_translations_tenant_id_unique'
                   AND array_length(c.conkey,1)=2)
  UNION ALL
  SELECT 'fk_4col_restrict_to_passages',
         EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname='aromatherapy_passage_translations_passage_fk'
                   AND c.contype='f'
                   AND c.confrelid='public.aromatherapy_source_passages'::regclass
                   AND array_length(c.conkey,1)=4
                   AND c.confdeltype='r')
  UNION ALL
  SELECT 'fk_count_exactly_1',
         (SELECT count(*) = 1 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_passage_translations'::regclass AND c.contype='f')
  UNION ALL
  SELECT 'check_count_20',
         (SELECT count(*) = 20 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_passage_translations'::regclass AND c.contype='c')
  UNION ALL
  SELECT 'revision_unique_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                 AND indexname='aromatherapy_passage_translations_revision_uidx')
  UNION ALL
  SELECT 'verified_partial_unique_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                 AND indexname='aromatherapy_passage_translations_verified_uidx')
  UNION ALL
  SELECT 'verified_index_predicate_status',
         (SELECT indexdef ILIKE '%where (status = ''verified''%' FROM pg_indexes
          WHERE indexname='aromatherapy_passage_translations_verified_uidx')
  UNION ALL
  SELECT 'trigger_updated_at',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_passage_translations'::regclass
                   AND t.tgname='trg_aromatherapy_passage_translations_updated_at'
                   AND NOT t.tgisinternal)
  UNION ALL
  SELECT 'no_translation_parentage_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aromatherapy_passage_translations'
                       AND column_name IN ('source_translation_id','parent_translation_id',
                                           'translated_from_translation_id','supersedes_translation_id'))
)
SELECT check_name, passed FROM checks
UNION ALL
SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec AS (
  SELECT 'rls_enabled' AS check_name,
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_passage_translations'::regclass) AS passed
  UNION ALL
  SELECT 'force_rls_false',
         (SELECT relforcerowsecurity = false FROM pg_class WHERE oid='public.aromatherapy_passage_translations'::regclass)
  UNION ALL
  SELECT 'policy_count_zero',
         (SELECT count(*) = 0 FROM pg_policy WHERE polrelid='public.aromatherapy_passage_translations'::regclass)
  UNION ALL
  SELECT 'anon_no_dml',
         NOT (has_table_privilege('anon','public.aromatherapy_passage_translations','SELECT')
           OR has_table_privilege('anon','public.aromatherapy_passage_translations','INSERT')
           OR has_table_privilege('anon','public.aromatherapy_passage_translations','UPDATE')
           OR has_table_privilege('anon','public.aromatherapy_passage_translations','DELETE'))
  UNION ALL
  SELECT 'authenticated_no_dml',
         NOT (has_table_privilege('authenticated','public.aromatherapy_passage_translations','SELECT')
           OR has_table_privilege('authenticated','public.aromatherapy_passage_translations','INSERT')
           OR has_table_privilege('authenticated','public.aromatherapy_passage_translations','UPDATE')
           OR has_table_privilege('authenticated','public.aromatherapy_passage_translations','DELETE'))
  UNION ALL
  SELECT 'public_no_dml',
         NOT (has_table_privilege('public','public.aromatherapy_passage_translations','SELECT')
           OR has_table_privilege('public','public.aromatherapy_passage_translations','INSERT')
           OR has_table_privilege('public','public.aromatherapy_passage_translations','UPDATE')
           OR has_table_privilege('public','public.aromatherapy_passage_translations','DELETE'))
  UNION ALL
  SELECT 'service_role_has_dml',
         (has_table_privilege('service_role','public.aromatherapy_passage_translations','SELECT')
          AND has_table_privilege('service_role','public.aromatherapy_passage_translations','INSERT')
          AND has_table_privilege('service_role','public.aromatherapy_passage_translations','UPDATE')
          AND has_table_privilege('service_role','public.aromatherapy_passage_translations','DELETE'))
)
SELECT check_name, passed FROM sec
UNION ALL
SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
--   Not: Dashboard SQL Editor postgres/superuser rolüyle çalışır (RLS bypass); CHECK/FK/
--   coupling kısıtları rol-bağımsızdır. Seed: 1 kaynak + 1 excerpt passage (content_hash=
--   repeat('a',64), original_lang='zh-Hans') + 1 reference_only passage (content_hash NULL).
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status)
VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','book','C2I harness source','draft');

-- excerpt passage P1 (çevrilebilir): content_hash=repeat('a',64), original_lang='zh-Hans'.
INSERT INTO public.aromatherapy_source_passages
  (id, tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
VALUES ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111','s.1','zh-Hans','excerpt','原文', repeat('a',64),'public_domain');

-- reference_only passage P2 (çevrilemez): content_hash NULL.
INSERT INTO public.aromatherapy_source_passages
  (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
VALUES ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111','s.2','zh-Hans','reference_only','unknown');

DO $$
DECLARE
  v_old timestamptz;
  v_new timestamptz;
  P1  constant uuid := 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  P2  constant uuid := 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  T   constant uuid := '22222222-2222-2222-2222-222222222222';
  H   constant text := repeat('a',64);   -- P1'in content_hash'i
  TH  constant text := repeat('b',64);   -- geçerli translation_hash
BEGIN
  -- ══ POZİTİF ══
  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status)
  VALUES (T,P1,'zh-Hans','tr','çeviri',TH,H,'human','internal','faithful','public_domain');
  RAISE NOTICE 'PASS: gecerli human translation';

  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,provenance)
  VALUES (T,P1,'zh-Hans','en','translation',TH,H,'machine','internal','faithful','public_domain','{"model":"x"}'::jsonb);
  RAISE NOTICE 'PASS: machine translation + provenance object';

  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,revision)
  VALUES (T,P1,'zh-Hans','de','entwurf-1',TH,H,'human','internal','faithful','public_domain',1);
  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,revision)
  VALUES (T,P1,'zh-Hans','de','entwurf-2',TH,H,'human','internal','faithful','public_domain',2);
  RAISE NOTICE 'PASS: ayni passage/hedef-dil icin birden fazla draft (rev 1,2)';

  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,status)
  VALUES (T,P1,'zh-Hans','fr','archive',TH,H,'human','internal','faithful','public_domain','archived');
  RAISE NOTICE 'PASS: archived revision';

  INSERT INTO public.aromatherapy_passage_translations
    (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,status,review_status,reviewed_by,reviewed_at)
  VALUES (T,P1,'zh-Hans','it','verificato',TH,H,'human','internal','faithful','public_domain','verified','approved','editor',now());
  RAISE NOTICE 'PASS: verified translation + dogru review metadata';

  -- updated_at trigger: eski değere set et → UPDATE → now()'a çekilmeli.
  INSERT INTO public.aromatherapy_passage_translations
    (id,tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,
     translation_method,translation_source,fidelity,translation_rights_status,updated_at)
  VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',T,P1,'zh-Hans','es','texto',TH,H,'human','internal','faithful','public_domain',
          timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_passage_translations WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  UPDATE public.aromatherapy_passage_translations SET translated_text='texto-2' WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  SELECT updated_at INTO v_new FROM public.aromatherapy_passage_translations WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF v_new > v_old THEN RAISE NOTICE 'PASS: updated_at trigger UPDATE te guncellendi';
  ELSE RAISE EXCEPTION 'FAIL: updated_at degismedi (old=% new=%)', v_old, v_new; END IF;

  -- ══ NEGATİF (her biri kendi savepoint'inde) ══
  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'machine','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: machine+provenance_null kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: machine+provenance_null reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,provenance)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'machine','internal','faithful','public_domain','{}'::jsonb);
    RAISE EXCEPTION 'FAIL: machine+empty_provenance kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: machine+empty_provenance reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,provenance)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','[]'::jsonb);
    RAISE EXCEPTION 'FAIL: provenance_array kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: provenance_array reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','ZH-HANS','x',TH,H,'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: self_translation kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: self_translation (case-insensitive) reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','xa','x',TH, repeat('c',64),'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: wrong_content_hash kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: wrong_content_hash (4-kolon FK) reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'en','xb','x',TH,H,'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: wrong_source_lang kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: wrong_source_lang (4-kolon FK) reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P2,'zh-Hans','xc','x',TH,H,'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: reference_only_translation kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: reference_only_translation (4-kolon FK) reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x', repeat('A',64),H,'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: bad_translation_hash kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_translation_hash reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','xe','x',TH,'not_hex','human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: bad_source_hash kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_source_hash reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'translate','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: bad_method kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_method reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','random','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: bad_translation_source kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_translation_source reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','adaptive','public_domain');
    RAISE EXCEPTION 'FAIL: bad_fidelity kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_fidelity reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','fair_use');
    RAISE EXCEPTION 'FAIL: bad_rights kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_rights reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','published');
    RAISE EXCEPTION 'FAIL: bad_status kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_status reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,review_status)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','pending');
    RAISE EXCEPTION 'FAIL: bad_review_status kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_review_status reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,status,review_status,reviewed_by,reviewed_at)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','verified','in_review','editor',NULL);
    RAISE EXCEPTION 'FAIL: verified_without_approved kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified_without_approved reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,review_status,reviewed_by,reviewed_at)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','approved','editor',NULL);
    RAISE EXCEPTION 'FAIL: approved_without_reviewed_at kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: approved_without_reviewed_at reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,review_status,reviewed_by)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','unreviewed','editor');
    RAISE EXCEPTION 'FAIL: unreviewed_with_reviewer kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unreviewed_with_reviewer reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,translator_name)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','   ');
    RAISE EXCEPTION 'FAIL: whitespace_translator_name kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace_translator_name reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,review_status,reviewed_by,reviewed_at)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain','in_review','   ',NULL);
    RAISE EXCEPTION 'FAIL: whitespace_reviewed_by kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace_reviewed_by reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,revision)
    VALUES (T,P1,'zh-Hans','nl','x',TH,H,'human','internal','faithful','public_domain',0);
    RAISE EXCEPTION 'FAIL: revision_zero kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: revision_zero reddedildi'; END;

  BEGIN
    -- 'tr' rev1 pozitifte var → aynı (passage, lower(target_lang), revision) ikinci kez.
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,revision)
    VALUES (T,P1,'zh-Hans','TR','x',TH,H,'human','internal','faithful','public_domain',1);
    RAISE EXCEPTION 'FAIL: duplicate_revision kabul edildi';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate_revision (case-insensitive) reddedildi'; END;

  BEGIN
    -- 'it' rev1 verified pozitifte var → ikinci verified aynı (passage, lower(target_lang)).
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status,status,review_status,reviewed_by,reviewed_at,revision)
    VALUES (T,P1,'zh-Hans','it','x2',TH,H,'human','internal','faithful','public_domain','verified','approved','editor',now(),2);
    RAISE EXCEPTION 'FAIL: second_verified kabul edildi';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: second_verified reddedildi'; END;

  BEGIN
    INSERT INTO public.aromatherapy_passage_translations (tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status)
    VALUES ('99999999-9999-9999-9999-999999999999',P1,'zh-Hans','xd','x',TH,H,'human','internal','faithful','public_domain');
    RAISE EXCEPTION 'FAIL: cross_tenant_passage kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_passage reddedildi'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: her test için PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
