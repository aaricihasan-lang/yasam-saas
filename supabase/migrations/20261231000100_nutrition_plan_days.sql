-- ============================================================
-- 20261231000100_nutrition_plan_days.sql
--
-- Beslenme FAZ 5 / Plan Motoru — DAY (dense materialized). §7
--
-- DENSE model: plan create'te start_date..end_date arasındaki HER gün için bir row
--   materialize edilir (RPC). Gerekçe: günlük override + günlük note + copy-day stabil
--   kimliği + boş gün de explicit state. 30 satır çok küçük.
--
-- PARENT CONSISTENCY (§9): (tenant_id, plan_id) → nutrition_plans(tenant_id, id) CASCADE.
--   plan_id taşınır → child'lar (meal/item) day'e (tenant_id, plan_id, id) ile bağlanır;
--   böylece "meal plan X + day plan Y" bozuk state DB seviyesinde İMKANSIZ.
--
-- energy_target_override: günlük hedef (NULL → plan default kullanılır; §16).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plan_days (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL,
  plan_id               uuid        NOT NULL,
  plan_date             date        NOT NULL,
  energy_target_override numeric,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plan_days_target_chk CHECK (
    energy_target_override IS NULL OR energy_target_override > 0
  ),

  -- tenant-safe composite FK → plan CASCADE (plan silinince günler de gider).
  CONSTRAINT nutrition_plan_days_plan_fk
    FOREIGN KEY (tenant_id, plan_id)
    REFERENCES public.nutrition_plans (tenant_id, id)
    ON DELETE CASCADE,

  -- plan içinde gün tekil (dense; aynı tarih iki kez materialize edilemez).
  CONSTRAINT nutrition_plan_days_plan_date_key UNIQUE (tenant_id, plan_id, plan_date),

  -- child (meal) kompozit FK hedefi: (tenant_id, plan_id, id).
  CONSTRAINT nutrition_plan_days_plan_id_key UNIQUE (tenant_id, plan_id, id)
);

CREATE INDEX nutrition_plan_days_plan_idx
  ON public.nutrition_plan_days (tenant_id, plan_id, plan_date);

CREATE FUNCTION public.nutrition_plan_days_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_date IS DISTINCT FROM OLD.plan_date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_plan_days identity columns are immutable (id, tenant_id, plan_id, plan_date, created_at)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_plan_days_identity_guard
  BEFORE UPDATE ON public.nutrition_plan_days
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plan_days_identity_guard();

CREATE TRIGGER trg_nutrition_plan_days_updated_at
  BEFORE UPDATE ON public.nutrition_plan_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_plan_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plan_days FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plan_days TO service_role;

COMMIT;
