-- ============================================================
-- 20261229000300_nutrition_topic_foods.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Topic ↔ Food structured relation. §F.4
-- İki composite tenant-safe FK: topic (CASCADE) + food (RESTRICT). Cross-tenant ilişki imkânsız.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_topic_foods (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  topic_id       uuid        NOT NULL,
  food_id        uuid        NOT NULL,
  relation_type  text        NOT NULL,
  rationale      text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_topic_foods_relation_type_chk CHECK (
    relation_type IN ('recommended', 'suitable', 'neutral', 'limit', 'avoid', 'caution')
  ),

  -- aynı (topic, food) bağı bir kez.
  CONSTRAINT nutrition_topic_foods_natural_key UNIQUE (tenant_id, topic_id, food_id),

  CONSTRAINT nutrition_topic_foods_topic_fk
    FOREIGN KEY (tenant_id, topic_id)
    REFERENCES public.nutrition_topics (tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT nutrition_topic_foods_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE RESTRICT
);

-- ters arama: bir besin hangi topic'lerde.
CREATE INDEX nutrition_topic_foods_food_idx
  ON public.nutrition_topic_foods (tenant_id, food_id);

CREATE TRIGGER trg_nutrition_topic_foods_updated_at
  BEFORE UPDATE ON public.nutrition_topic_foods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_topic_foods ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_topic_foods FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_topic_foods TO service_role;

COMMIT;
