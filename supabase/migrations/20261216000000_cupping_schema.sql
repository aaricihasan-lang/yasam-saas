-- =============================================================================
-- 20261216000000_cupping_schema.sql
--
-- KUPA & HACAMAT TERAPİSİ — çekirdek şema (FAZ 2).
--
-- BAĞLAM:
--   Yeni profesyonel modül "Kupa & Hacamat Terapisi". Kozmik Ajanda'daki mevcut
--   `hacamat_rules` (zamanlama) yapısı ile İLGİSİZ ve ONA DOKUNULMAZ. Bu modül
--   vücut haritası + nokta atlası + amaç/rahatsızlık rehberi + teknik + bilgi +
--   güvenlik içeriğini tenant-scoped tutar.
--
-- MODEL (point ≠ placement):
--   cupping_points            → nokta bilgisi (ad/kod/açıklama/geleneksel kullanım…)
--   cupping_point_placements  → noktanın BELİRLİ bir haritadaki normalize yerleşimi.
--                               Bir nokta N haritada N yerleşim taşıyabilir (FK point_id).
--   cupping_topics            → amaç/rahatsızlık (kaynaklandırılmış geleneksel kullanım).
--   cupping_point_topics      → konu ↔ nokta M:N (rahatsızlık "tedavi eder" DEĞİL — ilişki).
--   cupping_techniques        → kupa teknikleri (kuru/yaş/sabit/hareketli — `kind` serbest).
--   cupping_knowledge_records → uzun profesyonel bilgi/eğitim kayıtları.
--   cupping_sources           → kaynak künyeleri.
--   cupping_safety_notes      → güvenlik/kontrendikasyon (bağımsız kayıt).
--
-- HARİTA LİSTESİ tabloda TUTULMAZ — kod-tarafı registry (config). Yeni harita
-- eklemek motor/DB değişikliği gerektirmez; placement.map_key serbest metindir.
--
-- GÜVENLİK (mevcut standart — reflexology_notes_atlas ile birebir):
--   - tenant_id her zaman SUNUCUDA oturumdan yazılır; body'den GÜVENİLMEZ.
--   - RLS ENABLE (policy yok) + anon/authenticated tüm yetkiler REVOKE → service_role only.
--   - ⛔ FORCE RLS YOK (service_role akışını kırardı).
--   - Erişim yalnız /api/kupa/* server route'ları (requireModuleAccess "cupping").
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS + REVOKE (tekrar no-op).
-- =============================================================================

BEGIN;

-- ─── cupping_points ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_points (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL,
  name               text        NOT NULL,
  alt_name           text,
  code               text,
  anatomical_region  text,
  description        text,
  traditional_use    text,
  application_info   text,
  related_points     text[]      NOT NULL DEFAULT '{}',
  safety_note        text,
  source_note        text,
  professional_note  text,
  sort_order         integer     NOT NULL DEFAULT 0,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cupping_points_tenant_idx
  ON public.cupping_points (tenant_id);
-- code tenant içinde eşsiz (yalnız dolu code'lar) — kimlik/çakışma denetimi.
CREATE UNIQUE INDEX IF NOT EXISTS cupping_points_tenant_code_key
  ON public.cupping_points (tenant_id, code) WHERE code IS NOT NULL AND code <> '';

-- ─── cupping_point_placements (nokta ≠ yerleşim) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_point_placements (
  id           uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid              NOT NULL,
  point_id     uuid              NOT NULL REFERENCES public.cupping_points (id) ON DELETE CASCADE,
  map_key      text              NOT NULL,
  shape        text              NOT NULL DEFAULT 'oval',
  cx           double precision  NOT NULL,
  cy           double precision  NOT NULL,
  rx           double precision  NOT NULL DEFAULT 0.02,
  ry           double precision  NOT NULL DEFAULT 0.02,
  angle        double precision  NOT NULL DEFAULT 0,
  color        text,
  placement_no integer           NOT NULL DEFAULT 1,
  created_at   timestamptz       NOT NULL DEFAULT now(),
  updated_at   timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT cupping_placement_shape_chk CHECK (shape IN ('oval', 'rect')),
  CONSTRAINT cupping_placement_unique UNIQUE (tenant_id, point_id, map_key, placement_no)
);

CREATE INDEX IF NOT EXISTS cupping_placements_tenant_map_idx
  ON public.cupping_point_placements (tenant_id, map_key);
CREATE INDEX IF NOT EXISTS cupping_placements_point_idx
  ON public.cupping_point_placements (point_id);

-- ─── cupping_topics (amaç / rahatsızlık — kaynaklı geleneksel kullanım) ───────
CREATE TABLE IF NOT EXISTS public.cupping_topics (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  title       text        NOT NULL,
  description text,
  category    text,
  notes       text,
  source_note text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cupping_topics_tenant_idx
  ON public.cupping_topics (tenant_id);

-- ─── cupping_point_topics (konu ↔ nokta M:N) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_point_topics (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  point_id          uuid        NOT NULL REFERENCES public.cupping_points (id) ON DELETE CASCADE,
  topic_id          uuid        NOT NULL REFERENCES public.cupping_topics (id) ON DELETE CASCADE,
  note              text,
  source_note       text,
  relation_strength text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_point_topic_unique UNIQUE (tenant_id, point_id, topic_id)
);

CREATE INDEX IF NOT EXISTS cupping_point_topics_tenant_idx
  ON public.cupping_point_topics (tenant_id);
CREATE INDEX IF NOT EXISTS cupping_point_topics_point_idx
  ON public.cupping_point_topics (point_id);
CREATE INDEX IF NOT EXISTS cupping_point_topics_topic_idx
  ON public.cupping_point_topics (topic_id);

-- ─── cupping_techniques (kind serbest — kuru/yaş/sabit/hareketli) ─────────────
CREATE TABLE IF NOT EXISTS public.cupping_techniques (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  name             text        NOT NULL,
  kind             text,
  description      text,
  application_info text,
  safety_note      text,
  source_note      text,
  sort_order       integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cupping_techniques_tenant_idx
  ON public.cupping_techniques (tenant_id);

-- ─── cupping_knowledge_records (bilgi & eğitim kütüphanesi) ───────────────────
CREATE TABLE IF NOT EXISTS public.cupping_knowledge_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  title          text        NOT NULL,
  content        text,
  category       text,
  tags           text[]      NOT NULL DEFAULT '{}',
  source         text,
  source_section text,
  keyword        text,
  notes          text,
  sort_order     integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cupping_knowledge_tenant_idx
  ON public.cupping_knowledge_records (tenant_id);

-- ─── cupping_sources (kaynak künyeleri) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_sources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL,
  source_name           text        NOT NULL,
  source_type           text,
  author_or_organization text,
  title                 text,
  page_or_section       text,
  source_url            text,
  accessed_on           text,
  note                  text,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cupping_sources_tenant_idx
  ON public.cupping_sources (tenant_id);

-- ─── cupping_safety_notes (güvenlik / kontrendikasyon — bağımsız kayıt) ───────
CREATE TABLE IF NOT EXISTS public.cupping_safety_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  title       text        NOT NULL,
  content     text,
  severity    text        NOT NULL DEFAULT 'warning',
  scope_tags  text[]      NOT NULL DEFAULT '{}',
  source_note text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_safety_severity_chk CHECK (severity IN ('info', 'warning', 'contraindication'))
);

CREATE INDEX IF NOT EXISTS cupping_safety_tenant_idx
  ON public.cupping_safety_notes (tenant_id);

-- ─── Kilit: anon/authenticated erişimini kapat, RLS aç (service_role bypass) ──
DO $$
DECLARE
  tbl text;
  pol record;
  col record;
  targets text[] := ARRAY[
    'cupping_points',
    'cupping_point_placements',
    'cupping_topics',
    'cupping_point_topics',
    'cupping_techniques',
    'cupping_knowledge_records',
    'cupping_sources',
    'cupping_safety_notes'
  ];
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
--   SELECT has_table_privilege('anon','public.cupping_points','SELECT');           -- false
--   SELECT has_table_privilege('authenticated','public.cupping_point_placements','INSERT'); -- false
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname LIKE 'cupping_%';                                              -- t, f (her satır)
-- Davranışsal: anon/authenticated CRUD engelli; service_role (sunucu API) çalışır.
--
-- ROLLBACK (gerekirse):
--   DROP TABLE IF EXISTS public.cupping_point_topics, public.cupping_point_placements,
--     public.cupping_safety_notes, public.cupping_sources, public.cupping_knowledge_records,
--     public.cupping_techniques, public.cupping_topics, public.cupping_points CASCADE;
-- =============================================================================
