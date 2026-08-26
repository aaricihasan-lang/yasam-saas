-- ============================================================
-- 20261228000400_nutrition_traditional_frameworks.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- Geleneksel Çerçeve Kanonik Sözlüğü — Traditional Framework Vocabulary
-- Tablo: public.nutrition_traditional_frameworks
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §D.5
--
-- KAPSAM (KRİTİK): bu tablo YALNIZ FRAMEWORK vocabulary'dir (mizac/blood_type/ayurveda/tcm/unani/other).
--   PROFİL kayıtları (Sıcak-Kuru / A / O / Vata / Pitta) BURAYA KONULMAZ → Class B nutrition_topics
--   (topic_type='traditional_profile', framework_id → bu tablo). framework-başına tablo (mizac_*/blood_type_*)
--   AÇILMAZ. Bilimsel doğruluk iddiası taşıyan alan YOK — yalnız sınıflandırma.
--
-- GLOBAL MODEL: tenant_id YOKTUR. Doğuştan-kilitli server-only.
-- KİMLİK: code lowercase snake_case (ör. 'blood_type'), immutable.
--
-- Deterministik/fail-fast; public.set_updated_at() yalnız REUSE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_traditional_frameworks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL,
  name_tr      text        NOT NULL,
  name_en      text        NOT NULL,
  description  text,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_traditional_frameworks_code_chk CHECK (
    code = btrim(code)
    AND code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
  ),

  CONSTRAINT nutrition_traditional_frameworks_code_key UNIQUE (code)
);

CREATE FUNCTION public.nutrition_traditional_frameworks_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.code       IS DISTINCT FROM OLD.code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_traditional_frameworks identity columns (id, code, created_at) are immutable; insert a new row and archive (is_active=false) the old one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_traditional_frameworks_identity_guard
  BEFORE UPDATE ON public.nutrition_traditional_frameworks
  FOR EACH ROW
  EXECUTE FUNCTION public.nutrition_traditional_frameworks_identity_guard();

CREATE TRIGGER trg_nutrition_traditional_frameworks_updated_at
  BEFORE UPDATE ON public.nutrition_traditional_frameworks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_traditional_frameworks ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_traditional_frameworks FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_traditional_frameworks FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nutrition_traditional_frameworks TO service_role;

COMMIT;
