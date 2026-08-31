-- ============================================================
-- 20261231000200_nutrition_plan_meals.sql
--
-- Beslenme FAZ 5 / Plan Motoru — MEAL (öğün). §8
--
-- Öğün sayısı SABİT DEĞİL: kullanıcı ekler/siler/adlandırır/sıralar. Boş güne otomatik
--   öğün materialize EDİLMEZ (§27). meal_type opsiyonel canonical; NULL + label = özel öğün.
--
-- PARENT CONSISTENCY (§9): (tenant_id, plan_id, plan_day_id) → nutrition_plan_days
--   (tenant_id, plan_id, id) CASCADE. plan_id taşınır → item'lar meal'e (tenant_id, plan_id, id)
--   ile bağlanır; day↔plan uyumsuzluğu İMKANSIZ.
--
-- energy_target: opsiyonel öğün hedefi (NULL veya >0; §16).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plan_meals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  plan_id       uuid        NOT NULL,
  plan_day_id   uuid        NOT NULL,
  meal_type     text,
  label         text        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  energy_target numeric,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plan_meals_label_chk CHECK (btrim(label) <> ''),
  CONSTRAINT nutrition_plan_meals_meal_type_chk CHECK (
    meal_type IS NULL OR meal_type IN ('breakfast', 'snack', 'lunch', 'dinner', 'late_snack')
  ),
  CONSTRAINT nutrition_plan_meals_energy_target_chk CHECK (
    energy_target IS NULL OR energy_target > 0
  ),

  -- tenant-safe composite FK → day CASCADE (gün silinince öğünler de gider).
  -- plan_id dahil: öğünün plan_id'si günün plan_id'si ile aynı olmak ZORUNDA (parent tutarlılık).
  CONSTRAINT nutrition_plan_meals_day_fk
    FOREIGN KEY (tenant_id, plan_id, plan_day_id)
    REFERENCES public.nutrition_plan_days (tenant_id, plan_id, id)
    ON DELETE CASCADE,

  -- child (item) kompozit FK hedefi: (tenant_id, plan_id, id).
  CONSTRAINT nutrition_plan_meals_plan_id_key UNIQUE (tenant_id, plan_id, id)
);

CREATE INDEX nutrition_plan_meals_day_idx
  ON public.nutrition_plan_meals (tenant_id, plan_day_id, sort_order);
CREATE INDEX nutrition_plan_meals_plan_idx
  ON public.nutrition_plan_meals (tenant_id, plan_id);

CREATE FUNCTION public.nutrition_plan_meals_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_day_id IS DISTINCT FROM OLD.plan_day_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_plan_meals identity columns are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_plan_meals_identity_guard
  BEFORE UPDATE ON public.nutrition_plan_meals
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plan_meals_identity_guard();

CREATE TRIGGER trg_nutrition_plan_meals_updated_at
  BEFORE UPDATE ON public.nutrition_plan_meals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_plan_meals ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plan_meals FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plan_meals TO service_role;

COMMIT;
