-- ============================================================
-- 20270101000200_nutrition_template_items.sql
--
-- Beslenme FAZ 6 — TEMPLATE ITEM. Plan item SNAPSHOT modelini BİREBİR aynalar (§13).
--   food_id soft lineage pointer (physical FK YOK — custom food silinse şablon yaşar; §14).
--   Snapshot server-authoritative; client GÖNDEREMEZ (§39). Nutrient /100g child tabloda.
-- PARENT CONSISTENCY: (tenant_id, template_id, template_meal_id)
--   → nutrition_template_meals (tenant_id, template_id, id) CASCADE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_template_items (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL,
  template_id               uuid        NOT NULL,
  template_meal_id          uuid        NOT NULL,
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

  CONSTRAINT nutrition_template_items_grams_chk CHECK (grams > 0),
  CONSTRAINT nutrition_template_items_quantity_chk CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT nutrition_template_items_food_name_chk CHECK (btrim(food_name_snapshot) <> ''),
  CONSTRAINT nutrition_template_items_ownership_chk CHECK (
    food_ownership_snapshot IN ('system', 'custom')
  ),
  CONSTRAINT nutrition_template_items_portion_gram_chk CHECK (
    portion_gram_snapshot IS NULL OR portion_gram_snapshot > 0
  ),

  CONSTRAINT nutrition_template_items_meal_fk
    FOREIGN KEY (tenant_id, template_id, template_meal_id)
    REFERENCES public.nutrition_template_meals (tenant_id, template_id, id)
    ON DELETE CASCADE,

  -- child (template_item_nutrients) kompozit FK hedefi: (tenant_id, id).
  CONSTRAINT nutrition_template_items_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX nutrition_template_items_meal_idx
  ON public.nutrition_template_items (tenant_id, template_meal_id, sort_order);
CREATE INDEX nutrition_template_items_template_idx
  ON public.nutrition_template_items (tenant_id, template_id);

CREATE FUNCTION public.nutrition_template_items_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_meal_id IS DISTINCT FROM OLD.template_meal_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_template_items identity columns are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_template_items_identity_guard
  BEFORE UPDATE ON public.nutrition_template_items
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_template_items_identity_guard();

CREATE TRIGGER trg_nutrition_template_items_updated_at
  BEFORE UPDATE ON public.nutrition_template_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_template_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_template_items FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_template_items TO service_role;

COMMIT;
