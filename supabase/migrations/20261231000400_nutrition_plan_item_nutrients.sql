-- ============================================================
-- 20261231000400_nutrition_plan_item_nutrients.sql
--
-- Beslenme FAZ 5 / Plan Motoru — ITEM NUTRIENT SNAPSHOT. §11
--
-- NORMALIZED (JSONB DEĞİL): item'ın hesap-anındaki /100 g nutrient setini string kod +
--   amount + unit kodu olarak DONDURUR. Global nutrition_nutrients / nutrition_units FK YOK
--   (snapshot vocabulary future'da değişse bile historical plan değişmez; §11, §13).
--
-- amount: frozen /100 g source value (grams/100 × amount → item katkısı; hesap planEngine/calc).
--
-- IMMUTABLE snapshot: satırlar UPDATE edilmez; food replace/grams edit'te item'a ait set
--   TÜMÜYLE silinip yeniden yazılır (atomik; RPC). Bu yüzden updated_at YOK.
--
-- PARENT CONSISTENCY (§9): (tenant_id, item_id) → nutrition_plan_items (tenant_id, id) CASCADE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plan_item_nutrients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  item_id       uuid        NOT NULL,
  nutrient_code text        NOT NULL,
  amount        numeric     NOT NULL,
  unit_code     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plan_item_nutrients_amount_chk CHECK (amount >= 0),
  CONSTRAINT nutrition_plan_item_nutrients_nutrient_code_chk CHECK (btrim(nutrient_code) <> ''),
  CONSTRAINT nutrition_plan_item_nutrients_unit_code_chk CHECK (btrim(unit_code) <> ''),

  -- item başına nutrient tekil (aynı nutrient iki kez donmaz).
  CONSTRAINT nutrition_plan_item_nutrients_natural_key UNIQUE (tenant_id, item_id, nutrient_code),

  -- tenant-safe composite FK → item CASCADE (item silinince snapshot da gider).
  CONSTRAINT nutrition_plan_item_nutrients_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES public.nutrition_plan_items (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX nutrition_plan_item_nutrients_item_idx
  ON public.nutrition_plan_item_nutrients (tenant_id, item_id);

ALTER TABLE public.nutrition_plan_item_nutrients ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plan_item_nutrients FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plan_item_nutrients TO service_role;

COMMIT;
