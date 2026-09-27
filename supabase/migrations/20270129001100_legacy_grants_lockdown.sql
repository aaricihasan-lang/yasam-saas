-- =============================================================================
-- 20270129001100_legacy_grants_lockdown.sql   [SECURITY — REVOKE + RLS; DROP YOK]
--
-- FAZ1 FINAL HARDENING — PAKET INFRA — eski tablo grant'lerinin kilitlenmesi.
--
-- AMAÇ: Tarayıcının (publishable/anon key) doğrudan erişmemesi gereken tablolarda
--   kalan anon/authenticated grant'lerini kaldırmak ve RLS'yi açık tutmak. Uygulama
--   bu tablolara YALNIZ sunucu route'larından service_role ile erişir (service_role
--   BYPASSRLS → RLS/REVOKE sunucu erişimini etkilemez).
--
-- KOD KANITI (2026-09-27, grep): lib/supabase.ts (anon istemci) import eden 10 dosyanın
--   hiçbiri aşağıdaki tablolara .from() yapmıyor; dinamik .from(table) kullanan
--   app/page.tsx (MODULE_STAT_TABLES), app/admin/tenant-kontrol (AUDIT_TABLES),
--   app/admin/sistem-sagligi (sabit aday listeleri) bu tabloları İÇERMİYOR; realtime
--   (.channel/postgres_changes) kullanımı YOK. Tüm .from("<tablo>") çağrıları app/api/**
--   veya sunucu lib'lerinde (getServerDb). Otomatik kontrol: scripts/final-hardening/infra.harness.ts.
--
-- KAPSAM:
--   A) Grant'i açık, RLS+policy'li 5 tablo (prod P-gerçekleri): client_charges,
--      client_combinations, combinations, security_events, support_messages
--      → REVOKE ALL FROM anon, authenticated (+ RLS garanti).
--   B) Yedek tabloları: _bak_users_modperm_20260926, _bak_users_modperm_cosmic_preapply_20260926,
--      _bak_hacamat_rules_20260926 → REVOKE ALL FROM PUBLIC, anon, authenticated + RLS.
--      (DROP YOK — silme kararı ayrı/owner.)
--   C) Repo migration'larında anon'a açık bırakılmış tablolar: video_transcription_jobs
--      (20260601000000: RLS disable + grant; 20260707010000 yalnız yazmayı kaldırdı → SELECT açık),
--      video_training_records (RLS disable + tam grant), personal_archive_files
--      (20260707020000 yalnız yazmayı kaldırdı → SELECT açık), user_payment_history
--      (repo'da DDL yok; prod'da elle oluşturulmuş olabilir) → REVOKE + RLS.
--
-- PRECONDITION: Her tablo to_regclass ile kontrol edilir; yoksa RAISE NOTICE + atla.
-- VERİ-YIKICI MI: HAYIR (yalnız yetki/RLS; satır/kolon değişmez, DROP YOK).
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply önkoşulu: yok (kod zaten service_role kullanıyor);
--   apply sonrası drift kontrolü: scripts/final-hardening/drift/compare.mjs.
--
-- ROLLBACK (yalnız zorunlu olursa; önceki açık durumu geri getirir — ÖNERİLMEZ):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tablo> TO anon, authenticated;
--   ALTER TABLE public.<tablo> DISABLE ROW LEVEL SECURITY;   -- yalnız C grubunda eski durum
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  rel regclass;
  app_tables text[] := ARRAY[
    -- A) grant açık + RLS/policy var
    'client_charges',
    'client_combinations',
    'combinations',
    'security_events',
    'support_messages',
    -- C) repo'da anon'a açık bırakılmış
    'video_transcription_jobs',
    'video_training_records',
    'personal_archive_files',
    'user_payment_history'
  ];
  bak_tables text[] := ARRAY[
    '_bak_users_modperm_20260926',
    '_bak_users_modperm_cosmic_preapply_20260926',
    '_bak_hacamat_rules_20260926'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    rel := to_regclass(format('public.%I', t));
    IF rel IS NULL THEN
      RAISE NOTICE 'legacy_grants_lockdown: public.% yok — atlandı', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY bak_tables LOOP
    rel := to_regclass(format('public.%I', t));
    IF rel IS NULL THEN
      RAISE NOTICE 'legacy_grants_lockdown: public.% yok — atlandı', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Kolon düzeyi grant'ler tablo REVOKE'undan bağımsızdır → anon/authenticated kolon
-- grant'i kaldıysa onları da kaldır (idempotent; yoksa no-op).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT cl.relname AS table_name, a.attname AS column_name, ro.rolname AS grantee
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class cl ON cl.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    JOIN pg_catalog.pg_roles ro ON ro.oid = x.grantee
    WHERE a.attacl IS NOT NULL
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND ro.rolname IN ('anon', 'authenticated')
      AND cl.relname IN (
        'client_charges', 'client_combinations', 'combinations', 'security_events',
        'support_messages', 'video_transcription_jobs', 'video_training_records',
        'personal_archive_files', 'user_payment_history',
        '_bak_users_modperm_20260926', '_bak_users_modperm_cosmic_preapply_20260926',
        '_bak_hacamat_rules_20260926'
      )
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I', r.column_name, r.table_name, r.grantee);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (her tablo için false beklenir):
--   SELECT t, has_table_privilege('anon', 'public.'||t, 'SELECT') AS anon_select,
--          has_table_privilege('authenticated', 'public.'||t, 'SELECT') AS auth_select
--   FROM unnest(ARRAY['client_charges','client_combinations','combinations','security_events',
--     'support_messages','video_transcription_jobs','video_training_records',
--     'personal_archive_files']) t;
-- =============================================================================
