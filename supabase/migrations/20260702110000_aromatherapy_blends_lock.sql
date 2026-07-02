-- ============================================================
-- 20260702110000_aromatherapy_blends_lock.sql
--
-- Aromaterapi FAZ B1 — aromatherapy_blends anon/publishable ERİŞİM KİLİDİ
--
-- BAĞLAM:
--   Blend yazma/okuma yalnız service_role'lü /api/aromaterapi/blends route'undan
--   geçer (verifyUserRequest guard'ı; tenant_id oturumdan). Tarayıcı (anon/
--   publishable) artık aromatherapy_blends tablosuna DOĞRUDAN erişmez → IDOR kapalı.
--
-- YÖNTEM (lock_module_tables_anon.sql ile birebir aynı desen, tek tablo):
--   1) Tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES FROM anon, authenticated.
--   3) Kalan kolon-seviyesi SELECT yetkileri tek tek geri alınır.
--   4) RLS ENABLE (yalnız enable — FORCE değil, policy yok).
--
--   ⛔ FORCE RLS yok. ⛔ İzin-veren policy yok. ⛔ service_role'e dokunulmaz
--      (BYPASSRLS + REVOKE yalnız anon/authenticated'a → API çalışmaya devam eder).
--
-- IDEMPOTENT: tekrar çalıştırılırsa no-op.
-- ⚠️ ÖN KOŞUL: /api/aromaterapi/blends route'u ve client→API kodu canlı olmalı.
-- ============================================================

BEGIN;

DO $$
DECLARE
  pol record;
  col record;
BEGIN
  -- 1) Policy'leri kaldır.
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'aromatherapy_blends'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.aromatherapy_blends', pol.policyname);
  END LOOP;

  -- 2) Tablo-seviyesi tüm yetkileri geri al.
  REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_blends FROM anon, authenticated;

  -- 3) Kalan kolon-seviyesi SELECT yetkilerini tek tek geri al.
  FOR col IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'aromatherapy_blends'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.aromatherapy_blends FROM %I',
      col.column_name, col.grantee
    );
  END LOOP;

  -- 4) RLS etkin (yalnız ENABLE — FORCE değil, policy yok → yalnız service_role erişir).
  ALTER TABLE public.aromatherapy_blends ENABLE ROW LEVEL SECURITY;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası — beklenen):
--   SELECT has_table_privilege('anon','public.aromatherapy_blends','SELECT'); -- false
--   SELECT has_table_privilege('anon','public.aromatherapy_blends','INSERT'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_blends'::regclass; -- true
-- Davranışsal: anon SELECT/INSERT/UPDATE/DELETE → engelli; service_role → çalışır.
-- =============================================================================
