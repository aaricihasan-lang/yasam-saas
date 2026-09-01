-- ============================================================
-- 20270102000200_nutrition_client_allergens.sql
--
-- Beslenme FAZ 7 (Class C) — Danışanın BEYAN ETTİĞİ alerjenler (1:N).
-- Class A global vocab REUSE: allergen_id → public.nutrition_allergens(id).
-- Vocab YENİDEN yaratılmaz.
--
-- KRİTİK: food↔allergen mapping YOK → OTOMATİK alerji eşleme/uyarı/güvenlik
--   iddiası YOK. Bu tablo yalnız ADVISORY beyan kaydıdır (planı otomatik bloke etmez).
--
-- FK client CASCADE. Cross-tenant guard REUSE. RLS doğuştan-kilitli.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_client_allergens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  allergen_id uuid        NOT NULL REFERENCES public.nutrition_allergens(id) ON DELETE RESTRICT,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- danışan başına aynı alerjen tekil.
  CONSTRAINT nutrition_client_allergens_unique UNIQUE (tenant_id, client_id, allergen_id)
);

CREATE INDEX nutrition_client_allergens_tenant_client_idx
  ON public.nutrition_client_allergens (tenant_id, client_id);

CREATE TRIGGER trg_nutrition_client_allergens_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_client_allergens
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();

ALTER TABLE public.nutrition_client_allergens ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_client_allergens FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_client_allergens TO service_role;

COMMIT;
