-- ============================================================
-- 20261231000000_nutrition_plans.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 5 / Profesyonel Öğün + Plan Motoru
-- PLAN kökü (tenant-private operational planner data — Class B DEĞİL). §5, §6
--
-- SINIRLAR (bu faz): standalone plan. client_id / danışan FK YOK (future-additive).
--   Plan verisi owner-only shell içinde kullanılır. Danışan bağlanması EN SON ayrı faz.
--
-- TENANT-PRIVATE: tenant_id NOT NULL (app-layer + composite FK izolasyon; public.tenants FK yok —
--   FAZ 4 nutrition_foods deseniyle birebir). Doğuştan-kilitli RLS: ENABLE + REVOKE
--   anon/authenticated/PUBLIC + GRANT ALL service_role.
--
-- REVISION KİMLİĞİ: (plan_family_id, revision_number). İlk create'te family = plan.id
--   (deterministik; RPC set eder). UNIQUE(tenant_id, plan_family_id, revision_number).
--
-- LIFECYCLE: draft/active editable; archived IMMUTABLE (mutation server/RPC enforce; §17,§18).
--
-- Kimlik guard: id + tenant_id + plan_family_id + created_at immutable. set_updated_at() REUSE.
-- Deterministik/fail-fast: seed / extension YOK.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  title               text        NOT NULL,
  note                text,
  start_date          date        NOT NULL,
  end_date            date        NOT NULL,
  daily_energy_target numeric,
  status              text        NOT NULL DEFAULT 'draft',
  plan_family_id      uuid        NOT NULL,
  revision_number     integer     NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plans_title_chk CHECK (btrim(title) <> ''),
  CONSTRAINT nutrition_plans_date_range_chk CHECK (end_date >= start_date),
  CONSTRAINT nutrition_plans_energy_target_chk CHECK (
    daily_energy_target IS NULL OR daily_energy_target > 0
  ),
  CONSTRAINT nutrition_plans_status_chk CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT nutrition_plans_revision_chk CHECK (revision_number > 0),

  -- kompozit tenant-safe FK hedefi (days (tenant_id, plan_id) ile bağlanır).
  CONSTRAINT nutrition_plans_tenant_id_key UNIQUE (tenant_id, id),

  -- revizyon kimliği: aynı aile içinde revizyon numarası tekil.
  CONSTRAINT nutrition_plans_family_revision_key UNIQUE (tenant_id, plan_family_id, revision_number)
);

CREATE INDEX nutrition_plans_tenant_status_idx
  ON public.nutrition_plans (tenant_id, status, updated_at DESC);
CREATE INDEX nutrition_plans_tenant_family_idx
  ON public.nutrition_plans (tenant_id, plan_family_id, revision_number);
CREATE INDEX nutrition_plans_tenant_range_idx
  ON public.nutrition_plans (tenant_id, start_date, end_date);

CREATE FUNCTION public.nutrition_plans_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.plan_family_id IS DISTINCT FROM OLD.plan_family_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_plans identity columns (id, tenant_id, plan_family_id, created_at) are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_plans_identity_guard
  BEFORE UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plans_identity_guard();

CREATE TRIGGER trg_nutrition_plans_updated_at
  BEFORE UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plans FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plans TO service_role;

COMMIT;
