-- ============================================================
-- 20261230000000_nutrition_food_nutrients.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 4 / Besin Motoru (Class B)
-- Food ↔ Nutrient nicel kompozisyon (normalized). §2.1
--
-- KANONİK KONTRAT: HER SATIR 100 g food içindir (basis_grams = 100 invariant).
--   Provider farklı basis verirse import sırasında /100 g normalize edilir.
--   Hesap: nutrient_total = grams / 100 × amount  (tek, deterministik).
--
-- unit↔nutrient boyut uyumu server validator ile fail-closed (energy→kcal, makro→g,
--   mineral→mg, vitamin→mg/mcg). DB CHECK nutrient kategorisine JOIN gerektirmez;
--   kategori-uyumu app-layer'da (contracts.assertNutrientUnit).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_nutrients (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  food_id      uuid        NOT NULL,
  nutrient_id  uuid        NOT NULL,
  amount       numeric     NOT NULL,
  unit_id      uuid        NOT NULL,
  basis_grams  numeric     NOT NULL DEFAULT 100,
  source_id    uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- besin başına nutrient tekil (aynı nutrient iki kez girilemez).
  CONSTRAINT nutrition_food_nutrients_natural_key UNIQUE (tenant_id, food_id, nutrient_id),

  -- negatif nutrient engeli.
  CONSTRAINT nutrition_food_nutrients_amount_chk CHECK (amount >= 0),

  -- KANONİK INVARIANT: her değer /100 g. per-serving/per-cup storage YOK.
  CONSTRAINT nutrition_food_nutrients_basis_chk CHECK (basis_grams = 100),

  -- tenant-safe composite FK → food CASCADE (besin silinince kompozisyon da gider).
  CONSTRAINT nutrition_food_nutrients_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE CASCADE,

  -- global nutrient sözlüğü (RESTRICT: kullanılan nutrient silinemez).
  CONSTRAINT nutrition_food_nutrients_nutrient_fk
    FOREIGN KEY (nutrient_id)
    REFERENCES public.nutrition_nutrients (id)
    ON DELETE RESTRICT,

  -- global birim sözlüğü (RESTRICT).
  CONSTRAINT nutrition_food_nutrients_unit_fk
    FOREIGN KEY (unit_id)
    REFERENCES public.nutrition_units (id)
    ON DELETE RESTRICT,

  -- opsiyonel değer-kaynağı (tenant-safe; nullable → MATCH SIMPLE ile null iken kontrol edilmez).
  CONSTRAINT nutrition_food_nutrients_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.nutrition_sources (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX nutrition_food_nutrients_food_idx
  ON public.nutrition_food_nutrients (tenant_id, food_id);
CREATE INDEX nutrition_food_nutrients_nutrient_idx
  ON public.nutrition_food_nutrients (nutrient_id);
CREATE INDEX nutrition_food_nutrients_source_idx
  ON public.nutrition_food_nutrients (tenant_id, source_id)
  WHERE source_id IS NOT NULL;

CREATE TRIGGER trg_nutrition_food_nutrients_updated_at
  BEFORE UPDATE ON public.nutrition_food_nutrients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_nutrients ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_nutrients FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_nutrients TO service_role;

COMMIT;
