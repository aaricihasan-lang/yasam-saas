-- ============================================================
-- verify-aromatherapy-glossary-term-passages.sql
--
-- C2K doğrulama harness'i — public.aromatherapy_glossary_term_passages
-- (migration: supabase/migrations/20260802000000_aromatherapy_glossary_term_passages.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Harness migration'ı KENDİSİ OLUŞTURMAZ;
--   migration ile kurulmuş production tablosunu bekler.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT 'table_exists' AS check_name,
         (to_regclass('public.aromatherapy_glossary_term_passages') IS NOT NULL) AS passed
  UNION ALL SELECT 'column_count_11',
         (SELECT count(*)=11 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages')
  UNION ALL SELECT 'col_passage_kind_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages' AND column_name='passage_kind' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_verification_status_default_unverified',
         (SELECT column_default LIKE '%unverified%' FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages' AND column_name='verification_status')
  UNION ALL SELECT 'col_verified_by_nullable',
         (SELECT is_nullable='YES' FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages' AND column_name='verified_by')
  UNION ALL SELECT 'col_verified_at_timestamptz_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages' AND column_name='verified_at' AND data_type='timestamp with time zone' AND is_nullable='YES')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_glossary_term_passages'
                     AND column_name IN ('translation_id','matched_term_text','source_lang','notes','creation_method','provenance','status'))
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_glossary_term_passages'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'natural_unique_4col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_passages_natural_key' AND c.contype='u' AND array_length(c.conkey,1)=4)
  UNION ALL SELECT 'glossary_additive_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_terms_tenant_id_unique'
                 AND c.contype='u' AND c.conrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'passages_additive_unique_3col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_source_passages_tenant_id_kind_unique'
                 AND c.contype='u' AND c.conrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=3)
  UNION ALL SELECT 'glossary_fk_2col_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_passages_glossary_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_glossary_terms'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='r')
  UNION ALL SELECT 'passage_fk_3col_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_glossary_term_passages_passage_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=3 AND c.confdeltype='r')
  UNION ALL SELECT 'fk_count_exactly_2',
         (SELECT count(*)=2 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_passages'::regclass AND c.contype='f')
  UNION ALL SELECT 'check_count_4',
         (SELECT count(*)=4 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_glossary_term_passages'::regclass AND c.contype='c')
  UNION ALL SELECT 'reverse_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_glossary_term_passages_reverse_idx')
  UNION ALL SELECT 'identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_glossary_term_passages_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_passages'::regclass
                 AND t.tgname='trg_aromatherapy_glossary_term_passages_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_passages'::regclass
                 AND t.tgname='trg_aromatherapy_glossary_term_passages_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_glossary_term_passages'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'trigger_order_identity_before_updated',
         ('trg_aromatherapy_glossary_term_passages_identity_guard' < 'trg_aromatherapy_glossary_term_passages_updated_at')
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_passages'::regclass)
)
SELECT check_name, passed FROM checks
UNION ALL
SELECT 'A_OVERALL', bool_and(passed) FROM checks
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM B — GÜVENLİK DOĞRULAMA (salt-okunur; yalnız junction)
--   service_role: yalnız SELECT/INSERT/UPDATE/DELETE; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN YOK.
-- ═════════════════════════════════════════════════════════════════════════════
WITH sec AS (
  SELECT 'rls_enabled' AS check_name,
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_glossary_term_passages'::regclass) AS passed
  UNION ALL SELECT 'force_rls_false',
         (SELECT relforcerowsecurity=false FROM pg_class WHERE oid='public.aromatherapy_glossary_term_passages'::regclass)
  UNION ALL SELECT 'policy_count_zero',
         (SELECT count(*)=0 FROM pg_policy WHERE polrelid='public.aromatherapy_glossary_term_passages'::regclass)
  UNION ALL SELECT 'anon_no_dml',
         NOT (has_table_privilege('anon','public.aromatherapy_glossary_term_passages','SELECT')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_passages','INSERT')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_passages','UPDATE')
           OR has_table_privilege('anon','public.aromatherapy_glossary_term_passages','DELETE'))
  UNION ALL SELECT 'authenticated_no_dml',
         NOT (has_table_privilege('authenticated','public.aromatherapy_glossary_term_passages','SELECT')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_passages','INSERT')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_passages','UPDATE')
           OR has_table_privilege('authenticated','public.aromatherapy_glossary_term_passages','DELETE'))
  UNION ALL SELECT 'public_no_dml',
         NOT (has_table_privilege('public','public.aromatherapy_glossary_term_passages','SELECT')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_passages','INSERT')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_passages','UPDATE')
           OR has_table_privilege('public','public.aromatherapy_glossary_term_passages','DELETE'))
  UNION ALL SELECT 'service_role_has_dml',
         (has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','SELECT')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','INSERT')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','UPDATE')
          AND has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','DELETE'))
  UNION ALL SELECT 'service_role_no_truncate',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','TRUNCATE')
  UNION ALL SELECT 'service_role_no_references',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','REFERENCES')
  UNION ALL SELECT 'service_role_no_trigger',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','TRIGGER')
  UNION ALL SELECT 'service_role_no_maintain',
         NOT has_table_privilege('service_role','public.aromatherapy_glossary_term_passages','MAINTAIN')
)
SELECT check_name, passed FROM sec
UNION ALL SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Seed: tenant A kaynak + terimler (GT1,GT2) + passage'lar (excerpt/full_text/reference_only);
--       tenant B kaynak + terim (GTB) + passage (excerpt) — cross-tenant testleri için.
INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status) VALUES
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','book','C2K src A','draft'),
  ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444','book','C2K src B','draft');
INSERT INTO public.aromatherapy_glossary_terms (id, tenant_id, canonical_term_tr, short_definition_tr) VALUES
  ('a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','terim1','tanim1'),
  ('a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','terim2','tanim2'),
  ('a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','terimb','tanimb');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status) VALUES
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.1','tr','excerpt','ex', repeat('a',64),'public_domain'),
  ('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.2','tr','full_text','full', repeat('b',64),'public_domain'),
  ('bbbbbbb4-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666','s.b','tr','excerpt','exb', repeat('c',64),'public_domain');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status) VALUES
  ('bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','s.3','tr','reference_only','unknown');

DO $$
DECLARE
  v_old timestamptz; v_new timestamptz;
  T    constant uuid := '22222222-2222-2222-2222-222222222222';
  GT1  constant uuid := 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GT2  constant uuid := 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GTB  constant uuid := 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- tenant B terimi
  PEX  constant uuid := 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- excerpt
  PFU  constant uuid := 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- full_text
  PRF  constant uuid := 'bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- reference_only
  PEXB constant uuid := 'bbbbbbb4-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- tenant B excerpt
  L1   constant uuid := 'c1111111-cccc-cccc-cccc-cccccccccccc';
  LUP  constant uuid := 'c6666666-cccc-cccc-cccc-cccccccccccc';  -- updated_at (verification) testi
  LNO  constant uuid := 'c7777777-cccc-cccc-cccc-cccccccccccc';  -- no-op identity testi
BEGIN
  -- ══ POZİTİF ══
  INSERT INTO public.aromatherapy_glossary_term_passages (id,tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (L1,T,GT1,PEX,'excerpt','defines');
  RAISE NOTICE 'PASS: excerpt + defines';

  INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PFU,'full_text','context');
  RAISE NOTICE 'PASS: full_text + context';

  INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PEX,'excerpt','mentions');
  RAISE NOTICE 'PASS: ayni term/passage farkli relation_type';

  INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PRF,'reference_only','bibliographic_reference');
  RAISE NOTICE 'PASS: reference_only + bibliographic_reference';

  RAISE NOTICE 'PASS: unverified link (default)';

  INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_by,verified_at)
    VALUES (T,GT2,PEX,'excerpt','defines','verified','editor',now());
  RAISE NOTICE 'PASS: verified + verified_by + verified_at';

  -- unverified → verified UPDATE izinli; updated_at (eski değerden) bump.
  INSERT INTO public.aromatherapy_glossary_term_passages (id,tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,updated_at)
    VALUES (LUP,T,GT2,PFU,'full_text','mentions', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_glossary_term_passages WHERE id=LUP;
  UPDATE public.aromatherapy_glossary_term_passages SET verification_status='verified', verified_by='editor', verified_at=now() WHERE id=LUP;
  SELECT updated_at INTO v_new FROM public.aromatherapy_glossary_term_passages WHERE id=LUP;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: unverified→verified UPDATE + updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: verification UPDATE updated_at degismedi'; END IF;

  -- no-op identity SET izinli; updated_at yine bump.
  INSERT INTO public.aromatherapy_glossary_term_passages (id,tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,updated_at)
    VALUES (LNO,T,GT2,PRF,'reference_only','bibliographic_reference', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_glossary_term_passages WHERE id=LNO;
  UPDATE public.aromatherapy_glossary_term_passages SET glossary_term_id=glossary_term_id WHERE id=LNO;
  SELECT updated_at INTO v_new FROM public.aromatherapy_glossary_term_passages WHERE id=LNO;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: no-op identity SET izinli + updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: no-op UPDATE updated_at degismedi'; END IF;

  -- ══ NEGATİF: FK ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GTB,PEX,'excerpt','defines');
    RAISE EXCEPTION 'FAIL: cross_tenant_glossary_term kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_glossary_term reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PEXB,'excerpt','defines');
    RAISE EXCEPTION 'FAIL: cross_tenant_passage kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_passage reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT2,PEX,'full_text','supports_definition');
    RAISE EXCEPTION 'FAIL: passage_kind_snapshot_mismatch kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: passage_kind_snapshot_mismatch reddedildi'; END;

  -- ══ NEGATİF: allowlist / coupling ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PEX,'excerpt','invalid_role');
    RAISE EXCEPTION 'FAIL: bad_relation_type kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_relation_type reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status)
    VALUES (T,GT1,PEX,'excerpt','usage_example','pending');
    RAISE EXCEPTION 'FAIL: bad_verification_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_verification_status reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PRF,'reference_only','defines');
    RAISE EXCEPTION 'FAIL: reference_only+defines kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reference_only+defines reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PRF,'reference_only','mentions');
    RAISE EXCEPTION 'FAIL: reference_only+mentions kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reference_only+mentions reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT2,PEX,'excerpt','bibliographic_reference');
    RAISE EXCEPTION 'FAIL: excerpt+bibliographic_reference kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: excerpt+bibliographic_reference reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT2,PFU,'full_text','bibliographic_reference');
    RAISE EXCEPTION 'FAIL: full_text+bibliographic_reference kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: full_text+bibliographic_reference reddedildi'; END;

  -- ══ NEGATİF: verification coupling ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_by,verified_at)
    VALUES (T,GT2,PFU,'full_text','context','verified',NULL,now());
    RAISE EXCEPTION 'FAIL: verified_by_null kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_by_null reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_by,verified_at)
    VALUES (T,GT2,PFU,'full_text','context','verified','   ',now());
    RAISE EXCEPTION 'FAIL: verified_by_whitespace kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_by_whitespace reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_by,verified_at)
    VALUES (T,GT2,PFU,'full_text','context','verified','editor',NULL);
    RAISE EXCEPTION 'FAIL: verified_at_null kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_at_null reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_by)
    VALUES (T,GT2,PFU,'full_text','context','unverified','editor');
    RAISE EXCEPTION 'FAIL: unverified_with_verified_by kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unverified+verified_by reddedildi'; END;

  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type,verification_status,verified_at)
    VALUES (T,GT2,PFU,'full_text','context','unverified',now());
    RAISE EXCEPTION 'FAIL: unverified_with_verified_at kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unverified+verified_at reddedildi'; END;

  -- ══ NEGATİF: duplicate doğal anahtar ══
  BEGIN INSERT INTO public.aromatherapy_glossary_term_passages (tenant_id,glossary_term_id,passage_id,passage_kind,relation_type)
    VALUES (T,GT1,PEX,'excerpt','defines');
    RAISE EXCEPTION 'FAIL: duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate (term,passage,relation_type) reddedildi'; END;

  -- ══ NEGATİF: identity immutability (SQLSTATE 23514 = check_violation) ══
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET glossary_term_id=GT2 WHERE id=L1;
    RAISE EXCEPTION 'FAIL: glossary_term_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: glossary_term_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET passage_id=PFU WHERE id=L1;
    RAISE EXCEPTION 'FAIL: passage_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: passage_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET passage_kind='full_text' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: passage_kind UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: passage_kind UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET relation_type='mentions' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: relation_type UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: relation_type UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET tenant_id='99999999-9999-9999-9999-999999999999' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tenant_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_glossary_term_passages SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: created_at UPDATE reddedildi'; END;

  -- ══ NEGATİF: parent DELETE RESTRICT ══
  BEGIN DELETE FROM public.aromatherapy_glossary_terms WHERE id=GT1;
    RAISE EXCEPTION 'FAIL: glossary parent DELETE kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: glossary parent DELETE RESTRICT'; END;
  BEGIN DELETE FROM public.aromatherapy_source_passages WHERE id=PEX;
    RAISE EXCEPTION 'FAIL: passage parent DELETE kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: passage parent DELETE RESTRICT'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
