-- =============================================================================
-- 20270123000000_lock_stone_knowledge_categories_anon.sql
--
-- TAŞ BİLGİ KÜTÜPHANESİ KATEGORİLERİ — anon / publishable ERİŞİM KİLİDİ
-- (Doğaltaş satış-öncesi Faz 1 — güvenlik; B-GATE-2 / B1 kapanışı)
--
-- BAĞLAM:
--   public.stone_knowledge_categories, kategori tablosu ilk kurulumunda
--   (20260612010000_stone_knowledge_categories.sql) proje standardı gereği:
--     - RLS DISABLED,
--     - anon + authenticated'a SELECT/INSERT/UPDATE/DELETE grant
--   ile açık bırakılmıştı ve sonraki modül kilitleme migration'ında
--   (20260627130000_lock_module_tables_anon.sql) "global referans" gerekçesiyle
--   KAPSAM DIŞI bırakılmıştı. Sonuç: tarayıcıdan anon/publishable anahtar ile bu
--   global sistem tablosuna doğrudan yazma teknik olarak mümkün kalmıştı.
--
--   Bu tablonun TÜM meşru erişimi artık service_role'lü sunucu kapısına taşındı
--   (app/api/dogaltas/knowledge/categories/route.ts):
--     - GET  : requireModuleAccess("stones") + service_role okuması,
--     - POST : verifyAdminRequest + demo-guard (yalnız admin global kategori ekler).
--   Client (app/dogaltas/tas-bilgi-kutuphanesi/page.tsx) yalnız fetch("/api/...")
--   kullanır; supabase.from("stone_knowledge_categories") çağrısı KALMADI
--   (ripgrep doğrulaması temiz). Bu nedenle anon/authenticated erişimi güvenle
--   kapatılabilir.
--
-- YÖNTEM (dogaltas_lock_anon / lock_module_tables_anon ile BİREBİR aynı desen):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated  → rol yetkileri sıfır.
--   3) Kalan kolon-seviyesi SELECT yetkileri information_schema üzerinden tek tek
--      geri alınır (REVOKE ALL ON TABLE kolon-seviyesini kaldırmaz).
--   4) RLS etkinleştirilir (yalnızca ENABLE).
--
--   ⛔ FORCE RLS KULLANILMAZ (SECURITY DEFINER / service_role akışlarını kırardı).
--   ⛔ Yeni/izin-veren policy OLUŞTURULMAZ.
--   ⛔ Yalnızca bu 1 tablo hedeflenir.
--   ⛔ Yetki yeniden verilmez (REVOKE-only).
--   ⛔ Mevcut kategori verisi DEĞİŞTİRİLMEZ (DROP/rewrite yok).
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnız anon/authenticated'a uygulanır → sunucu API
--   route'ları (getServerDb / service_role) okuma+yazma yapmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy zaten yok, yetki zaten 0 → no-op.
-- ⚠️ ÖN KOŞUL: client→API kodu (categories route) production'da CANLI ve
--   doğrulanmış olmalı (bu repoda öyle — client doğrudan tablo erişimi yok).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tbl text := 'stone_knowledge_categories';
  pol record;
  col record;
BEGIN
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
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT has_table_privilege('anon','public.stone_knowledge_categories','SELECT'); -- false
--   SELECT has_table_privilege('authenticated','public.stone_knowledge_categories','INSERT'); -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public' AND table_name='stone_knowledge_categories'
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';         -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='stone_knowledge_categories';          -- 0
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname='stone_knowledge_categories';   -- relrowsecurity=true, force=false
-- Davranışsal: anon/authenticated SELECT/INSERT/UPDATE/DELETE → engelli;
--   service_role (sunucu route) → çalışır.
--
-- ROLLBACK (acil — anon erişimini yeniden açar; yalnız kurtarma için):
--   BEGIN;
--     GRANT SELECT, INSERT, UPDATE, DELETE
--       ON public.stone_knowledge_categories TO anon, authenticated;
--     ALTER TABLE public.stone_knowledge_categories DISABLE ROW LEVEL SECURITY;
--   COMMIT;
-- =============================================================================
