-- ============================================================
-- verify-aromatherapy-source-passages.sql
--
-- C2H doğrulama harness'i — public.aromatherapy_source_passages
-- (migration: supabase/migrations/20260724000000_aromatherapy_source_passages.sql)
--
-- KULLANIM: Supabase Dashboard → SQL Editor. Yerel psql/docker YOK; bu dosya
--   Dashboard'da çalıştırılmak üzere hazırlanmıştır. Bölüm A/B SALT-OKUNURDUR
--   (yazma yok). Bölüm C tek transaction + ROLLBACK'tir (kalıcı yazma YOK).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- content_hash SÖZLEŞMESİ (geliştirici notu — migration hash ÜRETMEZ):
--   * Hash service_role uygulama/API katmanında Node.js crypto ile üretilir
--     (proje doktrini: lib/yasam-hafizasi/indexer/buildCandidate.ts).
--   * Algoritma: SHA-256 → 64 karakter lowercase hex text.
--   * Girdi: original_text değerinin BİREBİR UTF-8 byte dizisi.
--   * Hash öncesi OTOMATİK YAPILMAZ: trim, lowercase, Unicode normalization,
--     whitespace collapse, punctuation replacement, line-ending transformation,
--     dilsel normalizasyon, JSON serialization.
--   * Amaç arama-normalizasyonu DEĞİL; birebir kaynak metni SÜRÜM ÇIPASIDIR.
--   * DB yalnız formatı ('^[0-9a-f]{64}$') ve passage_kind coupling'ini zorlar.
-- ─────────────────────────────────────────────────────────────────────────────
-- ============================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM A — YAPISAL DOĞRULAMA (salt-okunur)
-- ═════════════════════════════════════════════════════════════════════════════
WITH checks AS (
  -- tablo var
  SELECT 'table_exists' AS check_name,
         (to_regclass('public.aromatherapy_source_passages') IS NOT NULL) AS passed
  UNION ALL
  -- tam 16 kolon
  SELECT 'column_count_16',
         (SELECT count(*) = 16 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='aromatherapy_source_passages')
  UNION ALL
  -- kritik kolon tipleri
  SELECT 'col_id_uuid',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_source_passages' AND column_name='id' AND data_type='uuid')
  UNION ALL
  SELECT 'col_locator_jsonb',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_source_passages' AND column_name='locator' AND data_type='jsonb')
  UNION ALL
  SELECT 'col_sort_key_numeric',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_source_passages' AND column_name='sort_key' AND data_type='numeric')
  UNION ALL
  SELECT 'col_content_hash_text',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_source_passages' AND column_name='content_hash' AND data_type='text')
  UNION ALL
  SELECT 'col_supersedes_uuid',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aromatherapy_source_passages' AND column_name='supersedes_passage_id' AND data_type='uuid')
  UNION ALL
  -- rights_status DEFAULT YOK
  SELECT 'rights_status_no_default',
         (SELECT column_default IS NULL FROM information_schema.columns
          WHERE table_name='aromatherapy_source_passages' AND column_name='rights_status')
  UNION ALL
  -- status DEFAULT 'draft'
  SELECT 'status_default_draft',
         (SELECT column_default LIKE '%draft%' FROM information_schema.columns
          WHERE table_name='aromatherapy_source_passages' AND column_name='status')
  UNION ALL
  -- primary key = id
  SELECT 'pk_is_id',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
           WHERE c.conrelid='public.aromatherapy_source_passages'::regclass
             AND c.contype='p' AND a.attname='id'
             AND array_length(c.conkey,1)=1
         )
  UNION ALL
  -- aday anahtar UNIQUE(tenant_id,id)
  SELECT 'candidate_key_tenant_id',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid='public.aromatherapy_source_passages'::regclass
             AND c.contype='u'
             AND c.conname='aromatherapy_source_passages_tenant_id_unique'
         )
  UNION ALL
  -- iki kompozit FK ve ikisi de ON DELETE RESTRICT (confdeltype='r')
  SELECT 'two_fks_restrict',
         (SELECT count(*) = 2 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_source_passages'::regclass
            AND c.contype='f' AND c.confdeltype='r')
  UNION ALL
  SELECT 'fk_source_composite',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_source_passages_source_fk'
                 AND c.confrelid='public.aromatherapy_sources'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL
  SELECT 'fk_supersedes_self_composite',
         EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='aromatherapy_source_passages_supersedes_fk'
                 AND c.confrelid='public.aromatherapy_source_passages'::regclass AND array_length(c.conkey,1)=2)
  UNION ALL
  -- tam 10 CHECK (contype='c')
  SELECT 'check_count_10',
         (SELECT count(*) = 10 FROM pg_constraint c
          WHERE c.conrelid='public.aromatherapy_source_passages'::regclass AND c.contype='c')
  UNION ALL
  -- source_sort index
  SELECT 'index_source_sort',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                 AND indexname='aromatherapy_source_passages_source_sort_idx')
  UNION ALL
  -- updated_at trigger
  SELECT 'trigger_updated_at',
         EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid='public.aromatherapy_source_passages'::regclass
                   AND t.tgname='trg_aromatherapy_source_passages_updated_at'
                   AND NOT t.tgisinternal)
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
         (SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_source_passages'::regclass) AS passed
  UNION ALL
  SELECT 'force_rls_false',
         (SELECT relforcerowsecurity = false FROM pg_class WHERE oid='public.aromatherapy_source_passages'::regclass)
  UNION ALL
  SELECT 'policy_count_zero',
         (SELECT count(*) = 0 FROM pg_policy WHERE polrelid='public.aromatherapy_source_passages'::regclass)
  UNION ALL
  SELECT 'anon_no_dml',
         NOT (has_table_privilege('anon','public.aromatherapy_source_passages','SELECT')
           OR has_table_privilege('anon','public.aromatherapy_source_passages','INSERT')
           OR has_table_privilege('anon','public.aromatherapy_source_passages','UPDATE')
           OR has_table_privilege('anon','public.aromatherapy_source_passages','DELETE'))
  UNION ALL
  SELECT 'authenticated_no_dml',
         NOT (has_table_privilege('authenticated','public.aromatherapy_source_passages','SELECT')
           OR has_table_privilege('authenticated','public.aromatherapy_source_passages','INSERT')
           OR has_table_privilege('authenticated','public.aromatherapy_source_passages','UPDATE')
           OR has_table_privilege('authenticated','public.aromatherapy_source_passages','DELETE'))
  UNION ALL
  SELECT 'service_role_has_dml',
         (has_table_privilege('service_role','public.aromatherapy_source_passages','SELECT')
          AND has_table_privilege('service_role','public.aromatherapy_source_passages','INSERT')
          AND has_table_privilege('service_role','public.aromatherapy_source_passages','UPDATE')
          AND has_table_privilege('service_role','public.aromatherapy_source_passages','DELETE'))
)
SELECT check_name, passed FROM sec
UNION ALL
SELECT 'B_OVERALL', bool_and(passed) FROM sec
ORDER BY check_name;


-- ═════════════════════════════════════════════════════════════════════════════
-- BÖLÜM C — DAVRANIŞSAL DOĞRULAMA (tek transaction + ROLLBACK; kalıcı yazma YOK)
--   Not: Dashboard SQL Editor genelde postgres/superuser rolüyle çalışır (RLS bypass);
--   bu, CHECK/FK/coupling kısıtlarını doğrulamayı engellemez (kısıtlar rol-bağımsızdır).
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Atılabilir kaynak (kompozit FK hedefi). tenant=2222…, source=1111….
INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, status)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'book', 'C2H harness source', 'draft');

DO $$
BEGIN
  -- ── POZİTİF: geçerli excerpt (64-hex hash + text) ──
  INSERT INTO public.aromatherapy_source_passages
    (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
  VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
          's.1','tr','excerpt','örnek metin', repeat('a',64),'public_domain');
  RAISE NOTICE 'PASS: gecerli excerpt insert';

  -- ── POZİTİF: reference_only (text/hash NULL) ──
  INSERT INTO public.aromatherapy_source_passages
    (tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
  VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
          's.2','en','reference_only','restricted');
  RAISE NOTICE 'PASS: reference_only insert';

  -- ── POZİTİF: full_text (zh-Hans, 64-hex hash) ──
  INSERT INTO public.aromatherapy_source_passages
    (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
  VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
          's.3','zh-Hans','full_text','完整文本', repeat('b',64),'licensed');
  RAISE NOTICE 'PASS: full_text insert (zh-Hans)';

  -- ── NEGATİF: excerpt + original_text NULL → coupling reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, content_hash, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.4','tr','excerpt', repeat('c',64),'unknown');
    RAISE EXCEPTION 'FAIL: excerpt+text_null kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: excerpt+text_null reddedildi';
  END;

  -- ── NEGATİF: excerpt + content_hash NULL → coupling reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.5','tr','excerpt','metin','unknown');
    RAISE EXCEPTION 'FAIL: excerpt+hash_null kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: excerpt+hash_null reddedildi';
  END;

  -- ── NEGATİF: reference_only + original_text NOT NULL → coupling reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.6','tr','reference_only','olmamali','unknown');
    RAISE EXCEPTION 'FAIL: reference_only+text kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reference_only+text reddedildi';
  END;

  -- ── NEGATİF: whitespace-only original_text (excerpt) → coupling reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.7','tr','excerpt','   ', repeat('d',64),'unknown');
    RAISE EXCEPTION 'FAIL: whitespace_only_text kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: whitespace_only_text reddedildi';
  END;

  -- ── NEGATİF: content_hash 64-hex değil (uppercase) → format reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.8','tr','excerpt','metin', repeat('A',64),'unknown');
    RAISE EXCEPTION 'FAIL: uppercase_hash kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: uppercase_hash reddedildi';
  END;

  -- ── NEGATİF: geçersiz passage_kind → reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.9','tr','summary','unknown');
    RAISE EXCEPTION 'FAIL: bad_passage_kind kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_passage_kind reddedildi';
  END;

  -- ── NEGATİF: geçersiz rights_status → reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.10','tr','reference_only','fair_use_excerpt');
    RAISE EXCEPTION 'FAIL: bad_rights_status kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_rights_status reddedildi';
  END;

  -- ── NEGATİF: geçersiz original_lang (boşluk içeren) → biçim reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.11','tr TR','reference_only','unknown');
    RAISE EXCEPTION 'FAIL: bad_lang kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: bad_lang reddedildi';
  END;

  -- ── NEGATİF: locator non-object (dizi) → reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, locator, original_lang, passage_kind, rights_status)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            's.12','[]'::jsonb,'tr','reference_only','unknown');
    RAISE EXCEPTION 'FAIL: locator_array kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: locator_array reddedildi';
  END;

  -- ── NEGATİF: supersedes_passage_id = id → self-loop reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (id, tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status, supersedes_passage_id)
    VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111','s.13','tr','reference_only','unknown',
            '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'FAIL: self_loop kabul edildi';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: self_loop reddedildi';
  END;

  -- ── NEGATİF: çapraz-tenant kaynak (tenant 9999 ≠ source'un tenant'ı 2222) → FK reddi ──
  BEGIN
    INSERT INTO public.aromatherapy_source_passages
      (tenant_id, source_id, locator_label, original_lang, passage_kind, rights_status)
    VALUES ('99999999-9999-9999-9999-999999999999','11111111-1111-1111-1111-111111111111',
            's.14','tr','reference_only','unknown');
    RAISE EXCEPTION 'FAIL: cross_tenant_source kabul edildi';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross_tenant_source reddedildi';
  END;

  RAISE NOTICE '── C_OVERALL: tüm davranışsal testler PASS ──';
END $$;

ROLLBACK;
-- Beklenen: her test için PASS notice; ROLLBACK sonrası kalıcı satır/kaynak YOK.
