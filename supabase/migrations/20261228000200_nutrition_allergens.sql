-- ============================================================
-- 20261228000200_nutrition_allergens.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Alerjen Kanonik Sözlüğü — Global Allergen Vocabulary
-- Tablo: public.nutrition_allergens
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.3
--
-- GLOBAL MODEL: tenant_id YOKTUR. Doğuştan-kilitli server-only.
-- KAPSAM KARARI: global canonical + tek is_major bayrağı. Region-specific regulatory engine YOK;
--   EU/Türkiye/ABD mevzuatı tek doğru gibi hard-code EDİLMEZ. Region metadata = future contract.
-- KİMLİK: code lowercase snake_case, immutable. aliases = text[].
--
-- Deterministik/fail-fast; public.set_updated_at() yalnız REUSE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_allergens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL,
  name_tr      text        NOT NULL,
  name_en      text        NOT NULL,
  aliases      text[]      NOT NULL DEFAULT '{}',
  description  text,
  is_major     boolean     NOT NULL DEFAULT false,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_allergens_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  CONSTRAINT nutrition_allergens_aliases_chk CHECK (
    array_position(aliases, NULL) IS NULL
  ),

  CONSTRAINT nutrition_allergens_code_key UNIQUE (code)
);

CREATE FUNCTION public.nutrition_allergens_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_allergens identity columns (id, code, created_at) are immutable; insert a new row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_allergens_identity_guard
  BEFORE UPDATE ON public.nutrition_allergens
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_allergens_identity_guard();

CREATE TRIGGER trg_nutrition_allergens_updated_at
  BEFORE UPDATE ON public.nutrition_allergens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_allergens ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_allergens FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_allergens FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_allergens TO service_role;

COMMIT;
