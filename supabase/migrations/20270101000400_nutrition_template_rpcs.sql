-- ============================================================
-- 20270101000400_nutrition_template_rpcs.sql
--
-- Beslenme FAZ 6 — TEMPLATE compound operations (atomik). §15
--
-- Hepsi: SECURITY INVOKER, SET search_path=pg_catalog,public, REVOKE PUBLIC/anon/authenticated,
--   GRANT EXECUTE service_role only. tenant_id API'den gelir (client'tan DEĞİL).
-- Snapshot server-authoritative: create_from_* kaynak plan ağacını DB'den okur, verbatim dondurur
--   (client food_name/nutrient/ownership SPOOF EDEMEZ; §39). Apply = verbatim deep-copy, yeni IDs.
--
-- Error kodları plan motoruyla ORTAK (mapRpcError): 45010 archived, 45012 target_not_empty,
--   45014 not_found.
--
-- Fonksiyonlar:
--   nutrition_template_create_from_meal(tenant, source_meal, title, note) → template jsonb
--   nutrition_template_create_from_day (tenant, source_day,  title, note) → template jsonb
--   nutrition_template_apply_meal(tenant, template, target_plan, target_day) → {ok,target_day_id}  (APPEND)
--   nutrition_template_apply_day (tenant, template, target_plan, target_day) → {ok,target_day_id}  (target BOŞ)
--   nutrition_template_duplicate (tenant, template, title) → template jsonb
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) create_from_meal: plan öğününü 'meal' şablonuna verbatim dondurur.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_create_from_meal(
  p_tenant_id      uuid,
  p_source_meal_id uuid,
  p_title          text,
  p_note           text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_new_id  uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_meals
                 WHERE tenant_id = p_tenant_id AND id = p_source_meal_id) THEN
    RAISE EXCEPTION 'nutrition_source_meal_not_found' USING ERRCODE = '45014';
  END IF;

  INSERT INTO public.nutrition_templates (id, tenant_id, template_type, title, note)
  VALUES (v_new_id, p_tenant_id, 'meal', p_title, p_note);

  WITH m AS MATERIALIZED (
    SELECT mm.id AS old_meal_id, gen_random_uuid() AS new_meal_id,
           mm.meal_type, mm.label, 0 AS sort_order, mm.energy_target, mm.note
    FROM public.nutrition_plan_meals mm
    WHERE mm.tenant_id = p_tenant_id AND mm.id = p_source_meal_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_template_meals (
      id, tenant_id, template_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, v_new_id, meal_type, label, sort_order, energy_target, note
    FROM m
    RETURNING 1
  ),
  i AS MATERIALIZED (
    SELECT it.id AS old_item_id, gen_random_uuid() AS new_item_id, m.new_meal_id,
           it.food_id, it.grams, it.quantity, it.food_name_snapshot, it.food_ownership_snapshot,
           it.portion_label_snapshot, it.portion_gram_snapshot,
           it.external_provider_snapshot, it.external_version_snapshot, it.sort_order, it.note
    FROM public.nutrition_plan_items it
    JOIN m ON m.old_meal_id = it.meal_id
    WHERE it.tenant_id = p_tenant_id
  ),
  ins_i AS (
    INSERT INTO public.nutrition_template_items (
      id, tenant_id, template_id, template_meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, v_new_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_template_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, nn.nutrient_code, nn.amount, nn.unit_code
  FROM public.nutrition_plan_item_nutrients nn
  JOIN i ON i.old_item_id = nn.item_id
  WHERE nn.tenant_id = p_tenant_id;

  SELECT to_jsonb(t) INTO v_result FROM public.nutrition_templates t WHERE t.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_create_from_meal(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_create_from_meal(uuid, uuid, text, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) create_from_day: plan gününün tüm öğünlerini 'day' şablonuna verbatim dondurur.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_create_from_day(
  p_tenant_id     uuid,
  p_source_day_id uuid,
  p_title         text,
  p_note          text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_new_id  uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND id = p_source_day_id) THEN
    RAISE EXCEPTION 'nutrition_source_day_not_found' USING ERRCODE = '45014';
  END IF;

  INSERT INTO public.nutrition_templates (id, tenant_id, template_type, title, note)
  VALUES (v_new_id, p_tenant_id, 'day', p_title, p_note);

  WITH m AS MATERIALIZED (
    SELECT mm.id AS old_meal_id, gen_random_uuid() AS new_meal_id,
           mm.meal_type, mm.label, mm.sort_order, mm.energy_target, mm.note
    FROM public.nutrition_plan_meals mm
    WHERE mm.tenant_id = p_tenant_id AND mm.plan_day_id = p_source_day_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_template_meals (
      id, tenant_id, template_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, v_new_id, meal_type, label, sort_order, energy_target, note
    FROM m
    RETURNING 1
  ),
  i AS MATERIALIZED (
    SELECT it.id AS old_item_id, gen_random_uuid() AS new_item_id, m.new_meal_id,
           it.food_id, it.grams, it.quantity, it.food_name_snapshot, it.food_ownership_snapshot,
           it.portion_label_snapshot, it.portion_gram_snapshot,
           it.external_provider_snapshot, it.external_version_snapshot, it.sort_order, it.note
    FROM public.nutrition_plan_items it
    JOIN m ON m.old_meal_id = it.meal_id
    WHERE it.tenant_id = p_tenant_id
  ),
  ins_i AS (
    INSERT INTO public.nutrition_template_items (
      id, tenant_id, template_id, template_meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, v_new_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_template_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, nn.nutrient_code, nn.amount, nn.unit_code
  FROM public.nutrition_plan_item_nutrients nn
  JOIN i ON i.old_item_id = nn.item_id
  WHERE nn.tenant_id = p_tenant_id;

  SELECT to_jsonb(t) INTO v_result FROM public.nutrition_templates t WHERE t.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_create_from_day(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_create_from_day(uuid, uuid, text, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- INTERNAL: şablon öğünlerini hedef plan gününe kopyalar (verbatim, yeni IDs).
--   p_sort_base: hedef gün öğün sort_order taban ofseti (append için). Sahiplik/archived ÇAĞIRAN'da.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_emit_into_day(
  p_tenant_id     uuid,
  p_template_id   uuid,
  p_target_plan_id uuid,
  p_target_day_id uuid,
  p_sort_base     integer
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  WITH m AS MATERIALIZED (
    SELECT tm.id AS old_meal_id, gen_random_uuid() AS new_meal_id,
           tm.meal_type, tm.label, tm.sort_order + p_sort_base AS sort_order, tm.energy_target, tm.note
    FROM public.nutrition_template_meals tm
    WHERE tm.tenant_id = p_tenant_id AND tm.template_id = p_template_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_plan_meals (
      id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, p_target_plan_id, p_target_day_id, meal_type, label, sort_order, energy_target, note
    FROM m
    RETURNING 1
  ),
  i AS MATERIALIZED (
    SELECT ti.id AS old_item_id, gen_random_uuid() AS new_item_id, m.new_meal_id,
           ti.food_id, ti.grams, ti.quantity, ti.food_name_snapshot, ti.food_ownership_snapshot,
           ti.portion_label_snapshot, ti.portion_gram_snapshot,
           ti.external_provider_snapshot, ti.external_version_snapshot, ti.sort_order, ti.note
    FROM public.nutrition_template_items ti
    JOIN m ON m.old_meal_id = ti.template_meal_id
    WHERE ti.tenant_id = p_tenant_id
  ),
  ins_i AS (
    INSERT INTO public.nutrition_plan_items (
      id, tenant_id, plan_id, meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, p_target_plan_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, tn.nutrient_code, tn.amount, tn.unit_code
  FROM public.nutrition_template_item_nutrients tn
  JOIN i ON i.old_item_id = tn.item_id
  WHERE tn.tenant_id = p_tenant_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_emit_into_day(uuid, uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_emit_into_day(uuid, uuid, uuid, uuid, integer)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) apply_meal: şablon öğün(ler)ini hedef güne EKLER (append). §15
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_apply_meal(
  p_tenant_id      uuid,
  p_template_id    uuid,
  p_target_plan_id uuid,
  p_target_day_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_base   integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_templates
                 WHERE tenant_id = p_tenant_id AND id = p_template_id) THEN
    RAISE EXCEPTION 'nutrition_template_not_found' USING ERRCODE = '45014';
  END IF;

  SELECT status INTO v_status FROM public.nutrition_plans
  WHERE id = p_target_plan_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND plan_id = p_target_plan_id AND id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_day_not_found' USING ERRCODE = '45014';
  END IF;

  SELECT coalesce(max(sort_order), -1) + 1 INTO v_base
  FROM public.nutrition_plan_meals
  WHERE tenant_id = p_tenant_id AND plan_day_id = p_target_day_id;

  PERFORM public.nutrition_template_emit_into_day(p_tenant_id, p_template_id, p_target_plan_id, p_target_day_id, v_base);

  RETURN jsonb_build_object('ok', true, 'target_day_id', p_target_day_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_apply_meal(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_apply_meal(uuid, uuid, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4) apply_day: şablon gününü hedef güne uygular; hedef gün BOŞ olmalı (45012). §21
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_apply_day(
  p_tenant_id      uuid,
  p_template_id    uuid,
  p_target_plan_id uuid,
  p_target_day_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_templates
                 WHERE tenant_id = p_tenant_id AND id = p_template_id) THEN
    RAISE EXCEPTION 'nutrition_template_not_found' USING ERRCODE = '45014';
  END IF;

  SELECT status INTO v_status FROM public.nutrition_plans
  WHERE id = p_target_plan_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND plan_id = p_target_plan_id AND id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_day_not_found' USING ERRCODE = '45014';
  END IF;

  IF EXISTS (SELECT 1 FROM public.nutrition_plan_meals
             WHERE tenant_id = p_tenant_id AND plan_day_id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_not_empty' USING ERRCODE = '45012';
  END IF;

  PERFORM public.nutrition_template_emit_into_day(p_tenant_id, p_template_id, p_target_plan_id, p_target_day_id, 0);

  RETURN jsonb_build_object('ok', true, 'target_day_id', p_target_day_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_apply_day(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_apply_day(uuid, uuid, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) duplicate: şablonu yeni şablona verbatim deep-copy.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_template_duplicate(
  p_tenant_id   uuid,
  p_template_id uuid,
  p_title       text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_src     public.nutrition_templates%ROWTYPE;
  v_new_id  uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  SELECT * INTO v_src FROM public.nutrition_templates
  WHERE id = p_template_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_template_not_found' USING ERRCODE = '45014';
  END IF;

  INSERT INTO public.nutrition_templates (id, tenant_id, template_type, title, note)
  VALUES (v_new_id, p_tenant_id, v_src.template_type,
          coalesce(NULLIF(btrim(coalesce(p_title, '')), ''), v_src.title || ' (Kopya)'),
          v_src.note);

  WITH m AS MATERIALIZED (
    SELECT tm.id AS old_meal_id, gen_random_uuid() AS new_meal_id,
           tm.meal_type, tm.label, tm.sort_order, tm.energy_target, tm.note
    FROM public.nutrition_template_meals tm
    WHERE tm.tenant_id = p_tenant_id AND tm.template_id = p_template_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_template_meals (
      id, tenant_id, template_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, v_new_id, meal_type, label, sort_order, energy_target, note
    FROM m
    RETURNING 1
  ),
  i AS MATERIALIZED (
    SELECT ti.id AS old_item_id, gen_random_uuid() AS new_item_id, m.new_meal_id,
           ti.food_id, ti.grams, ti.quantity, ti.food_name_snapshot, ti.food_ownership_snapshot,
           ti.portion_label_snapshot, ti.portion_gram_snapshot,
           ti.external_provider_snapshot, ti.external_version_snapshot, ti.sort_order, ti.note
    FROM public.nutrition_template_items ti
    JOIN m ON m.old_meal_id = ti.template_meal_id
    WHERE ti.tenant_id = p_tenant_id
  ),
  ins_i AS (
    INSERT INTO public.nutrition_template_items (
      id, tenant_id, template_id, template_meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, v_new_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_template_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, tn.nutrient_code, tn.amount, tn.unit_code
  FROM public.nutrition_template_item_nutrients tn
  JOIN i ON i.old_item_id = tn.item_id
  WHERE tn.tenant_id = p_tenant_id;

  SELECT to_jsonb(t) INTO v_result FROM public.nutrition_templates t WHERE t.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_template_duplicate(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_template_duplicate(uuid, uuid, text)
  TO service_role;

COMMIT;
