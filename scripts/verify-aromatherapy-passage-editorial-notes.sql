-- ============================================================
-- verify-aromatherapy-passage-editorial-notes.sql
--
-- C2J doğrulama harness'i — iki tablo:
--   public.aromatherapy_passage_editorial_note_series  (seri kimliği; append-only)
--   public.aromatherapy_passage_editorial_notes         (revision metinleri)
-- (migration: supabase/migrations/20260726000000_aromatherapy_passage_editorial_notes.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Harness migration'ı KENDİSİ OLUŞTURMAZ;
--   migration ile kurulmuş production tablolarını bekler.
--
-- HASH SÖZLEŞMESİ (geliştirici notu): note_hash = SHA-256(note_text'in birebir UTF-8
--   byte dizisi) → 64 hex; service_role app/Node.js crypto üretir; ön-normalizasyon YOK;
--   migration yalnız '^[0-9a-f]{64}$' formatını zorlar.
-- SERİ APPEND-ONLY: seri tablosuna her UPDATE, no_update trigger'ı ile (SQLSTATE 23514)
--   reddedilir → Bölüm C'de check_violation olarak yakalanır.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  -- Tablolar
  SELECT 'series_table_exists' AS check_name,
         (to_regclass('public.aromatherapy_passage_editorial_note_series') IS NOT NULL) AS passed
  UNION ALL SELECT 'notes_table_exists',
         (to_regclass('public.aromatherapy_passage_editorial_notes') IS NOT NULL)
  -- Kolon sayıları
  UNION ALL SELECT 'series_column_count_8',
         (SELECT count(*)=8 FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_note_series')
  UNION ALL SELECT 'notes_column_count_15',
         (SELECT count(*)=15 FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_notes')
  -- Kritik tip/default
  UNION ALL SELECT 'series_translation_id_nullable',
         (SELECT is_nullable='YES' FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_note_series' AND column_name='translation_id')
  UNION ALL SELECT 'series_no_updated_at_column',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_note_series' AND column_name='updated_at')
  UNION ALL SELECT 'notes_revision_integer_default_1',
         (SELECT data_type='integer' AND column_default='1' FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_notes' AND column_name='revision')
  UNION ALL SELECT 'notes_status_default_draft',
         (SELECT column_default LIKE '%draft%' FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_notes' AND column_name='status')
  -- Revision'da kimlik kolonları BULUNMAMALI
  UNION ALL SELECT 'notes_no_identity_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_passage_editorial_notes'
                     AND column_name IN ('passage_id','translation_id','note_type','editorial_class','note_lang'))
  -- Yasak kolonlar (iki tablo)
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name IN ('aromatherapy_passage_editorial_note_series','aromatherapy_passage_editorial_notes')
                       AND column_name IN ('claim_id','glossary_term_id','parent_note_id','supersedes_note_id'))
  -- PK'ler
  UNION ALL SELECT 'series_pk_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_passage_editorial_note_series'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'notes_pk_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_passage_editorial_notes'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  -- Aday anahtarlar
  UNION ALL SELECT 'series_candidate_key',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_editorial_note_series_tenant_id_unique' AND c.contype='u' AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'notes_candidate_key',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_editorial_notes_tenant_id_unique' AND c.contype='u' AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'c2i_additive_candidate_key',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_translations_tenant_id_passage_unique'
                 AND c.contype='u' AND c.conrelid='public.aromatherapy_passage_translations'::regclass AND array_length(c.conkey,1)=3)
  -- FK'ler
  UNION ALL SELECT 'series_passage_fk_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_editorial_note_series_passage_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='r')
  UNION ALL SELECT 'series_translation_fk_restrict_3col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_editorial_note_series_translation_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_passage_translations'::regclass AND array_length(c.conkey,1)=3 AND c.confdeltype='r')
  UNION ALL SELECT 'notes_series_fk_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_passage_editorial_notes_series_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_passage_editorial_note_series'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='r')
  UNION ALL SELECT 'series_fk_count_2',
         (SELECT count(*)=2 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_passage_editorial_note_series'::regclass AND c.contype='f')
  UNION ALL SELECT 'notes_fk_count_1',
         (SELECT count(*)=1 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_passage_editorial_notes'::regclass AND c.contype='f')
  -- CHECK sayıları
  UNION ALL SELECT 'series_check_count_4',
         (SELECT count(*)=4 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_passage_editorial_note_series'::regclass AND c.contype='c')
  UNION ALL SELECT 'notes_check_count_12',
         (SELECT count(*)=12 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_passage_editorial_notes'::regclass AND c.contype='c')
  -- Index'ler
  UNION ALL SELECT 'series_list_idx',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_passage_editorial_note_series_list_idx')
  UNION ALL SELECT 'series_translation_partial_idx',
         (SELECT indexdef ILIKE '%where (translation_id is not null)%' FROM pg_indexes WHERE indexname='aromatherapy_passage_editorial_note_series_translation_idx')
  UNION ALL SELECT 'notes_series_revision_uidx',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_passage_editorial_notes_series_revision_uidx')
  UNION ALL SELECT 'notes_verified_partial_uidx',
         (SELECT indexdef ILIKE '%where (status = ''verified''%' FROM pg_indexes WHERE indexname='aromatherapy_passage_editorial_notes_verified_uidx')
  -- Trigger'lar
  UNION ALL SELECT 'notes_updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_passage_editorial_notes'::regclass
                 AND t.tgname='trg_aromatherapy_passage_editorial_notes_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'series_no_update_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_passage_editorial_note_series'::regclass
                 AND t.tgname='trg_aromatherapy_note_series_no_update' AND NOT t.tgisinternal)
  UNION ALL SELECT 'series_no_update_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_note_series_no_update')
  UNION ALL SELECT 'series_only_one_user_trigger',
         (SELECT count(*)=1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_passage_editorial_note_series'::regclass AND NOT t.tgisinternal)
)
SELECT check_name, passed FROM checks
UNION ALL
SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; her iki tablo)
-- ═════════════════════════════════════════════════════════════════════════════
WITH tbls(t) AS (VALUES ('public.aromatherapy_passage_editorial_note_series'),
                        ('public.aromatherapy_passage_editorial_notes')),
sec AS (
  SELECT t||' :rls_enabled' AS check_name, (SELECT relrowsecurity FROM pg_class WHERE oid=t::regclass) AS passed FROM tbls
  UNION ALL SELECT t||' :force_rls_false', (SELECT relforcerowsecurity=false FROM pg_class WHERE oid=t::regclass) FROM tbls
  UNION ALL SELECT t||' :policy_count_zero', (SELECT count(*)=0 FROM pg_policy WHERE polrelid=t::regclass) FROM tbls
  UNION ALL SELECT t||' :anon_no_dml',
         NOT (has_table_privilege('anon',t,'SELECT') OR has_table_privilege('anon',t,'INSERT')
           OR has_table_privilege('anon',t,'UPDATE') OR has_table_privilege('anon',t,'DELETE')) FROM tbls
  UNION ALL SELECT t||' :authenticated_no_dml',
         NOT (has_table_privilege('authenticated',t,'SELECT') OR has_table_privilege('authenticated',t,'INSERT')
           OR has_table_privilege('authenticated',t,'UPDATE') OR has_table_privilege('authenticated',t,'DELETE')) FROM tbls
  UNION ALL SELECT t||' :public_no_dml',
         NOT (has_table_privilege('public',t,'SELECT') OR has_table_privilege('public',t,'INSERT')
           OR has_table_privilege('public',t,'UPDATE') OR has_table_privilege('public',t,'DELETE')) FROM tbls
  UNION ALL SELECT t||' :service_role_has_dml',
         (has_table_privilege('service_role',t,'SELECT') AND has_table_privilege('service_role',t,'INSERT')
          AND has_table_privilege('service_role',t,'UPDATE') AND has_table_privilege('service_role',t,'DELETE')) FROM tbls
)
SELECT check_name, passed FROM sec
UNION ALL SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Seed: tenant A kaynak + P1(excerpt) + P2(reference_only) + P3(excerpt) + TR1(P1) + TR2(P3);
--       tenant B kaynak + PB(excerpt) + TRB(PB).
INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status) VALUES
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','book','C2J src A','draft'),
  ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444','book','C2J src B','draft');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status) VALUES
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.1','zh-Hans','excerpt','x1', repeat('a',64),'public_domain'),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.3','zh-Hans','excerpt','x3', repeat('c',64),'public_domain'),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666','s.b','zh-Hans','excerpt','xb', repeat('e',64),'public_domain');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status) VALUES
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.2','zh-Hans','reference_only','unknown');
INSERT INTO public.aromatherapy_passage_translations (id,tenant_id,passage_id,source_lang,target_lang,translated_text,translation_hash,source_passage_content_hash,translation_method,translation_source,fidelity,translation_rights_status) VALUES
  ('ddddddd1-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222','aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa','zh-Hans','tr','t1', repeat('f',64), repeat('a',64),'human','internal','faithful','public_domain'),
  ('ddddddd2-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222','aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaaa','zh-Hans','tr','t2', repeat('g',64), repeat('c',64),'human','internal','faithful','public_domain'),
  ('eeeeeee1-eeee-eeee-eeee-eeeeeeeeeeee','44444444-4444-4444-4444-444444444444','bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','zh-Hans','tr','tb', repeat('h',64), repeat('e',64),'human','internal','faithful','public_domain');

DO $$
DECLARE
  v_old timestamptz; v_new timestamptz;
  T   constant uuid := '22222222-2222-2222-2222-222222222222';
  TB  constant uuid := '44444444-4444-4444-4444-444444444444';
  P1  constant uuid := 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- excerpt
  P2  constant uuid := 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- reference_only
  TR1 constant uuid := 'ddddddd1-dddd-dddd-dddd-dddddddddddd';  -- P1 çevirisi
  TR2 constant uuid := 'ddddddd2-dddd-dddd-dddd-dddddddddddd';  -- P3 çevirisi (cross-passage)
  TRB constant uuid := 'eeeeeee1-eeee-eeee-eeee-eeeeeeeeeeee';  -- tenant B çevirisi
  S1  constant uuid := '51111111-5111-5111-5111-511111111111';
  S1b constant uuid := '52222222-5222-5222-5222-522222222222';
  S2  constant uuid := '53333333-5333-5333-5333-533333333333';
  S3  constant uuid := '54444444-5444-5444-5444-544444444444';
  S4  constant uuid := '55555555-5555-5555-5555-555555555555';
  NH  constant text := repeat('a',64);
BEGIN
  -- ══ POZİTİF: seriler ══
  INSERT INTO public.aromatherapy_passage_editorial_note_series (id,tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (S1,T,P1,NULL,'context','editorial_explanation','tr');
  RAISE NOTICE 'PASS: excerpt serisi';
  INSERT INTO public.aromatherapy_passage_editorial_note_series (id,tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (S2,T,P2,NULL,'summary','editorial_explanation','tr');
  RAISE NOTICE 'PASS: reference_only serisi (translation_id NULL)';
  INSERT INTO public.aromatherapy_passage_editorial_note_series (id,tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (S3,T,P1,TR1,'terminology','editorial_explanation','tr');
  RAISE NOTICE 'PASS: translation-linked serisi';
  INSERT INTO public.aromatherapy_passage_editorial_note_series (id,tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (S1b,T,P1,NULL,'context','editorial_explanation','tr');
  RAISE NOTICE 'PASS: ayni passage/type/lang icin iki bagimsiz seri';

  -- ══ POZİTİF: revision'lar ══
  INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,1,'metin r1',NH,'human');
  INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,2,'metin r2',NH,'human');
  RAISE NOTICE 'PASS: ayni seri revision 1 + 2';
  INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,provenance)
    VALUES (T,S1b,1,'machine',NH,'machine','{"model":"x"}'::jsonb);
  RAISE NOTICE 'PASS: machine revision + provenance';
  INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,status,review_status,reviewed_by,reviewed_at)
    VALUES (T,S3,1,'verified',NH,'human','verified','approved','editor',now());
  RAISE NOTICE 'PASS: verified revision + review metadata';

  -- updated_at trigger (revision tablosu)
  INSERT INTO public.aromatherapy_passage_editorial_note_series (id,tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (S4,T,P1,NULL,'plain_language','editorial_explanation','tr');
  INSERT INTO public.aromatherapy_passage_editorial_notes (id,tenant_id,note_series_id,revision,note_text,note_hash,creation_method,updated_at)
    VALUES ('ccccccc1-cccc-cccc-cccc-cccccccccccc',T,S4,1,'u',NH,'human', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_passage_editorial_notes WHERE id='ccccccc1-cccc-cccc-cccc-cccccccccccc';
  UPDATE public.aromatherapy_passage_editorial_notes SET note_text='u2' WHERE id='ccccccc1-cccc-cccc-cccc-cccccccccccc';
  SELECT updated_at INTO v_new FROM public.aromatherapy_passage_editorial_notes WHERE id='ccccccc1-cccc-cccc-cccc-cccccccccccc';
  IF v_new > v_old THEN RAISE NOTICE 'PASS: revision updated_at trigger';
  ELSE RAISE EXCEPTION 'FAIL: updated_at degismedi'; END IF;

  -- ══ NEGATİF: seri FK / coupling / allowlist ══
  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,TR2,'context','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: cross_passage_translation kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_passage_translation reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P2,TR1,'context','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: reference_only_with_translation kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: reference_only + non-null translation reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,TRB,'context','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: cross_tenant_translation kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_translation reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES ('99999999-9999-9999-9999-999999999999',P1,NULL,'context','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: cross_tenant_passage kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_passage reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,NULL,'invalid','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: bad_note_type kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_note_type reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,NULL,'context','invalid','tr');
    RAISE EXCEPTION 'FAIL: bad_editorial_class kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_editorial_class reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,NULL,'summary','editorial_interpretation','tr');
    RAISE EXCEPTION 'FAIL: coupling summary/interpretation kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: coupling summary→interpretation reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,NULL,'expert_commentary','editorial_explanation','tr');
    RAISE EXCEPTION 'FAIL: coupling expert/explanation kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: coupling expert_commentary→explanation reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_note_series (tenant_id,passage_id,translation_id,note_type,editorial_class,note_lang)
    VALUES (T,P1,NULL,'context','editorial_explanation','tr TR');
    RAISE EXCEPTION 'FAIL: bad_note_lang kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_note_lang reddedildi'; END;

  -- ══ SERİ IMMUTABILITY: her UPDATE reddedilmeli (trigger, SQLSTATE 23514) ══
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET passage_id=P2 WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series passage_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series passage_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET translation_id=TR1 WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series translation_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series translation_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET note_type='summary' WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series note_type UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series note_type UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET editorial_class='editorial_interpretation' WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series editorial_class UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series editorial_class UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET note_lang='en' WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series note_lang UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series note_lang UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_passage_editorial_note_series SET created_at=now() WHERE id=S1;
    RAISE EXCEPTION 'FAIL: series created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: series created_at UPDATE reddedildi (append-only)'; END;

  -- ══ NEGATİF: revision CHECK / unique ══
  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,90,'   ',NH,'human');
    RAISE EXCEPTION 'FAIL: empty_note_text kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: empty_note_text reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,91,'x','not_hex','human');
    RAISE EXCEPTION 'FAIL: bad_note_hash kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_note_hash reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,92,'x',NH,'translate');
    RAISE EXCEPTION 'FAIL: bad_creation_method kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_creation_method reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,93,'x',NH,'machine');
    RAISE EXCEPTION 'FAIL: machine_provenance_null kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: machine_provenance_null reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,provenance)
    VALUES (T,S1,94,'x',NH,'machine','{}'::jsonb);
    RAISE EXCEPTION 'FAIL: machine_empty_provenance kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: machine_empty_provenance reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,provenance)
    VALUES (T,S1,95,'x',NH,'human','[]'::jsonb);
    RAISE EXCEPTION 'FAIL: provenance_array kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: provenance_array reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,author_name)
    VALUES (T,S1,96,'x',NH,'human','   ');
    RAISE EXCEPTION 'FAIL: whitespace_author_name kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace_author_name reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,status)
    VALUES (T,S1,97,'x',NH,'human','published');
    RAISE EXCEPTION 'FAIL: bad_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,review_status)
    VALUES (T,S1,98,'x',NH,'human','pending');
    RAISE EXCEPTION 'FAIL: bad_review_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_review_status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,status,review_status,reviewed_by,reviewed_at)
    VALUES (T,S1,99,'x',NH,'human','verified','in_review','editor',NULL);
    RAISE EXCEPTION 'FAIL: verified_without_approved kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified_without_approved reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,review_status,reviewed_by,reviewed_at)
    VALUES (T,S1,100,'x',NH,'human','approved','editor',NULL);
    RAISE EXCEPTION 'FAIL: approved_without_reviewed_at kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: approved_without_reviewed_at reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,review_status,reviewed_by)
    VALUES (T,S1,101,'x',NH,'human','unreviewed','editor');
    RAISE EXCEPTION 'FAIL: unreviewed_with_reviewer kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unreviewed_with_reviewer reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,review_status,reviewed_by,reviewed_at)
    VALUES (T,S1,102,'x',NH,'human','in_review','   ',NULL);
    RAISE EXCEPTION 'FAIL: whitespace_reviewed_by kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace_reviewed_by reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,0,'x',NH,'human');
    RAISE EXCEPTION 'FAIL: revision_zero kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: revision_zero reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES (T,S1,1,'dup',NH,'human');
    RAISE EXCEPTION 'FAIL: duplicate_series_revision kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate_series_revision reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method,status,review_status,reviewed_by,reviewed_at)
    VALUES (T,S3,2,'v2',NH,'human','verified','approved','editor',now());
    RAISE EXCEPTION 'FAIL: second_verified kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: second_verified reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_passage_editorial_notes (tenant_id,note_series_id,revision,note_text,note_hash,creation_method)
    VALUES ('99999999-9999-9999-9999-999999999999',S1,1,'x',NH,'human');
    RAISE EXCEPTION 'FAIL: cross_tenant_series kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_series reddedildi'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
