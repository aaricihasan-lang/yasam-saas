-- ============================================================
-- 20270101000300_nutrition_template_item_nutrients.sql
--
-- Beslenme FAZ 6 — TEMPLATE ITEM NUTRIENT SNAPSHOT. Plan item_nutrients'i aynalar (§11, §13).
--   Frozen /100 g nutrient set (string kod + amount + unit). Global vocab FK YOK.
--   IMMUTABLE: satırlar UPDATE edilmez (updated_at YOK); replace = sil + yeniden yaz.
-- PARENT CONSISTENCY: (tenant_id, item_id) → nutrition_template_items (tenant_id, id) CASCADE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_template_item_nutrients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  item_id       uuid        NOT NULL,
  nutrient_code text        NOT NULL,
  amount        numeric     NOT NULL,
  unit_code     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_template_item_nutrients_amount_chk CHECK (amount >= 0),
  CONSTRAINT nutrition_template_item_nutrients_nutrient_code_chk CHECK (btrim(nutrient_code) <> ''),
  CONSTRAINT nutrition_template_item_nutrients_unit_code_chk CHECK (btrim(unit_code) <> ''),

  CONSTRAINT nutrition_template_item_nutrients_natural_key UNIQUE (tenant_id, item_id, nutrient_code),

  CONSTRAINT nutrition_template_item_nutrients_item_fk
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES public.nutrition_template_items (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX nutrition_template_item_nutrients_item_idx
  ON public.nutrition_template_item_nutrients (tenant_id, item_id);

ALTER TABLE public.nutrition_template_item_nutrients ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_template_item_nutrients FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_template_item_nutrients TO service_role;

COMMIT;
