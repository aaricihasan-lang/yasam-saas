-- =============================================================================
-- 20260625160000_harden_users_column_grants.sql
--
-- users TABLOSU — KOLON BAZLI GRANT SERTLEŞTİRME (repo ↔ canlı uyumu)
--
-- BAĞLAM:
--   20260625150000_lock_users_table.sql tablo-seviyesi `REVOKE ALL` + policy drop
--   + ENABLE RLS yapıyordu. Ancak PostgreSQL'de tablo-seviyesi `REVOKE ALL ON TABLE`
--   tek tek verilmiş KOLON-SEVİYESİ grant'ları (`GRANT SELECT (col) ...`) kaldırmaz.
--   Canlı users tablosunda anon/authenticated için ~80 kolonda SELECT grant'ı vardı
--   (password, password_hash, payment_status, paid_amount dahil). Bunlar canlıda
--   SQL Editor'de dinamik bir DO bloğuyla temizlendi ve doğrulandı:
--     has_table_privilege(anon/authenticated,'public.users','SELECT') = false
--     kalan kolon SELECT grant'ı = 0, policy = 0, rls = true, force = false.
--
--   Bu migration, canlıda doğrulanan o güvenli durumu REPO geçmişine yansıtır.
--   IDEMPOTENT: temiz bir DB'ye uygulandığında da aynı sonucu verir; canlıda
--   tekrar çalıştırılırsa zaten 0 kolon kalmış olduğundan etkisizdir (no-op).
--
-- ⚠️ Bu dosya canlı DB'ye TEKRAR uygulama amaçlı DEĞİLDİR; yalnızca repo migration
--    geçmişini canlıdaki doğrulanmış durumla hizalar.
--
-- YÖNTEM (yalnızca public.users):
--   1) Tüm policy'leri DROP et.
--   2) Tablo-seviyesi tüm yetkileri REVOKE et (anon, authenticated).
--   3) Kalan KOLON-seviyesi SELECT grant'larını information_schema üzerinden tek tek REVOKE et.
--   4) RLS ENABLE (FORCE DEĞİL).
--   5) HİÇBİR POLICY OLUŞTURULMAZ.
--
--   ⛔ FORCE ROW LEVEL SECURITY KULLANILMAZ (SECURITY DEFINER login_user owner
--      okumasını kırardı).  ⛔ Policy / USING(true) YAZILMAZ.  ⛔ service_role'e dokunulmaz.
--
-- login_user (SECURITY DEFINER): EXECUTE fonksiyon seviyesindedir; tablo/kolon
--   REVOKE'u etkilemez. Login/profile/admin (service_role) çalışmaya devam eder.
-- =============================================================================

BEGIN;

-- 1) users üzerindeki tüm policy'leri kaldır
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- 2) Tablo-seviyesi tüm yetkileri geri al
REVOKE ALL PRIVILEGES ON TABLE public.users FROM anon, authenticated;

-- 3) Kalan KOLON-seviyesi SELECT grant'larını tek tek geri al
--    (REVOKE ALL ON TABLE kolon grant'larını kaldırmaz — açıkça gerekli)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.users FROM %I',
      r.column_name, r.grantee
    );
  END LOOP;
END $$;

-- 4) RLS etkin — FORCE KULLANILMAZ, POLICY OLUŞTURULMAZ
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen değerler):
--   SELECT has_table_privilege('anon','public.users','SELECT');          -- false
--   SELECT has_table_privilege('authenticated','public.users','SELECT'); -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public' AND table_name='users'
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT'; -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='users';                   -- 0
--   SELECT relrowsecurity, relforcerowsecurity
--     FROM pg_class WHERE oid='public.users'::regclass;                  -- true, false
-- =============================================================================
