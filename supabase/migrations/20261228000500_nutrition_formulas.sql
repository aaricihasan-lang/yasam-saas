-- ============================================================
-- 20261228000500_nutrition_formulas.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Hesaplama Metadata Registry — Calculation Formula Metadata Registry (versiyonlu)
-- Tablo: public.nutrition_formulas
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.6
--
-- ══ KRİTİK GÜVENLİK KONTRATI ══
-- BU TABLO BİR FORMÜL ÇALIŞTIRMA MOTORU DEĞİLDİR. DB yalnız METADATA tutar.
--   equation_display: insan-okur formül STRING'i (UI/rapor gösterimi) — ASLA execute edilmez.
--   config/required_inputs: structured JSONB metadata — DB'de değerlendirilmez.
-- Gerçek hesaplama ileride lib/nutrition/calc/* altında ALLOWLIST'li, audited implementation'larla yapılır
--   (key = code; code→impl yoksa server hesaplamayı REDDEDER = fail-closed). Bu migration hiçbir yerde
--   eval / dynamic SQL / EXECUTE / plpgsql-dinamik-değerlendirme İÇERMEZ.
--
-- GLOBAL MODEL: tenant_id YOKTUR. Doğuştan-kilitli server-only.
-- VERSİYONLAMA: UNIQUE (code, version). Yanlış formül = yeni version satırı + eskiyi is_active=false.
--   Identity guard: id + code + created_at + version immutable.
-- KAYNAK: source_reference = SİSTEM formül metadata künyesi; Class B kullanıcı Sources sekmesi DEĞİL.
--
-- Deterministik/fail-fast; public.set_updated_at() yalnız REUSE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_formulas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text        NOT NULL,
  name_tr           text        NOT NULL,
  name_en           text        NOT NULL,
  version           integer     NOT NULL DEFAULT 1,
  purpose           text        NOT NULL,
  population_scope  text        NOT NULL DEFAULT 'general',
  required_inputs   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  equation_display  text        NOT NULL,
  config            jsonb,
  source_reference  text,
  limitations       text,
  is_active         boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_formulas_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  -- ne hesapladığının kontrollü sınıfı.
  CONSTRAINT nutrition_formulas_purpose_chk CHECK (
    purpose IN ('bmi', 'bmr', 'tdee', 'body_fat', 'ideal_weight', 'ratio', 'other')
  ),

  CONSTRAINT nutrition_formulas_version_chk CHECK (version >= 1),

  -- JSONB tip disiplini (metadata; DB'de execute edilmez).
  CONSTRAINT nutrition_formulas_required_inputs_is_array_chk CHECK (
    jsonb_typeof(required_inputs) = 'array'
  ),
  CONSTRAINT nutrition_formulas_config_is_object_chk CHECK (
    config IS NULL OR jsonb_typeof(config) = 'object'
  ),

  -- versiyonlu tekillik (diğer Class A vocab'daki UNIQUE(code)'un gerekçeli farkı).
  CONSTRAINT nutrition_formulas_code_version_key UNIQUE (code, version)
);

CREATE FUNCTION public.nutrition_formulas_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.version    IS DISTINCT FROM OLD.version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_formulas identity columns (id, code, version, created_at) are immutable; insert a new version row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_formulas_identity_guard
  BEFORE UPDATE ON public.nutrition_formulas
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_formulas_identity_guard();

CREATE TRIGGER trg_nutrition_formulas_updated_at
  BEFORE UPDATE ON public.nutrition_formulas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_formulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_formulas FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_formulas FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_formulas TO service_role;

COMMIT;
