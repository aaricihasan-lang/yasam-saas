-- =============================================================================
-- 20261201000000_lock_healing_guide_sections_anon.sql
--
-- healing_guide_sections — anon / publishable ERİŞİM KİLİDİ (defense-in-depth)
--
-- BAĞLAM (Şifa Rehberi FAZ 1 preflight):
--   healing_guide_sections, 20260627130000_lock_module_tables_anon.sql kapsamının
--   DIŞINDA bırakılmıştı ("JOIN, service_role ile okunur"). Bu tabloda tenant_id
--   KOLONU YOKTUR; tenant izolasyonu parent healing_guides üzerinden (app-layer
--   .eq("tenant_id")) sağlanır ve tüm erişim service_role'lü sunucu API'sindendir.
--
--   DAVRANIŞSAL DOĞRULAMA (production, read-only, 2026-08 preflight):
--     anon (publishable) → GET /rest/v1/healing_guide_sections  ⇒ 401 permission denied
--   Yani anon zaten erişemiyor. Bu migration bunu AÇIK ve İDEMPOTENT hale getirir
--   (kardeş 6 tabloyla aynı REVOKE-only + RLS-ENABLE deseni), böylece ileride yanlış
--   bir GRANT ile açılması engellenir.
--
-- YÖNTEM (20260627130000 ile BİREBİR aynı desen, tek tablo):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated
--   3) Kalan kolon-seviyesi SELECT yetkileri tek tek geri alınır.
--   4) RLS ENABLE (yalnız ENABLE — FORCE DEĞİL; SECURITY DEFINER / service_role akışları korunur).
--
--   ⛔ FORCE RLS KULLANILMAZ.  ⛔ Yeni/izin-veren policy OLUŞTURULMAZ.
--   ⛔ service_role'e DOKUNULMAZ (BYPASSRLS taşır → sunucu API'leri çalışmaya devam eder).
--   ⛔ Bu tablonun parent'ı healing_guides zaten kilitli.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy yok, yetki 0, RLS zaten açık → no-op.
--
-- ⚠️ APPLY POLİTİKASI: Bu bir DOSYA'dır. FAZ 1 kapsamında PRODUCTION'A UYGULANMADI.
--    Uygulamadan önce §DOĞRULAMA sorgularını çalıştırıp mevcut canlı durumu teyit et.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  pol record;
  col record;
BEGIN
  -- 1) Policy'leri kaldır.
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'healing_guide_sections'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.healing_guide_sections', pol.policyname);
  END LOOP;

  -- 2) Tablo-seviyesi tüm yetkileri geri al.
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.healing_guide_sections FROM anon, authenticated';

  -- 3) Kalan kolon-seviyesi SELECT yetkilerini geri al.
  FOR col IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'healing_guide_sections'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.healing_guide_sections FROM %I',
      col.column_name, col.grantee
    );
  END LOOP;

  -- 4) RLS etkin (yalnız ENABLE — FORCE değil, policy yok).
  EXECUTE 'ALTER TABLE public.healing_guide_sections ENABLE ROW LEVEL SECURITY';
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply öncesi/sonrası, salt-okuma — beklenen):
--   SELECT has_table_privilege('anon','public.healing_guide_sections','SELECT');   -- false
--   SELECT has_table_privilege('anon','public.healing_guide_sections','INSERT');    -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public' AND table_name='healing_guide_sections'
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';         -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='healing_guide_sections';              -- 0
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace AND relname='healing_guide_sections';
--     -- relrowsecurity=true, relforcerowsecurity=false
--   Davranışsal: anon SELECT/INSERT → engelli; service_role (API) → çalışır.
--
-- ROLLBACK (acil kurtarma; yalnız gerekiyorsa):
--   BEGIN;
--     ALTER TABLE public.healing_guide_sections DISABLE ROW LEVEL SECURITY;
--     -- (grant'lar bilinçli geri verilmez; anon erişimi istenmiyor.)
--   COMMIT;
-- =============================================================================
