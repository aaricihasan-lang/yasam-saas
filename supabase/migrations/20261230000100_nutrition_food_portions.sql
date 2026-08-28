-- ============================================================
-- 20261230000100_nutrition_food_portions.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 4 / Besin Motoru (Class B)
-- Food porsiyon / ev ölçüsü → GRAM köprüsü. §2.2
--
-- KÖPRÜ: gram_weight besne-özeldir (units tablosu household/count birimlerinde
--   base conversion'ı NULL bırakır — "1 su bardağı → gram" ancak burada bilinir).
-- Hesap: portion → grams = quantity × gram_weight → /100 g nutrient hesabı.
-- Ağır conversion engine YOK.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_portions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  food_id         uuid        NOT NULL,
  label_tr        text        NOT NULL,
  label_en        text,
  quantity        numeric     NOT NULL DEFAULT 1,
  measure_unit_id uuid        NOT NULL,
  gram_weight     numeric     NOT NULL,
  is_default      boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 0,
  source_id       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_food_portions_label_chk CHECK (btrim(label_tr) <> ''),
  CONSTRAINT nutrition_food_portions_quantity_chk CHECK (quantity > 0),
  CONSTRAINT nutrition_food_portions_gram_chk CHECK (gram_weight > 0),

  CONSTRAINT nutrition_food_portions_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE CASCADE,

  CONSTRAINT nutrition_food_portions_unit_fk
    FOREIGN KEY (measure_unit_id)
    REFERENCES public.nutrition_units (id)
    ON DELETE RESTRICT,

  CONSTRAINT nutrition_food_portions_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.nutrition_sources (tenant_id, id)
    ON DELETE RESTRICT
);

-- besin içinde etiket tekil (normalize: lower+btrim).
CREATE UNIQUE INDEX nutrition_food_portions_food_label_uidx
  ON public.nutrition_food_portions (tenant_id, food_id, lower(btrim(label_tr)));

CREATE INDEX nutrition_food_portions_food_idx
  ON public.nutrition_food_portions (tenant_id, food_id);

CREATE TRIGGER trg_nutrition_food_portions_updated_at
  BEFORE UPDATE ON public.nutrition_food_portions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_portions ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_portions FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_portions TO service_role;

COMMIT;
