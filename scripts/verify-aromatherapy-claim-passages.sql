-- ============================================================
-- verify-aromatherapy-claim-passages.sql
--
-- C2L doğrulama harness'i — public.aromatherapy_claim_passages
-- (migration: supabase/migrations/20260803000000_aromatherapy_claim_passages.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Bölüm A/B SALT-OKUNURDUR. Bölüm C tek
--   BEGIN…ROLLBACK'tir (kalıcı yazma YOK). Harness migration'ı KENDİSİ OLUŞTURMAZ;
--   migration ile kurulmuş production tablosunu bekler. Bölüm C gerekli tüm parent seed
--   zincirini (plant_taxa→preparations→claims, sources→source_passages) transaction
--   içinde üretir; mevcut production verisine BAĞIMLI DEĞİLDİR.
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT 'table_exists' AS check_name,
         (to_regclass('public.aromatherapy_claim_passages') IS NOT NULL) AS passed
  UNION ALL SELECT 'column_count_11',
         (SELECT count(*)=11 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages')
  UNION ALL SELECT 'col_claim_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='claim_id' AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'col_passage_id_uuid_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='passage_id' AND data_type='uuid' AND is_nullable='NO')
  UNION ALL SELECT 'col_passage_kind_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='passage_kind' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_evidence_relation_text_notnull',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='evidence_relation' AND data_type='text' AND is_nullable='NO')
  UNION ALL SELECT 'col_verification_status_default_unverified',
         (SELECT column_default LIKE '%unverified%' FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='verification_status')
  UNION ALL SELECT 'col_verified_by_nullable',
         (SELECT is_nullable='YES' FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='verified_by')
  UNION ALL SELECT 'col_verified_at_timestamptz_nullable',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages' AND column_name='verified_at' AND data_type='timestamp with time zone' AND is_nullable='YES')
  UNION ALL SELECT 'no_forbidden_columns',
         NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_claim_passages'
                     AND column_name IN ('source_id','claim_source_id','translation_id','editorial_note_id',
                                         'locator_text','source_original_excerpt','faithful_translation','source_role',
                                         'evidence_layer','strength_score','notes','status','revision','series_id'))
  UNION ALL SELECT 'pk_is_id',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.aromatherapy_claim_passages'::regclass AND c.contype='p' AND a.attname='id' AND array_length(c.conkey,1)=1)
  UNION ALL SELECT 'natural_unique_4col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_claim_passages_natural_key' AND c.contype='u' AND array_length(c.conkey,1)=4)
  UNION ALL SELECT 'claim_fk_2col_cascade',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_claim_passages_claim_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_claims'::regclass AND array_length(c.conkey,1)=2 AND c.confdeltype='c')
  UNION ALL SELECT 'passage_fk_3col_restrict',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_claim_passages_passage_fk'
                 AND c.contype='f' AND c.confrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=3 AND c.confdeltype='r')
  UNION ALL SELECT 'fk_count_exactly_2',
         (SELECT count(*)=2 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_claim_passages'::regclass AND c.contype='f')
  UNION ALL SELECT 'check_count_4',
         (SELECT count(*)=4 FROM pg_constraint c WHERE c.conrelid='public.aromatherapy_claim_passages'::regclass AND c.contype='c')
  UNION ALL SELECT 'claims_parent_tenant_id_unique',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_claims_tenant_id_unique'
                 AND c.contype='u' AND c.conrelid='public.aromatherapy_claims'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL SELECT 'passages_parent_kind_unique_3col',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_source_passages_tenant_id_kind_unique'
                 AND c.contype='u' AND c.conrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=3)
  UNION ALL SELECT 'reverse_index',
         EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='aromatherapy_claim_passages_reverse_idx'
                 AND indexdef LIKE '%(tenant_id, passage_id)%')
  UNION ALL SELECT 'identity_guard_function',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='aromatherapy_claim_passages_identity_guard')
  UNION ALL SELECT 'identity_guard_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_claim_passages'::regclass
                 AND t.tgname='trg_aromatherapy_claim_passages_identity_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'updated_at_trigger',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_claim_passages'::regclass
                 AND t.tgname='trg_aromatherapy_claim_passages_updated_at' AND NOT t.tgisinternal)
  UNION ALL SELECT 'exactly_two_user_triggers',
         (SELECT count(*)=2 FROM pg_trigger t WHERE t.tgrelid='public.aromatherapy_claim_passages'::regclass AND NOT t.tgisinternal)
  UNION ALL SELECT 'trigger_order_identity_before_updated',
         ('trg_aromatherapy_claim_passages_identity_guard' < 'trg_aromatherapy_claim_passages_updated_at')
  UNION ALL SELECT 'rls_enabled',
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_claim_passages'::regclass)
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
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_claim_passages'::regclass) AS passed
  UNION ALL SELECT 'force_rls_false',
         (SELECT relforcerowsecurity=false FROM pg_class WHERE oid='public.aromatherapy_claim_passages'::regclass)
  UNION ALL SELECT 'policy_count_zero',
         (SELECT count(*)=0 FROM pg_policy WHERE polrelid='public.aromatherapy_claim_passages'::regclass)
  UNION ALL SELECT 'anon_no_dml',
         NOT (has_table_privilege('anon','public.aromatherapy_claim_passages','SELECT')
           OR has_table_privilege('anon','public.aromatherapy_claim_passages','INSERT')
           OR has_table_privilege('anon','public.aromatherapy_claim_passages','UPDATE')
           OR has_table_privilege('anon','public.aromatherapy_claim_passages','DELETE'))
  UNION ALL SELECT 'authenticated_no_dml',
         NOT (has_table_privilege('authenticated','public.aromatherapy_claim_passages','SELECT')
           OR has_table_privilege('authenticated','public.aromatherapy_claim_passages','INSERT')
           OR has_table_privilege('authenticated','public.aromatherapy_claim_passages','UPDATE')
           OR has_table_privilege('authenticated','public.aromatherapy_claim_passages','DELETE'))
  UNION ALL SELECT 'public_no_dml',
         NOT (has_table_privilege('public','public.aromatherapy_claim_passages','SELECT')
           OR has_table_privilege('public','public.aromatherapy_claim_passages','INSERT')
           OR has_table_privilege('public','public.aromatherapy_claim_passages','UPDATE')
           OR has_table_privilege('public','public.aromatherapy_claim_passages','DELETE'))
  UNION ALL SELECT 'service_role_has_dml',
         (has_table_privilege('service_role','public.aromatherapy_claim_passages','SELECT')
          AND has_table_privilege('service_role','public.aromatherapy_claim_passages','INSERT')
          AND has_table_privilege('service_role','public.aromatherapy_claim_passages','UPDATE')
          AND has_table_privilege('service_role','public.aromatherapy_claim_passages','DELETE'))
  UNION ALL SELECT 'service_role_no_truncate',
         NOT has_table_privilege('service_role','public.aromatherapy_claim_passages','TRUNCATE')
  UNION ALL SELECT 'service_role_no_references',
         NOT has_table_privilege('service_role','public.aromatherapy_claim_passages','REFERENCES')
  UNION ALL SELECT 'service_role_no_trigger',
         NOT has_table_privilege('service_role','public.aromatherapy_claim_passages','TRIGGER')
  UNION ALL SELECT 'service_role_no_maintain',
         NOT has_table_privilege('service_role','public.aromatherapy_claim_passages','MAINTAIN')
)
SELECT check_name, passed FROM sec
UNION ALL SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Seed zinciri: tenant A (plant_taxon→preparation→claim'ler + source→passage'lar) ve
--   tenant B (cross-tenant testleri için). CLDEL = CASCADE testine ayrılmış claim.
INSERT INTO public.aromatherapy_plant_taxa (id, tenant_id, genus, species, taxon_rank, family) VALUES
  ('10000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Lavandula','angustifolia','species','Lamiaceae'),
  ('10000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','Mentha','piperita','species','Lamiaceae');
INSERT INTO public.aromatherapy_preparations (id, tenant_id, taxon_id, preparation_type, plant_part) VALUES
  ('20000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','10000000-0000-0000-0000-000000000001','essential_oil','flower'),
  ('20000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','10000000-0000-0000-0000-000000000002','essential_oil','flower');
INSERT INTO public.aromatherapy_claims (id, tenant_id, preparation_id, claim_type, conclusion, conclusion_provenance, evidence_layer, rationale_status) VALUES
  ('a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','20000000-0000-0000-0000-000000000001','use','c1','source_original','traditional','source_gives_no_rationale'),
  ('a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','20000000-0000-0000-0000-000000000001','use','c2','source_original','traditional','source_gives_no_rationale'),
  ('a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','20000000-0000-0000-0000-000000000001','use','cd','source_original','traditional','source_gives_no_rationale'),
  ('a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','20000000-0000-0000-0000-000000000002','use','cb','source_original','traditional','source_gives_no_rationale');
INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status) VALUES
  ('30000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','book','C2L src A','draft'),
  ('30000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','book','C2L src B','draft');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status) VALUES
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','30000000-0000-0000-0000-000000000001','s.1','tr','excerpt','ex', repeat('a',64),'public_domain'),
  ('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','30000000-0000-0000-0000-000000000001','s.2','tr','full_text','full', repeat('b',64),'public_domain'),
  ('bbbbbbb4-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','30000000-0000-0000-0000-000000000002','s.b','tr','excerpt','exb', repeat('c',64),'public_domain');
INSERT INTO public.aromatherapy_source_passages (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status) VALUES
  ('bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','30000000-0000-0000-0000-000000000001','s.3','tr','reference_only','unknown');

DO $$
DECLARE
  v_old timestamptz; v_new timestamptz; v_cnt integer; v_pass integer;
  T    constant uuid := '22222222-2222-2222-2222-222222222222';
  CL1  constant uuid := 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  CL2  constant uuid := 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  CLD  constant uuid := 'a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- CASCADE testi claim'i
  CLB  constant uuid := 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- tenant B claim
  PEX  constant uuid := 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- excerpt (A)
  PFU  constant uuid := 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- full_text (A)
  PRF  constant uuid := 'bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- reference_only (A)
  PEXB constant uuid := 'bbbbbbb4-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- tenant B excerpt
  L1   constant uuid := 'c1111111-cccc-cccc-cccc-cccccccccccc';  -- immutable UPDATE testleri hedefi
  LUP  constant uuid := 'c6666666-cccc-cccc-cccc-cccccccccccc';  -- verification UPDATE testi
  LNO  constant uuid := 'c7777777-cccc-cccc-cccc-cccccccccccc';  -- no-op identity testi
  LDEL constant uuid := 'c8888888-cccc-cccc-cccc-cccccccccccc';  -- CASCADE link
  NOCL constant uuid := '99999999-9999-9999-9999-999999999999';  -- olmayan claim
  NOPA constant uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';  -- olmayan passage
BEGIN
  -- ══ POZİTİF (10) ══
  INSERT INTO public.aromatherapy_claim_passages (id,tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (L1,T,CL1,PEX,'excerpt','supports');
  RAISE NOTICE 'PASS: excerpt + supports';

  INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PFU,'full_text','contradicts');
  RAISE NOTICE 'PASS: full_text + contradicts';

  INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEX,'excerpt','qualifies');
  RAISE NOTICE 'PASS: ayni claim/passage farkli evidence_relation';

  INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL2,PEX,'excerpt','partially_supports');
  RAISE NOTICE 'PASS: partially_supports';

  INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL2,PFU,'full_text','supports');
  RAISE NOTICE 'PASS: unverified link (default)';

  INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_by,verified_at)
    VALUES (T,CL2,PEX,'excerpt','contextualizes','verified','editor',now());
  RAISE NOTICE 'PASS: verified + verified_by + verified_at';

  -- unverified → verified UPDATE izinli; updated_at (eski değerden) bump.
  INSERT INTO public.aromatherapy_claim_passages (id,tenant_id,claim_id,passage_id,passage_kind,evidence_relation,updated_at)
    VALUES (LUP,T,CL2,PFU,'full_text','qualifies', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_claim_passages WHERE id=LUP;
  UPDATE public.aromatherapy_claim_passages SET verification_status='verified', verified_by='editor', verified_at=now() WHERE id=LUP;
  RAISE NOTICE 'PASS: unverified->verified UPDATE';
  SELECT updated_at INTO v_new FROM public.aromatherapy_claim_passages WHERE id=LUP;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: verification UPDATE updated_at degismedi'; END IF;

  -- no-op identity SET izinli; updated_at yine bump.
  INSERT INTO public.aromatherapy_claim_passages (id,tenant_id,claim_id,passage_id,passage_kind,evidence_relation,updated_at)
    VALUES (LNO,T,CL1,PFU,'full_text','limits', timestamptz '2000-01-01 00:00:00+00');
  SELECT updated_at INTO v_old FROM public.aromatherapy_claim_passages WHERE id=LNO;
  UPDATE public.aromatherapy_claim_passages SET claim_id=claim_id WHERE id=LNO;
  SELECT updated_at INTO v_new FROM public.aromatherapy_claim_passages WHERE id=LNO;
  IF v_new > v_old THEN RAISE NOTICE 'PASS: no-op identity SET izinli + updated_at bump';
  ELSE RAISE EXCEPTION 'FAIL: no-op UPDATE updated_at degismedi'; END IF;

  -- claim DELETE CASCADE: yalnız bağlı C2L link silinir; source passage silinmez.
  INSERT INTO public.aromatherapy_claim_passages (id,tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (LDEL,T,CLD,PEX,'excerpt','supports');
  DELETE FROM public.aromatherapy_claims WHERE id=CLD;
  SELECT count(*) INTO v_cnt FROM public.aromatherapy_claim_passages WHERE id=LDEL;
  SELECT count(*) INTO v_pass FROM public.aromatherapy_source_passages WHERE id=PEX;
  IF v_cnt=0 AND v_pass=1 THEN RAISE NOTICE 'PASS: claim DELETE CASCADE (link silindi, passage korundu)';
  ELSE RAISE EXCEPTION 'FAIL: claim DELETE CASCADE beklenmeyen (link=%, passage=%)', v_cnt, v_pass; END IF;

  -- ══ NEGATİF (23) ══
  -- 1) cross-tenant claim
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CLB,PEX,'excerpt','supports');
    RAISE EXCEPTION 'FAIL: cross_tenant_claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_claim reddedildi'; END;

  -- 2) cross-tenant passage
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEXB,'excerpt','supports');
    RAISE EXCEPTION 'FAIL: cross_tenant_passage kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_passage reddedildi'; END;

  -- 3) passage_kind snapshot mismatch (gerçek excerpt + full_text snapshot; taze doğal anahtar)
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL2,PEX,'full_text','supports');
    RAISE EXCEPTION 'FAIL: passage_kind_snapshot_mismatch kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: passage_kind_snapshot_mismatch reddedildi'; END;

  -- 4) reference_only passage_kind reddi (passage_kind CHECK; taze doğal anahtar)
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PRF,'reference_only','supports');
    RAISE EXCEPTION 'FAIL: reference_only kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reference_only passage_kind reddedildi'; END;

  -- 5) invalid evidence_relation
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEX,'excerpt','strongly_supports');
    RAISE EXCEPTION 'FAIL: bad_evidence_relation kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_evidence_relation reddedildi'; END;

  -- 6) invalid verification_status
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status)
    VALUES (T,CL1,PFU,'full_text','supports','pending');
    RAISE EXCEPTION 'FAIL: bad_verification_status kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_verification_status reddedildi'; END;

  -- 7) verified + verified_by NULL
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_by,verified_at)
    VALUES (T,CL2,PFU,'full_text','contradicts','verified',NULL,now());
    RAISE EXCEPTION 'FAIL: verified_by_null kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_by_null reddedildi'; END;

  -- 8) verified + verified_by whitespace
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_by,verified_at)
    VALUES (T,CL2,PFU,'full_text','limits','verified','   ',now());
    RAISE EXCEPTION 'FAIL: verified_by_whitespace kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_by_whitespace reddedildi'; END;

  -- 9) verified + verified_at NULL
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_by,verified_at)
    VALUES (T,CL2,PFU,'full_text','contextualizes','verified','editor',NULL);
    RAISE EXCEPTION 'FAIL: verified_at_null kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: verified+verified_at_null reddedildi'; END;

  -- 10) unverified + verified_by
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_by)
    VALUES (T,CL2,PEX,'excerpt','supports','unverified','editor');
    RAISE EXCEPTION 'FAIL: unverified_with_verified_by kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unverified+verified_by reddedildi'; END;

  -- 11) unverified + verified_at
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation,verification_status,verified_at)
    VALUES (T,CL2,PEX,'excerpt','limits','unverified',now());
    RAISE EXCEPTION 'FAIL: unverified_with_verified_at kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unverified+verified_at reddedildi'; END;

  -- 12) duplicate doğal anahtar (L1 tekrarı)
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEX,'excerpt','supports');
    RAISE EXCEPTION 'FAIL: duplicate kabul';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate (claim,passage,evidence_relation) reddedildi'; END;

  -- 13-18) identity immutability (SQLSTATE 23514 = check_violation)
  BEGIN UPDATE public.aromatherapy_claim_passages SET tenant_id='55555555-5555-5555-5555-555555555555' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: tenant_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: tenant_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_claim_passages SET claim_id=CL2 WHERE id=L1;
    RAISE EXCEPTION 'FAIL: claim_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: claim_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_claim_passages SET passage_id=PFU WHERE id=L1;
    RAISE EXCEPTION 'FAIL: passage_id UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: passage_id UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_claim_passages SET passage_kind='full_text' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: passage_kind UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: passage_kind UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_claim_passages SET evidence_relation='limits' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: evidence_relation UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: evidence_relation UPDATE reddedildi'; END;
  BEGIN UPDATE public.aromatherapy_claim_passages SET created_at=timestamptz '2000-01-01 00:00:00+00' WHERE id=L1;
    RAISE EXCEPTION 'FAIL: created_at UPDATE kabul';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: created_at UPDATE reddedildi'; END;

  -- 19) passage parent DELETE RESTRICT
  BEGIN DELETE FROM public.aromatherapy_source_passages WHERE id=PEX;
    RAISE EXCEPTION 'FAIL: passage parent DELETE kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: passage parent DELETE RESTRICT'; END;

  -- 20) olmayan claim FK
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,NOCL,PEX,'excerpt','supports');
    RAISE EXCEPTION 'FAIL: nonexistent_claim kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_claim reddedildi'; END;

  -- 21) olmayan passage FK
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,NOPA,'excerpt','supports');
    RAISE EXCEPTION 'FAIL: nonexistent_passage kabul';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: nonexistent_passage reddedildi'; END;

  -- 22) NULL evidence_relation
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEX,'excerpt',NULL);
    RAISE EXCEPTION 'FAIL: null_evidence_relation kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: null_evidence_relation reddedildi'; END;

  -- 23) NULL passage_kind
  BEGIN INSERT INTO public.aromatherapy_claim_passages (tenant_id,claim_id,passage_id,passage_kind,evidence_relation)
    VALUES (T,CL1,PEX,NULL,'supports');
    RAISE EXCEPTION 'FAIL: null_passage_kind kabul';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: null_passage_kind reddedildi'; END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: tüm PASS notice + C_OVERALL PASS; ROLLBACK sonrası kalıcı kayıt YOK.
