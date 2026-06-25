-- =============================================================================
-- 20260625170000_lock_user_sessions.sql
--
-- user_sessions TABLOSU — anon / publishable ERİŞİM KİLİDİ (C1)
--
-- BAĞLAM (Güvenlik auditi C1):
--   user_sessions zaten RLS-ENABLED + yalnızca service_role policy ile kurulmuştu
--   (20260622100000_account_security.sql). Davranışsal doğrulama:
--     service_role → 39 satır;  anon → count=0 / 0 satır (RLS maskeliyor, hata yok).
--   Yani satırlar RLS ile gizli; ANCAK anon/authenticated rolleri tablo üzerinde
--   hâlâ GRANT taşıyor (Supabase default privileges). Bu, savunma derinliği açığı
--   ve audit'te "erişilebilir" görünmesinin nedeni. Bu migration grant'ları da
--   kaldırarak users / client_* tablolarıyla aynı temiz "tam red" durumuna getirir.
--
--   Tüm uygulama erişimi service_role üzerinden:
--     * lib/auth/sessionSecurity.ts (db parametresi caller'dan service_role gelir)
--     * /api/settings/change-password, /api/admin/users/[id]/active-sessions,
--       .../security-events, .../sessions/[sessionId]
--   Browser/publishable doğrudan user_sessions erişimi YOK.
--
-- YÖNTEM (yalnızca public.user_sessions):
--   1) Tüm policy'leri DROP et (service_role dahil — service_role BYPASSRLS taşır,
--      policy'ye ihtiyaç duymaz; client_* kilit deseniyle birebir).
--   2) REVOKE ALL PRIVILEGES ON TABLE FROM anon, authenticated.
--   3) Kalan KOLON-seviyesi SELECT grant'larını DO-loop ile tek tek REVOKE et.
--   4) ENABLE ROW LEVEL SECURITY (FORCE DEĞİL).
--   5) HİÇBİR POLICY OLUŞTURULMAZ.
--
--   ⛔ FORCE ROW LEVEL SECURITY yok.  ⛔ Policy / USING(true) yok.
--   ⛔ Yalnızca public.user_sessions; başka tabloya dokunulmaz.
--   service_role: BYPASSRLS + REVOKE yalnızca anon/authenticated → etkilenmez.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy zaten yok, grant zaten 0 → no-op.
-- ⚠️ Bu commit canlıya otomatik uygulama DEĞİLDİR; uygulama ayrı onayla yapılır.
-- =============================================================================

BEGIN;

-- 1) Tüm policy'leri kaldır (service_role BYPASSRLS ile çalışmaya devam eder)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_sessions', pol.policyname);
  END LOOP;
END $$;

-- 2) Tablo-seviyesi tüm yetkileri geri al
REVOKE ALL PRIVILEGES ON TABLE public.user_sessions FROM anon, authenticated;

-- 3) Kalan KOLON-seviyesi SELECT grant'larını tek tek geri al
--    (REVOKE ALL ON TABLE kolon grant'larını kaldırmaz — açıkça gerekli)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name   = 'user_sessions'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.user_sessions FROM %I',
      r.column_name, r.grantee
    );
  END LOOP;
END $$;

-- 4) RLS etkin — FORCE KULLANILMAZ, POLICY OLUŞTURULMAZ
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen değerler):
--   SELECT has_table_privilege('anon','public.user_sessions','SELECT');          -- false
--   SELECT has_table_privilege('authenticated','public.user_sessions','SELECT'); -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public' AND table_name='user_sessions'
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';     -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='user_sessions';                   -- 0
--   SELECT relrowsecurity, relforcerowsecurity
--     FROM pg_class WHERE oid='public.user_sessions'::regclass;                  -- true, false
-- Davranışsal: anon user_sessions SELECT → engelli; service_role → 39 satır (çalışır).
-- =============================================================================
