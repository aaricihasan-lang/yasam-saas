-- =============================================================================
-- 20261001000000_cupping_topic_notes.sql
--
-- KUPA & HACAMAT — Amaç/Rahatsızlık Rehberi KULLANICI/UZMAN NOTLARI.
--
-- AMAÇ: Sade okuma modunda uygulayıcının kendi notunu (veya bir uzmandan aldığı notu)
--   rahatsızlığa bağlayabilmesi. Bu, FORMAL yayın kaynağı/atıf (cupping_sources /
--   cupping_*_sources) DEĞİLDİR; ayrı, tenant-local "not" katmanıdır. Böylece:
--     - formal "3 kaynakta geçiyor" sayısı kişisel notlardan ETKİLENMEZ,
--     - kişisel notlar formal source katalog/citation kayıtlarını KİRLETMEZ.
--
-- KAPSAM (hepsi ADDITIVE — destructive DDL YOK):
--   A. cupping_topic_notes            — not (topic'e bağlı), source_label opsiyonel.
--   B. cupping_topic_note_points      — not ↔ canonical point (M:N, ref integrity).
--
-- GÜVENLİK deseni cupping_schema (20261216000000) / content_foundation ile birebir:
--   composite tenant-safe FK (tenant_id,parent)→parent(tenant_id,id) ON DELETE CASCADE;
--   REVOKE ALL anon/authenticated; RLS ENABLE (FORCE YOK, policy YOK) → erişim yalnız
--   service-role /api/kupa/*. Transfer/provenance YOK, Yaşam Hafızası YOK (tenant-local).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / conname guard / INDEX IF NOT EXISTS.
-- Mevcut prod için INERT: yeni tablolar, mevcut kod kullanmadığı sürece davranış değişmez.
-- Bağımlılık: cupping_topics ve cupping_points üzerinde UNIQUE(tenant_id,id)
--   (content_foundation 20261217000000 tarafından eklenir) — composite FK hedefi.
-- =============================================================================

BEGIN;

-- ─── A. cupping_topic_notes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_topic_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  topic_id     uuid        NOT NULL,
  note         text        NOT NULL,
  source_label text,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_topic_notes_topic_fk
    FOREIGN KEY (tenant_id, topic_id) REFERENCES public.cupping_topics (tenant_id, id) ON DELETE CASCADE
);

-- composite UNIQUE(tenant_id, id) — note_points composite FK hedefi
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_topic_notes_tenant_id_key') THEN
    ALTER TABLE public.cupping_topic_notes
      ADD CONSTRAINT cupping_topic_notes_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cupping_topic_notes_topic_idx
  ON public.cupping_topic_notes (tenant_id, topic_id);

-- ─── B. cupping_topic_note_points (M:N) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_topic_note_points (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  topic_note_id uuid        NOT NULL,
  point_id      uuid        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_topic_note_points_note_fk
    FOREIGN KEY (tenant_id, topic_note_id) REFERENCES public.cupping_topic_notes (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_topic_note_points_point_fk
    FOREIGN KEY (tenant_id, point_id) REFERENCES public.cupping_points (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_topic_note_points_unique UNIQUE (tenant_id, topic_note_id, point_id)
);

CREATE INDEX IF NOT EXISTS cupping_topic_note_points_note_idx
  ON public.cupping_topic_note_points (tenant_id, topic_note_id);
CREATE INDEX IF NOT EXISTS cupping_topic_note_points_point_idx
  ON public.cupping_topic_note_points (tenant_id, point_id);

-- ─── Kilit: cupping_schema deseni (policy YOK, FORCE YOK, anon/auth REVOKE) ─────
REVOKE ALL PRIVILEGES ON TABLE public.cupping_topic_notes       FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_topic_note_points FROM anon, authenticated;
ALTER TABLE public.cupping_topic_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_topic_note_points ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname IN ('cupping_topic_notes','cupping_topic_note_points');     -- t, f
--   SELECT has_table_privilege('anon','public.cupping_topic_notes','SELECT');         -- false
--   SELECT has_table_privilege('authenticated','public.cupping_topic_note_points','INSERT'); -- false
--   SELECT conname FROM pg_constraint
--     WHERE conname IN ('cupping_topic_notes_topic_fk','cupping_topic_note_points_note_fk',
--                       'cupping_topic_note_points_point_fk','cupping_topic_note_points_unique',
--                       'cupping_topic_notes_tenant_id_key');                     -- 5 satır
--   -- cross-tenant note/point DB tarafından engellenir (composite FK (tenant_id, id)).
--
-- ROLLBACK (gerekirse):
--   DROP TABLE IF EXISTS public.cupping_topic_note_points, public.cupping_topic_notes CASCADE;
-- =============================================================================
