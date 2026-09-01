-- ============================================================
-- 20270102000500_nutrition_client_rpcs.sql
--
-- Beslenme FAZ 7 — Plan↔Danışan atama RPC'si (server-authoritative, atomik).
--
-- nutrition_plan_assign_client(p_tenant_id, p_plan_id, p_client_id, p_assigned_by):
--   1. plan → family/tenant resolve (yoksa 45014).
--   2. client tenant ownership doğrula (yoksa/foreign 45020).
--   3. mevcut binding oku (FOR UPDATE):
--        - yok  → §11 archived-guard: family'de archived revizyon varsa 45022 (historical
--                 recipient'i sonradan yazma yasağı), yoksa INSERT.
--        - aynı client → idempotent (mevcut binding döner).
--        - farklı client → 45021 PLAN_CLIENT_IMMUTABLE (reassign yasak, §4/§11).
--   Unassign YOK. SECURITY INVOKER + fixed search_path + service_role-only EXECUTE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nutrition_plan_assign_client(
  p_tenant_id   uuid,
  p_plan_id     uuid,
  p_client_id   uuid,
  p_assigned_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_family    uuid;
  v_existing  uuid;
  v_archived  boolean;
  v_result    jsonb;
BEGIN
  -- 1. plan → family
  SELECT plan_family_id INTO v_family
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;

  -- 2. client ownership (tenant tutarlılığı)
  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'nutrition_client_not_found' USING ERRCODE = '45020';
  END IF;

  -- 3. mevcut binding (family satırlarını serileştir)
  SELECT client_id INTO v_existing
  FROM public.nutrition_plan_clients
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_family
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing = p_client_id THEN
      -- idempotent: aynı danışan
      SELECT to_jsonb(b) INTO v_result
      FROM public.nutrition_plan_clients b
      WHERE b.tenant_id = p_tenant_id AND b.plan_family_id = v_family;
      RETURN v_result;
    ELSE
      RAISE EXCEPTION 'nutrition_plan_client_immutable' USING ERRCODE = '45021';
    END IF;
  END IF;

  -- binding yok → §11 archived-guard
  SELECT EXISTS (
    SELECT 1 FROM public.nutrition_plans
    WHERE tenant_id = p_tenant_id AND plan_family_id = v_family AND status = 'archived'
  ) INTO v_archived;
  IF v_archived THEN
    RAISE EXCEPTION 'nutrition_plan_family_archived_no_bind' USING ERRCODE = '45022';
  END IF;

  INSERT INTO public.nutrition_plan_clients (tenant_id, plan_family_id, client_id, assigned_by)
  VALUES (p_tenant_id, v_family, p_client_id, p_assigned_by);

  SELECT to_jsonb(b) INTO v_result
  FROM public.nutrition_plan_clients b
  WHERE b.tenant_id = p_tenant_id AND b.plan_family_id = v_family;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_assign_client(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_assign_client(uuid, uuid, uuid, uuid)
  TO service_role;

COMMIT;
