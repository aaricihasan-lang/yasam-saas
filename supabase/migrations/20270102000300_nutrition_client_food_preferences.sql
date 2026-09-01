-- ============================================================
-- 20270102000300_nutrition_client_food_preferences.sql
--
-- Beslenme FAZ 7 (Class C) — Danışanın tercih ettiği / kaçındığı besinler (1:N).
-- LIVE preference (plan item SNAPSHOT'tan farklı; dondurulmaz).
--
-- food_id = SOFT POINTER (physical FK YOK) — custom food silinebilir; historical
--   plan item deseniyle aynı gerekçe. food_label her zaman doludur (free-text VEYA
--   seçilen besin adı cache'i) → besin silinse de anlamlı görünür.
--
-- Server, food_id doluysa SYSTEM sentinel tenant VEYA caller tenant custom food
--   olduğunu doğrular (üçüncü tenant besini reddedilir) — DB burada tenant guard
--   yalnız client tutarlılığını zorlar; food ownership app-layer'da doğrulanır.
--
-- FK client CASCADE. Cross-tenant (client) guard REUSE. RLS doğuştan-kilitli.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_client_food_preferences (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  client_id  uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stance     text        NOT NULL,
  food_id    uuid,
  food_label text        NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_client_food_pref_stance_chk CHECK (stance IN ('preferred','avoided')),
  CONSTRAINT nutrition_client_food_pref_label_chk  CHECK (btrim(food_label) <> '')
);

CREATE INDEX nutrition_client_food_pref_tenant_client_idx
  ON public.nutrition_client_food_preferences (tenant_id, client_id, stance);

CREATE TRIGGER trg_nutrition_client_food_pref_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_client_food_preferences
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();

ALTER TABLE public.nutrition_client_food_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_client_food_preferences FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_client_food_preferences TO service_role;

COMMIT;
