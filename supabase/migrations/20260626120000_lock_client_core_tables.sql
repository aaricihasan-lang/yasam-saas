-- =============================================================================
-- 20260626120000_lock_client_core_tables.sql
--
-- DANIŞAN ÇEKİRDEĞİ — anon / publishable ERİŞİM KİLİDİ (C2-B1d)
--
-- BAĞLAM (C2-B1a..B1c-5):
--   Aşağıdaki 4 tablonun TÜM tarayıcı erişimi service_role'lü sunucu API
--   route'larına taşındı (publishable supabase.from kalmadı — final tarama temiz):
--     public.clients
--     public.appointments
--     public.client_stones
--     public.client_sessions
--   Bu migration veritabanı seviyesinde anon/authenticated erişimini kapatır.
--
-- YÖNTEM (her tablo için, tek transaction içinde döngüyle):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated  → rol yetkileri sıfır.
--   3) Kalan kolon-seviyesi SELECT yetkileri information_schema üzerinden tek tek
--      geri alınır (REVOKE ALL ON TABLE kolon-seviyesini kaldırmaz).
--   4) RLS etkinleştirilir (yalnızca ENABLE).
--
--   ⛔ FORCE RLS KULLANILMAZ (SECURITY DEFINER akışlarını kırardı).
--   ⛔ Yeni policy OLUŞTURULMAZ; açık (her satıra izin veren) policy yazılmaz.
--   ⛔ Yalnızca bu 4 tablo hedeflenir; başka tabloya dokunulmaz.
--   ⛔ Yetki yeniden verilmez (REVOKE-only).
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnızca anon/authenticated'a uygulanır → tüm
--   sunucu API route'ları (getServerDb / service_role) çalışmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy zaten yok, yetki zaten 0 → no-op.
-- ⚠️ Bu commit canlıya otomatik uygulama DEĞİLDİR; uygulama ayrı onayla yapılır.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY['clients', 'appointments', 'client_stones', 'client_sessions'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    -- 1) Tablodaki tüm policy'leri kaldır.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- 2) Tablo-seviyesi tüm yetkileri geri al.
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl
    );

    -- 3) Kalan kolon-seviyesi SELECT yetkilerini tek tek geri al.
    FOR col IN
      SELECT column_name, grantee
      FROM information_schema.column_privileges
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND grantee IN ('anon', 'authenticated')
        AND privilege_type = 'SELECT'
    LOOP
      EXECUTE format(
        'REVOKE SELECT (%I) ON TABLE public.%I FROM %I',
        col.column_name, tbl, col.grantee
      );
    END LOOP;

    -- 4) RLS etkin (yalnızca ENABLE — FORCE değil, policy yok).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — her tablo için beklenen):
--   SELECT has_table_privilege('anon','public.clients','SELECT');          -- false
--   SELECT has_table_privilege('authenticated','public.appointments','SELECT'); -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public'
--       AND table_name IN ('clients','appointments','client_stones','client_sessions')
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';  -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public'
--       AND tablename IN ('clients','appointments','client_stones','client_sessions'); -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname IN ('clients','appointments','client_stones','client_sessions');
--     -- relrowsecurity=true, relforcerowsecurity=false (her satır)
-- Davranışsal: anon SELECT → engelli; service_role SELECT/CRUD → çalışır.
-- =============================================================================
