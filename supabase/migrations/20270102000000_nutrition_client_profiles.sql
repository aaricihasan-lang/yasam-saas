-- ============================================================
-- 20270102000000_nutrition_client_profiles.sql
--
-- Beslenme FAZ 7 — Danışan Yolculuğu Entegrasyonu (Class C: CLIENT PRIVATE).
-- Danışan-özel beslenme profili (değerlendirme). 1:1 canonical public.clients.
--
-- KİMLİK DUPLICATE ETMEZ: ad/soyad/telefon/dogum/kan/mizac clients'ta zaten var;
--   burada TEKRAR saklanmaz. clients.kan + clients.mizac read-only integrative
--   context olarak REUSE edilir (bu tabloya kopyalanmaz).
--
-- TENANT-PRIVATE + client-scoped. Doğuştan-kilitli RLS (ENABLE + REVOKE
--   anon/authenticated/PUBLIC + GRANT service_role). FK client_id → clients(id)
--   ON DELETE CASCADE → danışan hard-delete edilince profil de silinir.
--
-- CROSS-TENANT GUARD (bu migration'da tanımlanır, sonraki Class C tabloları REUSE eder):
--   public.nutrition_client_tenant_guard() — BEFORE INSERT/UPDATE: NEW.client_id'nin
--   clients'ta NEW.tenant_id ile eşleştiğini DB seviyesinde doğrular (clients'ta
--   composite UNIQUE(tenant_id,id) olmadığı için composite-FK yerine trigger).
--   Böylece cross-tenant satır DB seviyesinde imkansız (yalnız server guard'a bağlı değil).
--
-- Klinik/tanısal alan YOK (§8): yalnız non-diagnostic professional planning bağlamı.
-- set_updated_at() REUSE. Seed/extension YOK.
-- ============================================================

BEGIN;

-- ── Paylaşılan cross-tenant guard (Class C tablolarının tümü kullanır) ──
CREATE FUNCTION public.nutrition_client_tenant_guard()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = NEW.client_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'nutrition client row tenant/client mismatch (client_id % not in tenant %)',
      NEW.client_id, NEW.tenant_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.nutrition_client_profiles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  client_id        uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  goal_type        text,
  goal_note        text,
  activity_level   text,
  dietary_pattern  text,
  daily_meal_count integer,
  target_weight_kg numeric,
  water_note       text,
  lifestyle_note   text,
  general_note     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_client_profiles_goal_chk CHECK (
    goal_type IS NULL OR goal_type IN
    ('weight_loss','weight_gain','maintenance','muscle_gain','healthy_lifestyle','other')
  ),
  CONSTRAINT nutrition_client_profiles_activity_chk CHECK (
    activity_level IS NULL OR activity_level IN
    ('sedentary','light','moderate','active','very_active')
  ),
  CONSTRAINT nutrition_client_profiles_meal_count_chk CHECK (
    daily_meal_count IS NULL OR (daily_meal_count >= 1 AND daily_meal_count <= 12)
  ),
  CONSTRAINT nutrition_client_profiles_target_weight_chk CHECK (
    target_weight_kg IS NULL OR (target_weight_kg >= 20 AND target_weight_kg <= 500)
  ),

  -- 1:1 danışan başına tek profil.
  CONSTRAINT nutrition_client_profiles_client_key UNIQUE (tenant_id, client_id)
);

CREATE INDEX nutrition_client_profiles_tenant_client_idx
  ON public.nutrition_client_profiles (tenant_id, client_id);

CREATE TRIGGER trg_nutrition_client_profiles_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();

CREATE TRIGGER trg_nutrition_client_profiles_updated_at
  BEFORE UPDATE ON public.nutrition_client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_client_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_client_profiles FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_client_profiles TO service_role;

COMMIT;
