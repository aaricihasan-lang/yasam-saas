-- ============================================================
-- 20261231000300_nutrition_plan_items.sql
--
-- Beslenme FAZ 5 / Plan Motoru — ITEM (öğün besin satırı). §10 — EN KRİTİK.
--
-- SNAPSHOT KONTRATI (§10, §12, §13): item, food'un HESAP-ANI görüntüsünü DONDURUR.
--   food_name_snapshot / food_ownership_snapshot / portion_label/gram_snapshot /
--   external_provider/version_snapshot server-authoritative yazılır (client GÖNDEREMEZ).
--   Nutrient /100 g değerleri ayrı child tabloda (nutrition_plan_item_nutrients) donar.
--   Canlı food update ya da custom food silinmesi historical planı ASLA değiştirmez.
--
-- food_id: YALNIZ soft lineage pointer — PHYSICAL FK YOK (BİLİNÇLİ):
--   • SYSTEM food farklı sentinel tenant'ta (composite tenant FK kurulamaz),
--   • custom food sonradan silinebilir; historical plan bozulmamalı.
--
-- PARENT CONSISTENCY (§9): (tenant_id, plan_id, meal_id) → nutrition_plan_meals
--   (tenant_id, plan_id, id) CASCADE.
--
-- grams canonical hesap tabanı (portion seçilse bile grams = quantity × portion_gram_snapshot
--   server'da çözülüp buraya yazılır; §14). Hesap: nutrient_total = grams/100 × snapshot_amount.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plan_items (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  plan_id                   uuid        NOT NULL,
  meal_id                   uuid        NOT NULL,
  food_id                   uuid,       -- soft lineage pointer; physical FK YOK (bilinçli).
  grams                     numeric     NOT NULL,
  quantity                  numeric,
  food_name_snapshot        text        NOT NULL,
  food_ownership_snapshot   text        NOT NULL,
  portion_label_snapshot    text,
  portion_gram_snapshot     numeric,
  external_provider_snapshot text,
  external_version_snapshot text,
  sort_order                integer     NOT NULL DEFAULT 0,
  note                      text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plan_items_grams_chk CHECK (grams > 0),
  CONSTRAINT nutrition_plan_items_quantity_chk CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT nutrition_plan_items_food_name_chk CHECK (btrim(food_name_snapshot) <> ''),
  CONSTRAINT nutrition_plan_items_ownership_chk CHECK (
    food_ownership_snapshot IN ('system', 'custom')
  ),
  CONSTRAINT nutrition_plan_items_portion_gram_chk CHECK (
    portion_gram_snapshot IS NULL OR portion_gram_snapshot > 0
  ),

  -- tenant-safe composite FK → meal CASCADE (öğün silinince item'lar da gider).
  CONSTRAINT nutrition_plan_items_meal_fk
    FOREIGN KEY (tenant_id, plan_id, meal_id)
    REFERENCES public.nutrition_plan_meals (tenant_id, plan_id, id)
    ON DELETE CASCADE,

  -- child (item_nutrients) kompozit FK hedefi: (tenant_id, id).
  CONSTRAINT nutrition_plan_items_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX nutrition_plan_items_meal_idx
  ON public.nutrition_plan_items (tenant_id, meal_id, sort_order);
CREATE INDEX nutrition_plan_items_plan_idx
  ON public.nutrition_plan_items (tenant_id, plan_id);
CREATE INDEX nutrition_plan_items_food_idx
  ON public.nutrition_plan_items (tenant_id, food_id) WHERE food_id IS NOT NULL;

CREATE FUNCTION public.nutrition_plan_items_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.meal_id IS DISTINCT FROM OLD.meal_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_plan_items identity columns are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_plan_items_identity_guard
  BEFORE UPDATE ON public.nutrition_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plan_items_identity_guard();

CREATE TRIGGER trg_nutrition_plan_items_updated_at
  BEFORE UPDATE ON public.nutrition_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_plan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plan_items FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plan_items TO service_role;

COMMIT;
