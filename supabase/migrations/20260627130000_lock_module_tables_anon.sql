-- =============================================================================
-- 20260627130000_lock_module_tables_anon.sql
--
-- MODÜL TABLOLARI — anon / publishable ERİŞİM KİLİDİ (FAZ 1 — güvenlik)
--
-- BAĞLAM:
--   Aşağıdaki 6 tablonun TÜM tarayıcı (anon/publishable) erişimi service_role'lü
--   sunucu API route'larına taşındı (client/lib'de supabase.from(...) kalmadı —
--   ripgrep doğrulaması temiz, yalnız app/api/** + scripts içinde):
--     public.reflexology_protocols   → /api/refleksoloji/protocols(+[id]) , admin import
--     public.healing_guides          → /api/sifa-rehberi/guides(+[id]) , admin import
--     public.dogaltas_inventory      → /api/dogaltas/inventory
--     public.stone_knowledge_articles→ /api/dogaltas/knowledge
--     public.numerology_analyses     → /api/numeroloji/analyses , admin metrics
--     public.personal_archives       → /api/kisisel-arsiv , admin archive
--   Bu migration veritabanı seviyesinde anon/authenticated erişimini kapatır.
--
-- YÖNTEM (her tablo için, tek transaction içinde döngüyle —
--         lock_client_core_tables / dogaltas_lock_anon ile BİREBİR aynı):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated  → rol yetkileri sıfır.
--   3) Kalan kolon-seviyesi SELECT yetkileri information_schema üzerinden tek tek
--      geri alınır (REVOKE ALL ON TABLE kolon-seviyesini kaldırmaz).
--   4) RLS etkinleştirilir (yalnızca ENABLE).
--
--   ⛔ FORCE RLS KULLANILMAZ (SECURITY DEFINER akışlarını kırardı).
--   ⛔ Yeni/izin-veren policy OLUŞTURULMAZ.
--   ⛔ Yalnızca bu 6 tablo hedeflenir.
--   ⛔ Yetki yeniden verilmez (REVOKE-only).
--
-- KAPSAM DIŞI — DOKUNULMAZ:
--   stone_knowledge_categories (global referans), healing_guide_sections (JOIN,
--   service_role ile okunur), personal_archive_files + storage, numerology_records,
--   ve diğer tüm tablolar.
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnız anon/authenticated'a uygulanır → tüm sunucu
--   API route'ları (getServerDb / service_role) okuma+yazma yapmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- IDEMPOTENT: tekrar çalıştırılırsa policy zaten yok, yetki zaten 0 → no-op.
-- ⚠️ ÖN KOŞUL: client→API kodu production'da CANLI ve doğrulanmış olmalı.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY[
    'reflexology_protocols',
    'healing_guides',
    'dogaltas_inventory',
    'stone_knowledge_articles',
    'numerology_analyses',
    'personal_archives'
  ];
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
--   SELECT has_table_privilege('anon','public.reflexology_protocols','SELECT');   -- false
--   SELECT has_table_privilege('anon','public.healing_guides','INSERT');          -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public'
--       AND table_name IN ('reflexology_protocols','healing_guides','dogaltas_inventory',
--                          'stone_knowledge_articles','numerology_analyses','personal_archives')
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';        -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public'
--       AND tablename IN ('reflexology_protocols','healing_guides','dogaltas_inventory',
--                         'stone_knowledge_articles','numerology_analyses','personal_archives'); -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname IN ('reflexology_protocols','healing_guides','dogaltas_inventory',
--                       'stone_knowledge_articles','numerology_analyses','personal_archives');
--     -- relrowsecurity=true, relforcerowsecurity=false
-- Davranışsal: anon SELECT/INSERT/UPDATE/DELETE → engelli; service_role → çalışır.
--
-- ROLLBACK (acil — anon erişimini yeniden açar; yalnız kurtarma için):
--   BEGIN;
--     DO $$ DECLARE t text; targets text[] := ARRAY['reflexology_protocols','healing_guides',
--       'dogaltas_inventory','stone_knowledge_articles','numerology_analyses','personal_archives'];
--     BEGIN FOREACH t IN ARRAY targets LOOP
--       EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
--       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--     END LOOP; END $$;
--   COMMIT;
-- =============================================================================
