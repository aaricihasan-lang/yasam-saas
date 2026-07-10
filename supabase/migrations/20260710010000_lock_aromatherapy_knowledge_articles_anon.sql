-- =============================================================================
-- 20260710010000_lock_aromatherapy_knowledge_articles_anon.sql
--
-- A3 GÜVENLİK KİLİDİ — aromatherapy_knowledge_articles
--
-- BAĞLAM:
--   Bu tablo 20260615000003_aromatherapy_knowledge.sql ile RLS KAPALI (DISABLE)
--   ve anon/authenticated'a TAM CRUD grant'li oluşturulmuştu (proje eski standardı).
--   Yaşam Hafızası indekslemesi öncesi güvenlik borcu olarak (A3) kilitlenir:
--   erişim yalnızca service_role'lü sunucu API route/script üzerinden olur
--   (settings backup/export/restore + import script). Tarayıcı (anon/publishable)
--   bu tabloya DOĞRUDAN erişemez.
--
-- DOĞRULAMA (A3 read-only):
--   - Hiçbir UI/ekran bu tabloyu tarayıcıdan okumaz (aromaterapi Bilgi Bankası
--     ekranı aromatherapy_reference_sheets/rows tablosunu /api/aromaterapi/reference
--     üzerinden okur). Regresyon riski ~sıfır.
--   - Tek tüketiciler service_role → REVOKE/RLS baypas edildiği için etkilenmez.
--
-- GÜVENLİK:
--   - RLS ENABLE (policy yok) + anon/authenticated tüm yetkiler REVOKE → service_role only.
--   - ⛔ FORCE RLS kullanılmaz (service_role akışını kırardı — mevcut modül deseniyle aynı).
--   - Yalnız TEK tablo hedeflenir; başka tabloya dokunulmaz.
--
-- NOT: Bu migration, 2026-07-10'da Supabase Dashboard SQL Editor'dan uygulanan
--   kilidin repo'ya yazılmış birebir karşılığıdır (DATABASE_URL=localhost → DDL
--   Dashboard'dan uygulanır). IDEMPOTENT: REVOKE + ENABLE (tekrar no-op).
-- =============================================================================

BEGIN;

-- (1) Varsa policy'leri kaldır — bu tabloda policy yok, no-op (idempotent).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'aromatherapy_knowledge_articles'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.aromatherapy_knowledge_articles', pol.policyname
    );
  END LOOP;
END $$;

-- (2) Tablo seviyesi tüm yetkileri anon/authenticated'tan geri al.
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_knowledge_articles FROM anon, authenticated;

-- (3) Kolon seviyesi SELECT grant'lerini de geri al (savunma derinliği).
DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name  = 'aromatherapy_knowledge_articles'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.aromatherapy_knowledge_articles FROM %I',
      col.column_name, col.grantee
    );
  END LOOP;
END $$;

-- (4) RLS aç (FORCE değil → service_role bypass korunur; policy yok = service_role only).
ALTER TABLE public.aromatherapy_knowledge_articles ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname='aromatherapy_knowledge_articles';                       -- t, f
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='aromatherapy_knowledge_articles'; -- 0
--   SELECT has_table_privilege('anon','public.aromatherapy_knowledge_articles','SELECT');          -- false
--   SELECT has_table_privilege('authenticated','public.aromatherapy_knowledge_articles','INSERT'); -- false
--   SELECT has_table_privilege('service_role','public.aromatherapy_knowledge_articles','INSERT');  -- true
-- Davranışsal: anon/authenticated CRUD engelli; service_role (sunucu API/script) çalışır.
-- =============================================================================
