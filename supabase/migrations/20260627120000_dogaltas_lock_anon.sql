-- =============================================================================
-- 20260627120000_dogaltas_lock_anon.sql
--
-- DOĞALTAŞ ÇEKİRDEĞİ — anon / publishable ERİŞİM KİLİDİ (Faz 1-C)
--
-- BAĞLAM (Faz 1-A + 1-B — tamamlandı, production'da doğrulandı 24/24):
--   Aşağıdaki 3 tablonun TÜM tarayıcı erişimi service_role'lü sunucu API
--   route'larına taşındı (publishable supabase.from kalmadı — canlı network
--   taraması temiz, doğrudan REST = 0):
--     public.stones
--     public.minerals
--     public.stone_exclusions
--   Bu migration veritabanı seviyesinde anon/authenticated erişimini kapatır.
--
-- YÖNTEM (her tablo için, tek transaction içinde döngüyle — lock_client_core_tables ile aynı):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated  → rol yetkileri sıfır.
--   3) Kalan kolon-seviyesi SELECT yetkileri information_schema üzerinden tek tek
--      geri alınır (REVOKE ALL ON TABLE kolon-seviyesini kaldırmaz).
--   4) RLS etkinleştirilir (yalnızca ENABLE).
--
--   ⛔ FORCE RLS KULLANILMAZ (SECURITY DEFINER akışlarını kırardı).
--   ⛔ Yeni/izin-veren policy OLUŞTURULMAZ.
--   ⛔ Yalnızca bu 3 tablo hedeflenir.
--   ⛔ Yetki yeniden verilmez (REVOKE-only).
--
-- KAPSAM DIŞI — DOKUNULMAZ:
--   dogaltas_inventory (Ürün-Stok modülü ile paylaşımlı — ayrı faz),
--   combinations, client_combinations, users, tenants, clients, appointments,
--   ve diğer tüm tablolar.
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnız anon/authenticated'a uygulanır → tüm sunucu
--   API route'ları (getServerDb / service_role) okuma+yazma yapmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy zaten yok, yetki zaten 0 → no-op.
-- ⚠️ ÖN KOŞUL: Faz 1-A+1-B kodu production'da CANLI ve doğrulanmış olmalı (öyle).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY['stones', 'minerals', 'stone_exclusions'];
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
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT has_table_privilege('anon','public.stones','SELECT');          -- false
--   SELECT has_table_privilege('anon','public.minerals','INSERT');        -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public'
--       AND table_name IN ('stones','minerals','stone_exclusions')
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';  -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public'
--       AND tablename IN ('stones','minerals','stone_exclusions');            -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname IN ('stones','minerals','stone_exclusions');
--     -- relrowsecurity=true, relforcerowsecurity=false
-- Davranışsal: anon SELECT/INSERT/UPDATE/DELETE → engelli; service_role → çalışır.
--
-- ROLLBACK (acil — anon erişimini yeniden açar; yalnız kurtarma için):
--   BEGIN;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.stones           TO anon, authenticated;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.minerals         TO anon, authenticated;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.stone_exclusions TO anon, authenticated;
--     ALTER TABLE public.stones           DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE public.minerals         DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE public.stone_exclusions DISABLE ROW LEVEL SECURITY;
--   COMMIT;
-- =============================================================================
