-- ============================================================
-- 20261229000500_nutrition_topic_sources.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Topic ↔ Source (GERÇEK FK; polimorfik entity_type/entity_id DEĞİL). §16
-- topic CASCADE (topic silinince bağ gider) + source RESTRICT (kaynak referanslıyken silinemez).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_topic_sources (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  topic_id     uuid        NOT NULL,
  source_id    uuid        NOT NULL,
  locator      text,
  note         text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_topic_sources_natural_key UNIQUE (tenant_id, topic_id, source_id),

  CONSTRAINT nutrition_topic_sources_topic_fk
    FOREIGN KEY (tenant_id, topic_id)
    REFERENCES public.nutrition_topics (tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT nutrition_topic_sources_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.nutrition_sources (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX nutrition_topic_sources_source_idx
  ON public.nutrition_topic_sources (tenant_id, source_id);

CREATE TRIGGER trg_nutrition_topic_sources_updated_at
  BEFORE UPDATE ON public.nutrition_topic_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_topic_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_topic_sources FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_topic_sources TO service_role;

COMMIT;
