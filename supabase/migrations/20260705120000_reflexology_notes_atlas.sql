-- =============================================================================
-- 20260705120000_reflexology_notes_atlas.sql
--
-- REFLEKSOLOJİ — Klinik Notlar + Atlas SUNUCU SENKRONU (P1-1)
--
-- BAĞLAM:
--   Klinik Notlar ve Atlas şimdiye dek yalnız tarayıcı localStorage'ında tutuluyordu
--   → cihaz değişince görünmüyordu. Bu migration iki tenant-scoped tablo ekler;
--   erişim yalnızca service_role'lü sunucu API route'ları üzerinden olur
--   (/api/refleksoloji/notes , /api/refleksoloji/atlas). Tarayıcı (anon/publishable)
--   bu tablolara DOĞRUDAN erişemez — reflexology_protocols ile birebir aynı güvenlik
--   modeli ([[lock_module_tables_anon]]).
--
-- MODEL:
--   reflexology_notes  → çok satır (tenant başına N not). source_uid = istemci not id'si.
--                        (tenant_id, source_uid) benzersiz → upsert/replace-all için.
--   reflexology_atlas  → tenant başına TEK satır (organ→bölge haritası tek JSON belge).
--
-- GÜVENLİK:
--   - tenant_id her zaman sunucuda oturumdan yazılır; body'den GÜVENİLMEZ.
--   - RLS ENABLE (policy yok) + anon/authenticated tüm yetkiler REVOKE → service_role only.
--   - ⛔ FORCE RLS kullanılmaz (service_role akışını kırardı — mevcut desenle aynı).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS + REVOKE (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── reflexology_notes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reflexology_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  source_uid  text        NOT NULL,
  title       text,
  note_date   text,
  content     text,
  attachments jsonb       NOT NULL DEFAULT '[]'::jsonb,
  raw_json    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reflexology_notes_tenant_uid_key UNIQUE (tenant_id, source_uid)
);

CREATE INDEX IF NOT EXISTS reflexology_notes_tenant_idx
  ON public.reflexology_notes (tenant_id);

-- ─── reflexology_atlas (tenant başına tek satır) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.reflexology_atlas (
  tenant_id  uuid        PRIMARY KEY,
  document   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  organ_list jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Kilit: anon/authenticated erişimini kapat, RLS aç (service_role bypass) ──
DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY['reflexology_notes', 'reflexology_atlas'];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl
    );

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

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, beklenen):
--   SELECT has_table_privilege('anon','public.reflexology_notes','SELECT');  -- false
--   SELECT has_table_privilege('anon','public.reflexology_atlas','INSERT');  -- false
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname IN ('reflexology_notes','reflexology_atlas');            -- t, f
-- Davranışsal: anon CRUD engelli; service_role (sunucu API) çalışır.
-- =============================================================================
