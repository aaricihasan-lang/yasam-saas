-- ============================================================
-- 20260705120000_aromatherapy_oils_reference_lock.sql
--
-- Aromaterapi K-2 — aromatherapy_oils + reference tabloları ANON/PUBLISHABLE KİLİDİ
--
-- BAĞLAM:
--   Yağ ve referans (bilgi bankası) okuma/yazması artık yalnız service_role'lü
--   route'lardan geçer:
--     • /api/aromaterapi/oils        (GET list/count/names, POST, DELETE)
--     • /api/aromaterapi/oils/[id]   (GET, PATCH, DELETE)
--     • /api/aromaterapi/reference   (GET)
--   Kimlik verifyUserRequest guard'ı ile; tenant_id DAİMA oturumdan.
--   Tarayıcı (anon/publishable) artık bu tablolara DOĞRUDAN erişmez → IDOR kapalı.
--
-- YÖNTEM (aromatherapy_blends_lock.sql ile birebir aynı desen, 3 tablo):
--   1) Tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES FROM anon, authenticated.
--   3) Kalan kolon-seviyesi SELECT yetkileri tek tek geri alınır.
--   4) RLS ENABLE (yalnız enable — FORCE değil, policy yok → yalnız service_role).
--
--   ⛔ FORCE RLS yok. ⛔ İzin-veren policy yok. ⛔ service_role'e dokunulmaz.
--   NOT: tenant_id IS NULL (paylaşımlı/admin kütüphane) satırları SİLİNMEZ; yalnız
--        erişim yolu değişir — server route bu satırları okumaya devam eder.
--
-- IDEMPOTENT: tekrar çalıştırılırsa no-op.
-- ⚠️ ÖN KOŞUL: yukarıdaki route'lar + client→API kodu CANLI olmalı; aksi halde
--    yağ/bilgi-bankası okuma-yazması kırılır. Önce kod deploy, SONRA bu DDL.
-- ============================================================

BEGIN;

DO $$
DECLARE
  tbl  text;
  pol  record;
  col  record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'aromatherapy_oils',
    'aromatherapy_reference_sheets',
    'aromatherapy_reference_rows'
  ]
  LOOP
    -- 1) Policy'leri kaldır.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- 2) Tablo-seviyesi tüm yetkileri geri al.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl);

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

    -- 4) RLS etkin (yalnız ENABLE — FORCE değil, policy yok → yalnız service_role erişir).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası — beklenen):
--   SELECT has_table_privilege('anon','public.aromatherapy_oils','SELECT');              -- false
--   SELECT has_table_privilege('anon','public.aromatherapy_oils','INSERT');              -- false
--   SELECT has_table_privilege('anon','public.aromatherapy_reference_sheets','SELECT');  -- false
--   SELECT has_table_privilege('anon','public.aromatherapy_reference_rows','SELECT');    -- false
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.aromatherapy_oils'::regclass;  -- true
-- Davranışsal: anon SELECT/INSERT/UPDATE/DELETE → engelli; service_role → çalışır.
-- =============================================================================
