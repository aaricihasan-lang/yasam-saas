-- ============================================================
-- 20270102000100_nutrition_client_measurements.sql
--
-- Beslenme FAZ 7 (Class C) — Danışan antropometrik ölçüm GEÇMİŞİ (1:N, tarihli).
-- Kilo/bel/kalça zaman serisi (profesyonel takip; tek current-field yetersiz — §13).
-- Aynı gün birden çok ölçüm mümkün → (client,date) UNIQUE YOK.
-- BMI SAKLANMAZ (computed/display-time; nutrition_formulas registry).
-- FK client CASCADE. Cross-tenant guard REUSE. RLS doğuştan-kilitli.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_client_measurements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg   numeric     NOT NULL,
  height_cm   numeric,
  waist_cm    numeric,
  hip_cm      numeric,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_client_measurements_weight_chk CHECK (weight_kg > 0 AND weight_kg <= 500),
  CONSTRAINT nutrition_client_measurements_height_chk CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 300)),
  CONSTRAINT nutrition_client_measurements_waist_chk  CHECK (waist_cm  IS NULL OR (waist_cm  > 0 AND waist_cm  <= 400)),
  CONSTRAINT nutrition_client_measurements_hip_chk    CHECK (hip_cm    IS NULL OR (hip_cm    > 0 AND hip_cm    <= 400))
);

CREATE INDEX nutrition_client_measurements_tenant_client_date_idx
  ON public.nutrition_client_measurements (tenant_id, client_id, measured_at DESC);

CREATE TRIGGER trg_nutrition_client_measurements_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_client_measurements
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();

ALTER TABLE public.nutrition_client_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_client_measurements FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_client_measurements TO service_role;

COMMIT;
