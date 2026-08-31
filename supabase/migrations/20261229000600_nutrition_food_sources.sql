-- ============================================================
-- 20261229000600_nutrition_food_sources.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Food ↔ Source (GERÇEK FK; polimorfik DEĞİL). §16
-- food CASCADE + source RESTRICT.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_sources (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  food_id      uuid        NOT NULL,
  source_id    uuid        NOT NULL,
  locator      text,
  note         text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_food_sources_natural_key UNIQUE (tenant_id, food_id, source_id),

  CONSTRAINT nutrition_food_sources_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT nutrition_food_sources_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.nutrition_sources (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX nutrition_food_sources_source_idx
  ON public.nutrition_food_sources (tenant_id, source_id);

CREATE TRIGGER trg_nutrition_food_sources_updated_at
  BEFORE UPDATE ON public.nutrition_food_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_sources FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_sources TO service_role;

COMMIT;
