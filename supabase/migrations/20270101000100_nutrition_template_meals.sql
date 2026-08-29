-- ============================================================
-- 20270101000100_nutrition_template_meals.sql
--
-- Beslenme FAZ 6 — TEMPLATE MEAL. Plan meal'i aynalar; template_id, plan_id yerine geçer.
--   'meal' şablonu = 1 satır; 'day' şablonu = N satır.
-- PARENT CONSISTENCY: (tenant_id, template_id) → nutrition_templates (tenant_id, id) CASCADE.
--   Ayrıca UNIQUE (tenant_id, template_id, id) → item'lar meal'e template-tutarlı bağlanır.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_template_meals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  template_id   uuid        NOT NULL,
  meal_type     text,
  label         text        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  energy_target numeric,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_template_meals_label_chk CHECK (btrim(label) <> ''),
  CONSTRAINT nutrition_template_meals_meal_type_chk CHECK (
    meal_type IS NULL OR meal_type IN ('breakfast', 'snack', 'lunch', 'dinner', 'late_snack')
  ),
  CONSTRAINT nutrition_template_meals_energy_target_chk CHECK (
    energy_target IS NULL OR energy_target > 0
  ),

  CONSTRAINT nutrition_template_meals_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES public.nutrition_templates (tenant_id, id)
    ON DELETE CASCADE,

  -- child (template_items) kompozit FK hedefi: (tenant_id, template_id, id).
  CONSTRAINT nutrition_template_meals_template_id_key UNIQUE (tenant_id, template_id, id)
);

CREATE INDEX nutrition_template_meals_template_idx
  ON public.nutrition_template_meals (tenant_id, template_id, sort_order);

CREATE FUNCTION public.nutrition_template_meals_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_template_meals identity columns are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_template_meals_identity_guard
  BEFORE UPDATE ON public.nutrition_template_meals
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_template_meals_identity_guard();

CREATE TRIGGER trg_nutrition_template_meals_updated_at
  BEFORE UPDATE ON public.nutrition_template_meals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_template_meals ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_template_meals FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_template_meals TO service_role;

COMMIT;
