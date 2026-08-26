-- ============================================================
-- 20261228000000_nutrition_units.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Ölçü Birimi Kanonik Sözlüğü — Measurement Unit Canonical Vocabulary
-- Tablo: public.nutrition_units
--   (tenant'tan BAĞIMSIZ, GLOBAL, değişmez kanonik sistem kimlikleri sağlayan ölçü birimi
--    registry'si; yalnız AYNI FİZİKSEL BOYUT içinde güvenli dönüşüm faktörü taşır)
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.1
--
-- GLOBAL MODEL (BİLİNÇLİ): tenant_id YOKTUR. Ölçü birimi tenant'a göre çoğaltılmaz.
--   Doğuştan-kilitli server-only: RLS enable + anon/authenticated/PUBLIC REVOKE + service_role
--   REVOKE-sonra yalnız S/I/U/D GRANT (GRANT ALL DEĞİL).
--
-- KİMLİK: code kanonik sistem anahtarıdır (lowercase snake_case; normalizasyon/lower/btrim-fix YOK
--   — yanlış kod sessizce düzeltilmez, reddedilir). id + code + created_at IMMUTABLE (identity guard).
--   Yanlış kod = yeni satır + eskiyi is_active=false. code UPDATE YOK.
--
-- DÖNÜŞÜM KURALI (KRİTİK): base_unit_code + factor_to_base YALNIZ aynı fiziksel boyut içindeki güvenli
--   çevrimler içindir (mg↔g, kg↔g, ml↔l, kcal↔kj). household/count birimleri (cup/tbsp/tsp/serving/piece)
--   için base_unit_code = NULL; besne-bağımlı "cup→gram" gibi dönüşüm İDDİA EDİLMEZ. Pairing invariant
--   CHECK ile korunur (ikisi birlikte NULL ya da birlikte set + faktör > 0).
--
-- Deterministik/fail-fast: yalnız düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE / ON CONFLICT /
--   seed / extension YOK. public.set_updated_at() yalnız REUSE edilir (yeniden tanımlanmaz).
-- ============================================================

BEGIN;

-- ── 1) Global registry (tenant_id YOK) ──────────────────────────────────────
CREATE TABLE public.nutrition_units (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL,
  symbol          text        NOT NULL,
  name_tr         text        NOT NULL,
  name_en         text        NOT NULL,
  unit_type       text        NOT NULL,
  base_unit_code  text,
  factor_to_base  numeric,
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- code kanonik sistem anahtarı: lowercase ASCII, tek underscore ayrımı, ilk karakter harf.
  CONSTRAINT nutrition_units_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  -- boyut sınıflandırması (kontrollü değer).
  CONSTRAINT nutrition_units_unit_type_chk CHECK (
    unit_type IN ('mass', 'volume', 'energy', 'count', 'household', 'other')
  ),

  -- dönüşüm pairing invariant: ya ikisi de NULL (base/dönüştürülemez), ya ikisi de set + pozitif faktör.
  CONSTRAINT nutrition_units_conversion_chk CHECK (
    (base_unit_code IS NULL AND factor_to_base IS NULL)
    OR (base_unit_code IS NOT NULL AND factor_to_base IS NOT NULL AND factor_to_base > 0)
  ),

  -- global tekillik: code tüm sistemde tekil (tenant yok).
  CONSTRAINT nutrition_units_code_key UNIQUE (code),

  -- self-FK: base birim de bu tablodadır. Referanslı base silinemez (archive = is_active).
  CONSTRAINT nutrition_units_base_unit_fk
    FOREIGN KEY (base_unit_code)
    REFERENCES public.nutrition_units (code)
    ON DELETE RESTRICT
);

-- ── 2) Identity guard (id + code + created_at immutable; no-op SET izinli) ────
CREATE FUNCTION public.nutrition_units_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_units identity columns (id, code, created_at) are immutable; insert a new row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- İki user trigger. Alfabetik: identity_guard ÖNCE, updated_at SONRA.
CREATE TRIGGER trg_nutrition_units_identity_guard
  BEFORE UPDATE ON public.nutrition_units
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_units_identity_guard();

CREATE TRIGGER trg_nutrition_units_updated_at
  BEFORE UPDATE ON public.nutrition_units
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 3) Güvenlik: doğuştan-kilitli server-only (seed ayrı migration'da). ───────
ALTER TABLE public.nutrition_units ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_units FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_units FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_units TO service_role;

COMMIT;
