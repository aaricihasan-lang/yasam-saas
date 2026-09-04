-- ============================================================
-- 20261230000200_nutrition_food_external_refs.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 4 / Besin Motoru (Class B)
-- Dış-kaynak (provider) izlenebilirlik + duplicate-import engeli. §2.3
--
-- provider v1: usda_fdc (CC0/public domain — import edilebilir), manual (uzman girişi).
--   turkomp yalnız ENUM olarak geleceğe hazır — TİCARİ LİSANS alınmadan VERİ GİRMEZ (§6).
-- RAW provider JSON SAKLANMAZ; yalnız content_hash (değişiklik tespiti).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_external_refs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  food_id          uuid        NOT NULL,
  provider         text        NOT NULL,
  external_id      text        NOT NULL,
  external_dataset text,
  external_version text,
  source_url       text,
  retrieved_at     timestamptz,
  content_hash     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_food_external_refs_provider_chk CHECK (
    provider IN ('usda_fdc', 'turkomp', 'manual')
  ),
  CONSTRAINT nutrition_food_external_refs_external_id_chk CHECK (btrim(external_id) <> ''),

  -- aynı provider+external_id bir tenant içinde tek kez (duplicate import engeli).
  CONSTRAINT nutrition_food_external_refs_natural_key UNIQUE (tenant_id, provider, external_id),

  CONSTRAINT nutrition_food_external_refs_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX nutrition_food_external_refs_food_idx
  ON public.nutrition_food_external_refs (tenant_id, food_id);

CREATE TRIGGER trg_nutrition_food_external_refs_updated_at
  BEFORE UPDATE ON public.nutrition_food_external_refs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_external_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_external_refs FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_external_refs TO service_role;

COMMIT;
