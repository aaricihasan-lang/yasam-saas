-- 20261231000600_nutrition_plan_revise_fix.sql
-- ============================================================
-- FAZ 5 HOTFIX — nutrition_plan_revise: "FOR UPDATE is not allowed with
-- aggregate functions" (SQLSTATE 0A000).
--
-- KÖK NEDEN (20261231000500_nutrition_plan_rpcs.sql):
--   Race-safe revizyon numarası hesabı, agregat (max) ile FOR UPDATE'i AYNI
--   sorguda birleştiriyordu:
--     SELECT coalesce(max(revision_number),0)+1 INTO v_next
--     FROM public.nutrition_plans
--     WHERE tenant_id = ... AND plan_family_id = ...
--     FOR UPDATE;                       -- ❌ PostgreSQL 0A000
--   PostgreSQL agregat sorgularında satır kilidi (FOR UPDATE) kabul etmez;
--   fonksiyon HER ZAMAN hata verir → revizyon (V2+) hiç oluşturulamıyordu.
--
-- ÇÖZÜM:
--   Aile satırlarını ÖNCE ayrı bir PERFORM ... FOR UPDATE ile kilitle
--   (eşzamanlı revise çağrılarını serileştirmek için), SONRA agregatı
--   kilit olmadan hesapla. Davranış (aynı aile, revision=max+1, draft,
--   verbatim deep copy) korunur; yalnız 0A000 giderilir.
--
-- Yalnız CREATE OR REPLACE FUNCTION — imza değişmez, mevcut ACL korunur;
-- REVOKE/GRANT güvenlik kilidi bütünlük için yeniden ifade edilir.
-- İdempotent: tekrar uygulanabilir. Şema/tablo/RLS DEĞİŞMEZ.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nutrition_plan_revise(
  p_tenant_id      uuid,
  p_source_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_src     public.nutrition_plans%ROWTYPE;
  v_new_id  uuid := gen_random_uuid();
  v_next    integer;
  v_result  jsonb;
BEGIN
  SELECT * INTO v_src
  FROM public.nutrition_plans
  WHERE id = p_source_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;

  -- Race-safe next revision: önce aile satırlarını kilitle (FOR UPDATE agregat
  -- ile aynı sorguda kullanılamaz → 0A000), SONRA max revizyonu kilitsiz hesapla.
  PERFORM 1
  FROM public.nutrition_plans
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_src.plan_family_id
  FOR UPDATE;

  SELECT coalesce(max(revision_number), 0) + 1 INTO v_next
  FROM public.nutrition_plans
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_src.plan_family_id;

  INSERT INTO public.nutrition_plans (
    id, tenant_id, title, note, start_date, end_date,
    daily_energy_target, status, plan_family_id, revision_number
  ) VALUES (
    v_new_id, p_tenant_id, v_src.title, v_src.note, v_src.start_date, v_src.end_date,
    v_src.daily_energy_target, 'draft', v_src.plan_family_id, v_next
  );

  PERFORM public.nutrition_plan_copy_tree(p_tenant_id, p_source_plan_id, v_new_id, 0);

  SELECT to_jsonb(p) INTO v_result FROM public.nutrition_plans p WHERE p.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_revise(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_revise(uuid, uuid)
  TO service_role;

COMMIT;

-- ============================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   SELECT prosecdef FROM pg_proc WHERE proname = 'nutrition_plan_revise';   -- f (INVOKER)
--   SELECT has_function_privilege('anon',
--     'public.nutrition_plan_revise(uuid,uuid)','EXECUTE');                  -- false
--   SELECT has_function_privilege('authenticated',
--     'public.nutrition_plan_revise(uuid,uuid)','EXECUTE');                  -- false
--   SELECT has_function_privilege('service_role',
--     'public.nutrition_plan_revise(uuid,uuid)','EXECUTE');                  -- true
--   -- Fonksiyonel: owner bir plandan "Yeni Revizyon" → V2 draft (same family) oluşur.
-- ============================================================
