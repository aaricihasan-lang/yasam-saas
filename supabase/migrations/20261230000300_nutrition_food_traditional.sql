-- ============================================================
-- 20261230000300_nutrition_food_traditional.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 4 / Besin Motoru (Class B)
-- Besin-İÇSEL geleneksel/mizaç niteliği. §2.4
--
-- NUTRIENT FACTS'TEN TAMAMEN AYRI kavram katmanı. Bu tablo yalnız besnin
--   intrinsic geleneksel niteliğini (Soğuk/Yaş gibi) taşır.
-- Profile↔food İLİŞKİSİ ("Safra için uygun") BURADA DUPLICATE EDİLMEZ —
--   o ilişki mevcut nutrition_topic_foods üzerinden reuse edilir.
-- mizac_* tablo ailesi YARATILMAZ (tek generic food-metadata tablosu).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_food_traditional (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  food_id           uuid        NOT NULL,
  framework_id      uuid,
  thermal_quality   text,
  moisture_quality  text,
  notes             text,
  source_id         uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- kontrollü vocabulary (geleneksel tıp nitelikleri; klinik iddia DEĞİL).
  CONSTRAINT nutrition_food_traditional_thermal_chk CHECK (
    thermal_quality IS NULL OR thermal_quality IN ('hot', 'cold', 'neutral')
  ),
  CONSTRAINT nutrition_food_traditional_moisture_chk CHECK (
    moisture_quality IS NULL OR moisture_quality IN ('wet', 'dry', 'neutral')
  ),

  -- besin başına tek geleneksel kayıt.
  CONSTRAINT nutrition_food_traditional_food_key UNIQUE (tenant_id, food_id),

  CONSTRAINT nutrition_food_traditional_food_fk
    FOREIGN KEY (tenant_id, food_id)
    REFERENCES public.nutrition_foods (tenant_id, id)
    ON DELETE CASCADE,

  -- Class A çerçeve sözlüğü (mizac/blood_type/…) — global, RESTRICT.
  CONSTRAINT nutrition_food_traditional_framework_fk
    FOREIGN KEY (framework_id)
    REFERENCES public.nutrition_traditional_frameworks (id)
    ON DELETE RESTRICT,

  CONSTRAINT nutrition_food_traditional_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.nutrition_sources (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX nutrition_food_traditional_food_idx
  ON public.nutrition_food_traditional (tenant_id, food_id);

CREATE TRIGGER trg_nutrition_food_traditional_updated_at
  BEFORE UPDATE ON public.nutrition_food_traditional
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_food_traditional ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_food_traditional FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_food_traditional TO service_role;

COMMIT;
