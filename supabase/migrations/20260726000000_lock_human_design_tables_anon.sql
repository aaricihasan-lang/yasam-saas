-- =============================================================================
-- 20260726000000_lock_human_design_tables_anon.sql
--
-- HUMAN DESIGN TABLOLARI — anon / authenticated ERİŞİM KİLİDİ (HD-0 — güvenlik)
--
-- BAĞLAM:
--   Aşağıdaki 5 HD tablosunun TÜM tarayıcı (anon/authenticated) erişimi
--   service_role'lü sunucu API route'larına taşınmıştır (Sprint-3/4):
--     public.human_design_clients          → /api/hd/clients
--     public.human_design_charts           → /api/hd/charts
--     public.human_design_knowledge_records→ /api/hd/knowledge
--     public.human_design_reports          → /api/hd/reports
--     public.human_design_knowledge        → (legacy desktop-import; uygulama kodunda
--                                             referansı yok, salt kilitleme kapsamında)
--   Kilit canlı DB'de (Dashboard SQL) uygulanmış olabilir ANCAK repo'da kaydı yoktu
--   (repo↔canlı drift). Bu migration o kilidi repo'ya idempotent biçimde taşır.
--
-- YÖNTEM (lock_module_tables_anon / lock_client_core_tables ile BİREBİR desen):
--   1) Tablodaki tüm policy'ler kaldırılır.
--   2) REVOKE ALL PRIVILEGES ... FROM anon, authenticated  → rol yetkileri sıfır.
--   3) Kalan kolon-seviyesi SELECT yetkileri information_schema üzerinden tek tek revoke.
--   4) RLS etkinleştirilir (yalnızca ENABLE).
--
--   ⛔ FORCE RLS KULLANILMAZ (SECURITY DEFINER / service_role akışlarını kırardı).
--   ⛔ Yeni/izin-veren policy OLUŞTURULMAZ.
--   ⛔ Yalnız bu 5 tablo hedeflenir.
--   ⛔ Yetki yeniden verilmez (REVOKE-only).
--   ⛔ Tablo/kolon/veri SİLİNMEZ; legacy tablo SİLİNMEZ, taşınmaz, okunmaz.
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnız anon/authenticated'a uygulanır → tüm sunucu
--   API route'ları (getServerDb / service_role) okuma+yazma yapmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- IDEMPOTENT: canlıda zaten kilitliyse policy yok + yetki 0 → no-op.
-- ⚠️ ÖN KOŞUL: client→API kodu production'da CANLI (Sprint-3/4 merge edilmiş) ve
--    anon erişiminin bugün 42501 döndüğü salt-okunur probe ile doğrulanmıştır.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY[
    'human_design_clients',
    'human_design_charts',
    'human_design_knowledge_records',
    'human_design_reports',
    'human_design_knowledge'
  ];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    -- Tablo yoksa atla (idempotent / ortam farkları).
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

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

    -- 4) RLS etkin (yalnız ENABLE — FORCE değil, policy yok).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT has_table_privilege('anon','public.human_design_clients','SELECT');   -- false
--   SELECT has_table_privilege('anon','public.human_design_reports','INSERT');   -- false
--   SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema='public'
--       AND table_name IN ('human_design_clients','human_design_charts',
--                          'human_design_knowledge_records','human_design_reports',
--                          'human_design_knowledge')
--       AND grantee IN ('anon','authenticated') AND privilege_type='SELECT';       -- 0
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public'
--       AND tablename IN ('human_design_clients','human_design_charts',
--                         'human_design_knowledge_records','human_design_reports',
--                         'human_design_knowledge');                               -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname IN ('human_design_clients','human_design_charts',
--                       'human_design_knowledge_records','human_design_reports',
--                       'human_design_knowledge');
--     -- relrowsecurity=true, relforcerowsecurity=false
-- Davranışsal: anon SELECT/INSERT/UPDATE/DELETE → engelli (42501); service_role → çalışır.
--
-- ROLLBACK (acil — yalnız kurtarma için; anon erişimini yeniden açar):
--   BEGIN;
--     DO $$ DECLARE t text; targets text[] := ARRAY['human_design_clients',
--       'human_design_charts','human_design_knowledge_records','human_design_reports',
--       'human_design_knowledge'];
--     BEGIN FOREACH t IN ARRAY targets LOOP
--       EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
--       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--     END LOOP; END $$;
--   COMMIT;
-- =============================================================================
