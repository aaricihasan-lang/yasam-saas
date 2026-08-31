-- ============================================================
-- 20261228000100_nutrition_nutrients.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Nutrient Kanonik Sözlüğü — Global Nutrient Vocabulary
-- Tablo: public.nutrition_nutrients
--   (tenant'tan BAĞIMSIZ global nutrient kimlikleri; besin değerleri BURADA DEĞİL —
--    Food↔Nutrient nicel ilişkisi Class B nutrition_food_nutrients'te normalized durur)
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.2
--
-- SIRALAMA: 20261228000000_nutrition_units'ten SONRA (default_unit_id → nutrition_units FK).
--   Circular dependency YOK: units nutrients'e referans vermez (tek yön).
--
-- GLOBAL MODEL: tenant_id YOKTUR. Doğuştan-kilitli server-only (units ile aynı desen).
-- KİMLİK: code lowercase snake_case, immutable (id + code + created_at). aliases = text[] (JSONB DEĞİL).
-- KAPSAM DIŞI: external provider metadata (USDA fdc no / INFOODS tagname) BU TABLOYA doldurulmaz —
--   dış-DB import future contract (R3). category tek enum (nutrient_class ayrı kolon AÇILMAZ).
--
-- Deterministik/fail-fast; public.set_updated_at() yalnız REUSE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_nutrients (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL,
  name_tr          text        NOT NULL,
  name_en          text        NOT NULL,
  aliases          text[]      NOT NULL DEFAULT '{}',
  category         text        NOT NULL,
  default_unit_id  uuid,
  description      text,
  sort_order       integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_nutrients_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  -- nutrient sınıflandırması (kontrollü değer; tek enum — redundant nutrient_class kolonu yok).
  CONSTRAINT nutrition_nutrients_category_chk CHECK (
    category IN ('energy', 'macronutrient', 'vitamin', 'mineral', 'fatty_acid', 'other')
  ),

  -- aliases dizisinde NULL eleman olamaz (text[] bütünlüğü).
  CONSTRAINT nutrition_nutrients_aliases_chk CHECK (
    array_position(aliases, NULL) IS NULL
  ),

  CONSTRAINT nutrition_nutrients_code_key UNIQUE (code),

  -- nullable default unit FK → nutrition_units(id). Referanslı unit silinemez (RESTRICT).
  CONSTRAINT nutrition_nutrients_default_unit_fk
    FOREIGN KEY (default_unit_id)
    REFERENCES public.nutrition_units (id)
    ON DELETE RESTRICT
);

-- default_unit_id lookup / FK delete-check (nullable partial index).
CREATE INDEX nutrition_nutrients_default_unit_idx
  ON public.nutrition_nutrients (default_unit_id)
  WHERE default_unit_id IS NOT NULL;

CREATE FUNCTION public.nutrition_nutrients_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_nutrients identity columns (id, code, created_at) are immutable; insert a new row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_nutrients_identity_guard
  BEFORE UPDATE ON public.nutrition_nutrients
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_nutrients_identity_guard();

CREATE TRIGGER trg_nutrition_nutrients_updated_at
  BEFORE UPDATE ON public.nutrition_nutrients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_nutrients ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_nutrients FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_nutrients FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_nutrients TO service_role;

COMMIT;
