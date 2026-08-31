-- ============================================================
-- 20261231000500_nutrition_plan_rpcs.sql
--
-- Beslenme FAZ 5 / Plan Motoru — ATOMİK RPC/fonksiyon seti. §22, §23
--
-- Compound write'lar TEK transaction (PL/pgSQL gövdesi) — partial state İMKANSIZ:
--   plan+günler, item+nutrient snapshot, deep copy (gün/öğün/hafta/plan/revizyon).
--
-- GÜVENLİK (her fonksiyon): SECURITY INVOKER (yetki yükseltmesi YOK; service_role çağırır),
--   sabit search_path, REVOKE anon/authenticated/PUBLIC + GRANT EXECUTE yalnız service_role.
--   tenant_id İSTEMCİDEN gelmez (API guard verir). Snapshot alanları server-authoritative
--   (client hesap/isim/ownership gönderemez; §12).
--
-- ARCHIVED IMMUTABILITY (§18): archived plana dokunan tüm mutation fonksiyonları 45010 raise.
--
-- SQLSTATE HATA KODLARI:
--   45010 PLAN_ARCHIVED     — archived plan mutation reddi
--   45011 RANGE_HAS_CONTENT — shrink: aralık dışına düşen dolu gün var (ZERO deletion)
--   45012 TARGET_NOT_EMPTY  — copy hedef günü boş değil
--   45013 RANGE_OUT_OF_BOUNDS — week-copy kaynak/hedef günleri plan aralığı dışında
--   45014 NOT_FOUND         — plan/gün/öğün/item bulunamadı veya bu tenant'a ait değil
--   45015 BAD_INPUT         — geçersiz tarih/span
--
-- DEEP COPY tekniği: tek statement, MATERIALIZED CTE + gen_random_uuid() ile id remap
--   (gün→öğün→item→nutrient). Snapshot VERBATIM kopyalanır (food DB tekrar OKUNMAZ; §21).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) create_with_days: plan + start..end dense day rows (atomik). §6, §7
--    family = plan.id (deterministik), revision = 1, status = p_status.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_create_with_days(
  p_tenant_id           uuid,
  p_title               text,
  p_start_date          date,
  p_end_date            date,
  p_daily_energy_target numeric,
  p_note                text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_plan_id uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'nutrition_plan_bad_range' USING ERRCODE = '45015';
  END IF;
  IF (p_end_date - p_start_date) > 366 THEN
    RAISE EXCEPTION 'nutrition_plan_range_too_long' USING ERRCODE = '45015';
  END IF;

  INSERT INTO public.nutrition_plans (
    id, tenant_id, title, note, start_date, end_date,
    daily_energy_target, status, plan_family_id, revision_number
  ) VALUES (
    v_plan_id, p_tenant_id, p_title, p_note, p_start_date, p_end_date,
    p_daily_energy_target, 'draft', v_plan_id, 1
  );

  INSERT INTO public.nutrition_plan_days (tenant_id, plan_id, plan_date)
  SELECT p_tenant_id, v_plan_id, g.d::date
  FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS g(d);

  SELECT to_jsonb(p) INTO v_result FROM public.nutrition_plans p WHERE p.id = v_plan_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_create_with_days(uuid, text, date, date, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_create_with_days(uuid, text, date, date, numeric, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) sync_range: aralık genişlet (eksik günleri idempotent materialize) /
--    daralt (aralık dışı DOLU gün varsa 45011; yalnız BOŞ günler silinir). §20
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_sync_range(
  p_tenant_id  uuid,
  p_plan_id    uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'nutrition_plan_bad_range' USING ERRCODE = '45015';
  END IF;
  IF (p_end_date - p_start_date) > 366 THEN
    RAISE EXCEPTION 'nutrition_plan_range_too_long' USING ERRCODE = '45015';
  END IF;

  SELECT status INTO v_status
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  -- Aralık dışına düşen ve DOLU (öğünü olan) gün varsa reddet (ZERO deletion).
  IF EXISTS (
    SELECT 1
    FROM public.nutrition_plan_days d
    WHERE d.tenant_id = p_tenant_id AND d.plan_id = p_plan_id
      AND (d.plan_date < p_start_date OR d.plan_date > p_end_date)
      AND EXISTS (
        SELECT 1 FROM public.nutrition_plan_meals m
        WHERE m.tenant_id = p_tenant_id AND m.plan_day_id = d.id
      )
  ) THEN
    RAISE EXCEPTION 'nutrition_plan_range_has_content' USING ERRCODE = '45011';
  END IF;

  -- Aralık dışı BOŞ günleri sil.
  DELETE FROM public.nutrition_plan_days d
  WHERE d.tenant_id = p_tenant_id AND d.plan_id = p_plan_id
    AND (d.plan_date < p_start_date OR d.plan_date > p_end_date);

  -- Eksik günleri idempotent ekle (ON CONFLICT DO NOTHING — natural key gün tekilliği).
  INSERT INTO public.nutrition_plan_days (tenant_id, plan_id, plan_date)
  SELECT p_tenant_id, p_plan_id, g.d::date
  FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS g(d)
  ON CONFLICT (tenant_id, plan_id, plan_date) DO NOTHING;

  UPDATE public.nutrition_plans
  SET start_date = p_start_date, end_date = p_end_date
  WHERE id = p_plan_id AND tenant_id = p_tenant_id;

  SELECT to_jsonb(p) INTO v_result FROM public.nutrition_plans p WHERE p.id = p_plan_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_sync_range(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_sync_range(uuid, uuid, date, date)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) item_create_or_replace: item + nutrient snapshot atomik. §10, §13, §34
--    p_item_id NULL → yeni item; dolu → aynı item'ı REPLACE (food replace / grams+portion).
--    p_snapshot / p_nutrients server-authoritative (planEngine food'tan üretir).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_item_create_or_replace(
  p_tenant_id uuid,
  p_meal_id   uuid,
  p_item_id   uuid,       -- NULL = create, dolu = replace
  p_food_id   uuid,       -- soft pointer (nullable)
  p_grams     numeric,
  p_quantity  numeric,
  p_snapshot  jsonb,      -- { food_name, food_ownership, portion_label, portion_gram,
                          --   external_provider, external_version, note, sort_order }
  p_nutrients jsonb       -- [ { nutrient_code, amount, unit_code } ]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_plan_id uuid;
  v_status  text;
  v_item_id uuid;
  v_sort    integer;
  v_result  jsonb;
BEGIN
  IF p_grams IS NULL OR p_grams <= 0 THEN
    RAISE EXCEPTION 'nutrition_plan_bad_grams' USING ERRCODE = '45015';
  END IF;

  -- Meal + plan status (archived deny).
  SELECT m.plan_id, p.status INTO v_plan_id, v_status
  FROM public.nutrition_plan_meals m
  JOIN public.nutrition_plans p ON p.tenant_id = m.tenant_id AND p.id = m.plan_id
  WHERE m.tenant_id = p_tenant_id AND m.id = p_meal_id
  FOR UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_meal_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  IF p_item_id IS NULL THEN
    -- append sort_order (öğün sonuna).
    SELECT coalesce(max(sort_order), -1) + 1 INTO v_sort
    FROM public.nutrition_plan_items
    WHERE tenant_id = p_tenant_id AND meal_id = p_meal_id;

    INSERT INTO public.nutrition_plan_items (
      tenant_id, plan_id, meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    ) VALUES (
      p_tenant_id, v_plan_id, p_meal_id, p_food_id, p_grams, p_quantity,
      p_snapshot->>'food_name', p_snapshot->>'food_ownership',
      NULLIF(btrim(coalesce(p_snapshot->>'portion_label', '')), ''),
      NULLIF(p_snapshot->>'portion_gram', '')::numeric,
      NULLIF(btrim(coalesce(p_snapshot->>'external_provider', '')), ''),
      NULLIF(btrim(coalesce(p_snapshot->>'external_version', '')), ''),
      coalesce((p_snapshot->>'sort_order')::int, v_sort),
      NULLIF(btrim(coalesce(p_snapshot->>'note', '')), '')
    )
    RETURNING id INTO v_item_id;
  ELSE
    -- REPLACE: item aynı meal/tenant olmalı (kilit).
    PERFORM 1 FROM public.nutrition_plan_items
    WHERE tenant_id = p_tenant_id AND id = p_item_id AND meal_id = p_meal_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nutrition_plan_item_not_found' USING ERRCODE = '45014';
    END IF;
    v_item_id := p_item_id;

    UPDATE public.nutrition_plan_items SET
      food_id = p_food_id,
      grams = p_grams,
      quantity = p_quantity,
      food_name_snapshot = p_snapshot->>'food_name',
      food_ownership_snapshot = p_snapshot->>'food_ownership',
      portion_label_snapshot = NULLIF(btrim(coalesce(p_snapshot->>'portion_label', '')), ''),
      portion_gram_snapshot = NULLIF(p_snapshot->>'portion_gram', '')::numeric,
      external_provider_snapshot = NULLIF(btrim(coalesce(p_snapshot->>'external_provider', '')), ''),
      external_version_snapshot = NULLIF(btrim(coalesce(p_snapshot->>'external_version', '')), ''),
      note = NULLIF(btrim(coalesce(p_snapshot->>'note', '')), '')
    WHERE tenant_id = p_tenant_id AND id = v_item_id;

    -- Eski nutrient snapshot'ı tümüyle sil (atomik replace).
    DELETE FROM public.nutrition_plan_item_nutrients
    WHERE tenant_id = p_tenant_id AND item_id = v_item_id;
  END IF;

  -- Nutrient snapshot yaz (frozen /100 g). Boş/duplicate güvenli (natural key dedup ON CONFLICT).
  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, v_item_id,
         e->>'nutrient_code',
         (e->>'amount')::numeric,
         e->>'unit_code'
  FROM jsonb_array_elements(coalesce(p_nutrients, '[]'::jsonb)) AS e
  WHERE btrim(coalesce(e->>'nutrient_code', '')) <> ''
    AND btrim(coalesce(e->>'unit_code', '')) <> ''
    AND coalesce((e->>'amount')::numeric, -1) >= 0
  ON CONFLICT (tenant_id, item_id, nutrient_code) DO NOTHING;

  SELECT to_jsonb(it) INTO v_result FROM public.nutrition_plan_items it WHERE it.id = v_item_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_item_create_or_replace(uuid, uuid, uuid, uuid, numeric, numeric, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_item_create_or_replace(uuid, uuid, uuid, uuid, numeric, numeric, jsonb, jsonb)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4) item_copy: item + nutrient snapshot'ı hedef öğüne VERBATIM kopyala (duplicate / taşı-kopya).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_item_copy(
  p_tenant_id     uuid,
  p_item_id       uuid,
  p_target_meal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_plan_id uuid;
  v_status  text;
  v_new_id  uuid := gen_random_uuid();
  v_sort    integer;
  v_result  jsonb;
BEGIN
  -- hedef öğün + plan status.
  SELECT m.plan_id, p.status INTO v_plan_id, v_status
  FROM public.nutrition_plan_meals m
  JOIN public.nutrition_plans p ON p.tenant_id = m.tenant_id AND p.id = m.plan_id
  WHERE m.tenant_id = p_tenant_id AND m.id = p_target_meal_id
  FOR UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_meal_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  -- kaynak item bu tenant'a ait olmalı.
  IF NOT EXISTS (
    SELECT 1 FROM public.nutrition_plan_items
    WHERE tenant_id = p_tenant_id AND id = p_item_id
  ) THEN
    RAISE EXCEPTION 'nutrition_plan_item_not_found' USING ERRCODE = '45014';
  END IF;

  SELECT coalesce(max(sort_order), -1) + 1 INTO v_sort
  FROM public.nutrition_plan_items
  WHERE tenant_id = p_tenant_id AND meal_id = p_target_meal_id;

  INSERT INTO public.nutrition_plan_items (
    id, tenant_id, plan_id, meal_id, food_id, grams, quantity,
    food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
    external_provider_snapshot, external_version_snapshot, sort_order, note
  )
  SELECT v_new_id, p_tenant_id, v_plan_id, p_target_meal_id, food_id, grams, quantity,
         food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
         external_provider_snapshot, external_version_snapshot, v_sort, note
  FROM public.nutrition_plan_items
  WHERE tenant_id = p_tenant_id AND id = p_item_id;

  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, v_new_id, nutrient_code, amount, unit_code
  FROM public.nutrition_plan_item_nutrients
  WHERE tenant_id = p_tenant_id AND item_id = p_item_id;

  SELECT to_jsonb(it) INTO v_result FROM public.nutrition_plan_items it WHERE it.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_item_copy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_item_copy(uuid, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) day_copy: kaynak günün öğün/item/nutrient ağacını hedef güne DEEP COPY. §21
--    Hedef gün BOŞ olmalı (dolu → 45012). Snapshot verbatim.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_day_copy(
  p_tenant_id     uuid,
  p_plan_id       uuid,
  p_source_day_id uuid,
  p_target_day_id uuid
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
  SELECT status INTO v_status
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id AND id = p_source_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_source_day_not_found' USING ERRCODE = '45014';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id AND id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_day_not_found' USING ERRCODE = '45014';
  END IF;

  -- hedef gün boş olmalı.
  IF EXISTS (SELECT 1 FROM public.nutrition_plan_meals
             WHERE tenant_id = p_tenant_id AND plan_day_id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_not_empty' USING ERRCODE = '45012';
  END IF;

  PERFORM public.nutrition_plan_copy_meals_into_day(p_tenant_id, p_plan_id, p_target_day_id, 0, NULL, p_source_day_id);

  RETURN jsonb_build_object('ok', true, 'target_day_id', p_target_day_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_day_copy(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_day_copy(uuid, uuid, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- INTERNAL: kaynak öğün(ler)i hedef güne kopyalar (öğün→item→nutrient remap tek statement).
--   p_source_day_id verilirse o günün TÜM öğünleri; p_source_meal_id verilirse tek öğün.
--   p_sort_base: hedef öğün sort_order taban ofseti (meal-copy append için).
--   SECURITY INVOKER; yalnız service_role EXECUTE. Sahiplik/archived kontrolü ÇAĞIRAN'da.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_copy_meals_into_day(
  p_tenant_id      uuid,
  p_plan_id        uuid,
  p_target_day_id  uuid,
  p_sort_base      integer,
  p_source_meal_id uuid,   -- NULL → tüm gün; dolu → tek öğün
  p_source_day_id  uuid    -- p_source_meal_id NULL iken kullanılır
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  WITH m AS MATERIALIZED (
    SELECT mm.id AS old_meal_id, gen_random_uuid() AS new_meal_id,
           mm.meal_type, mm.label, mm.sort_order + p_sort_base AS sort_order,
           mm.energy_target, mm.note
    FROM public.nutrition_plan_meals mm
    WHERE mm.tenant_id = p_tenant_id
      AND ( (p_source_meal_id IS NOT NULL AND mm.id = p_source_meal_id)
         OR (p_source_meal_id IS NULL AND mm.plan_day_id = p_source_day_id) )
  ),
  ins_m AS (
    INSERT INTO public.nutrition_plan_meals (
      id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, p_plan_id, p_target_day_id, meal_type, label, sort_order, energy_target, note
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
    INSERT INTO public.nutrition_plan_items (
      id, tenant_id, plan_id, meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, p_plan_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, nn.nutrient_code, nn.amount, nn.unit_code
  FROM public.nutrition_plan_item_nutrients nn
  JOIN i ON i.old_item_id = nn.item_id
  WHERE nn.tenant_id = p_tenant_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_copy_meals_into_day(uuid, uuid, uuid, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_copy_meals_into_day(uuid, uuid, uuid, integer, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 6) meal_copy: tek öğünü hedef güne DEEP COPY (append sort_order). §21
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_meal_copy(
  p_tenant_id      uuid,
  p_plan_id        uuid,
  p_source_meal_id uuid,
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
  SELECT status INTO v_status
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_meals
                 WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id AND id = p_source_meal_id) THEN
    RAISE EXCEPTION 'nutrition_plan_source_meal_not_found' USING ERRCODE = '45014';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nutrition_plan_days
                 WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id AND id = p_target_day_id) THEN
    RAISE EXCEPTION 'nutrition_plan_target_day_not_found' USING ERRCODE = '45014';
  END IF;

  -- append: hedef günün mevcut öğün sayısı kadar sort ofseti (source meal sort_order + base).
  SELECT coalesce(max(sort_order), -1) + 1 INTO v_base
  FROM public.nutrition_plan_meals
  WHERE tenant_id = p_tenant_id AND plan_day_id = p_target_day_id;

  PERFORM public.nutrition_plan_copy_meals_into_day(p_tenant_id, p_plan_id, p_target_day_id, v_base, p_source_meal_id, NULL);

  RETURN jsonb_build_object('ok', true, 'target_day_id', p_target_day_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_meal_copy(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_meal_copy(uuid, uuid, uuid, uuid)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 7) week_copy: kaynak span (p_span_days) günleri hedef span'e date-offset mapping DEEP COPY. §21
--    Tüm kaynak+hedef günleri plan aralığında olmalı (45013). Tüm hedef günler BOŞ olmalı (45012). Atomik.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_week_copy(
  p_tenant_id    uuid,
  p_plan_id      uuid,
  p_source_start date,
  p_target_start date,
  p_span_days    integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_offset integer := p_target_start - p_source_start;
BEGIN
  IF p_span_days IS NULL OR p_span_days < 1 OR p_span_days > 31 THEN
    RAISE EXCEPTION 'nutrition_plan_bad_span' USING ERRCODE = '45015';
  END IF;

  SELECT status INTO v_status
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'nutrition_plan_archived' USING ERRCODE = '45010';
  END IF;

  -- Tüm kaynak günler mevcut olmalı.
  IF EXISTS (
    SELECT 1 FROM generate_series(0, p_span_days - 1) AS g(off)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.nutrition_plan_days d
      WHERE d.tenant_id = p_tenant_id AND d.plan_id = p_plan_id
        AND d.plan_date = p_source_start + g.off
    )
  ) THEN
    RAISE EXCEPTION 'nutrition_plan_source_out_of_bounds' USING ERRCODE = '45013';
  END IF;

  -- Tüm hedef günler mevcut olmalı.
  IF EXISTS (
    SELECT 1 FROM generate_series(0, p_span_days - 1) AS g(off)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.nutrition_plan_days d
      WHERE d.tenant_id = p_tenant_id AND d.plan_id = p_plan_id
        AND d.plan_date = p_target_start + g.off
    )
  ) THEN
    RAISE EXCEPTION 'nutrition_plan_target_out_of_bounds' USING ERRCODE = '45013';
  END IF;

  -- Tüm hedef günler BOŞ olmalı.
  IF EXISTS (
    SELECT 1 FROM public.nutrition_plan_days d
    JOIN public.nutrition_plan_meals m ON m.tenant_id = d.tenant_id AND m.plan_day_id = d.id
    WHERE d.tenant_id = p_tenant_id AND d.plan_id = p_plan_id
      AND d.plan_date BETWEEN p_target_start AND p_target_start + (p_span_days - 1)
  ) THEN
    RAISE EXCEPTION 'nutrition_plan_target_not_empty' USING ERRCODE = '45012';
  END IF;

  -- Deep copy: gün-eşleme (src_day → tgt_day) üzerinden öğün→item→nutrient remap (tek statement).
  WITH dm AS MATERIALIZED (
    SELECT sd.id AS src_day_id, td.id AS tgt_day_id
    FROM public.nutrition_plan_days sd
    JOIN public.nutrition_plan_days td
      ON td.tenant_id = sd.tenant_id AND td.plan_id = sd.plan_id
     AND td.plan_date = sd.plan_date + v_offset
    WHERE sd.tenant_id = p_tenant_id AND sd.plan_id = p_plan_id
      AND sd.plan_date BETWEEN p_source_start AND p_source_start + (p_span_days - 1)
  ),
  m AS MATERIALIZED (
    SELECT mm.id AS old_meal_id, gen_random_uuid() AS new_meal_id, dm.tgt_day_id,
           mm.meal_type, mm.label, mm.sort_order, mm.energy_target, mm.note
    FROM public.nutrition_plan_meals mm
    JOIN dm ON dm.src_day_id = mm.plan_day_id
    WHERE mm.tenant_id = p_tenant_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_plan_meals (
      id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, p_plan_id, tgt_day_id, meal_type, label, sort_order, energy_target, note
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
    INSERT INTO public.nutrition_plan_items (
      id, tenant_id, plan_id, meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, p_plan_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, nn.nutrient_code, nn.amount, nn.unit_code
  FROM public.nutrition_plan_item_nutrients nn
  JOIN i ON i.old_item_id = nn.item_id
  WHERE nn.tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'span_days', p_span_days);
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_week_copy(uuid, uuid, date, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_week_copy(uuid, uuid, date, date, integer)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- INTERNAL: plan'ın TÜM gün/öğün/item/nutrient ağacını yeni plana DEEP COPY.
--   Yeni günler p_date_offset kadar kaydırılır (0 = aynı tarih). Tek statement remap.
--   Yeni plan row'u ÇAĞIRAN oluşturur (bu fonksiyon yalnız çocuk ağacı kopyalar).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_copy_tree(
  p_tenant_id     uuid,
  p_source_plan_id uuid,
  p_new_plan_id   uuid,
  p_date_offset   integer
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  WITH d AS MATERIALIZED (
    SELECT dd.id AS old_day_id, gen_random_uuid() AS new_day_id,
           dd.plan_date + p_date_offset AS new_date, dd.energy_target_override, dd.note
    FROM public.nutrition_plan_days dd
    WHERE dd.tenant_id = p_tenant_id AND dd.plan_id = p_source_plan_id
  ),
  ins_d AS (
    INSERT INTO public.nutrition_plan_days (id, tenant_id, plan_id, plan_date, energy_target_override, note)
    SELECT new_day_id, p_tenant_id, p_new_plan_id, new_date, energy_target_override, note
    FROM d
    RETURNING 1
  ),
  m AS MATERIALIZED (
    SELECT mm.id AS old_meal_id, gen_random_uuid() AS new_meal_id, d.new_day_id,
           mm.meal_type, mm.label, mm.sort_order, mm.energy_target, mm.note
    FROM public.nutrition_plan_meals mm
    JOIN d ON d.old_day_id = mm.plan_day_id
    WHERE mm.tenant_id = p_tenant_id
  ),
  ins_m AS (
    INSERT INTO public.nutrition_plan_meals (
      id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order, energy_target, note
    )
    SELECT new_meal_id, p_tenant_id, p_new_plan_id, new_day_id, meal_type, label, sort_order, energy_target, note
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
    INSERT INTO public.nutrition_plan_items (
      id, tenant_id, plan_id, meal_id, food_id, grams, quantity,
      food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
      external_provider_snapshot, external_version_snapshot, sort_order, note
    )
    SELECT new_item_id, p_tenant_id, p_new_plan_id, new_meal_id, food_id, grams, quantity,
           food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot,
           external_provider_snapshot, external_version_snapshot, sort_order, note
    FROM i
    RETURNING 1
  )
  INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
  SELECT p_tenant_id, i.new_item_id, nn.nutrient_code, nn.amount, nn.unit_code
  FROM public.nutrition_plan_item_nutrients nn
  JOIN i ON i.old_item_id = nn.item_id
  WHERE nn.tenant_id = p_tenant_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_copy_tree(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_copy_tree(uuid, uuid, uuid, integer)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 8) plan_copy: YENİ AİLE, revision=1, status=draft; deep snapshots. §21
--    p_new_start_date verilirse tüm tarihler ofsetlenir; değilse aynı tarihler.
--    Kaynak archived olabilir → kopya yeni DRAFT (archived kopyalanabilir; §17).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_plan_copy(
  p_tenant_id      uuid,
  p_source_plan_id uuid,
  p_new_title      text,
  p_new_start_date date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_src       public.nutrition_plans%ROWTYPE;
  v_new_id    uuid := gen_random_uuid();
  v_offset    integer := 0;
  v_new_start date;
  v_new_end   date;
  v_result    jsonb;
BEGIN
  SELECT * INTO v_src
  FROM public.nutrition_plans
  WHERE id = p_source_plan_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;

  IF p_new_start_date IS NOT NULL THEN
    v_offset := p_new_start_date - v_src.start_date;
  END IF;
  v_new_start := v_src.start_date + v_offset;
  v_new_end   := v_src.end_date + v_offset;

  INSERT INTO public.nutrition_plans (
    id, tenant_id, title, note, start_date, end_date,
    daily_energy_target, status, plan_family_id, revision_number
  ) VALUES (
    v_new_id, p_tenant_id,
    coalesce(NULLIF(btrim(coalesce(p_new_title, '')), ''), v_src.title),
    v_src.note, v_new_start, v_new_end,
    v_src.daily_energy_target, 'draft', v_new_id, 1
  );

  PERFORM public.nutrition_plan_copy_tree(p_tenant_id, p_source_plan_id, v_new_id, v_offset);

  SELECT to_jsonb(p) INTO v_result FROM public.nutrition_plans p WHERE p.id = v_new_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_copy(uuid, uuid, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_copy(uuid, uuid, text, date)
  TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 9) plan_revise: AYNI AİLE, revision = max+1, status=draft; verbatim deep copy. §19
--    Race-safe: family satırlarını kilitle, max revision hesapla. Aynı tarihler.
-- ─────────────────────────────────────────────────────────────
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

  -- Race-safe next revision: aile satırlarını kilitle.
  SELECT coalesce(max(revision_number), 0) + 1 INTO v_next
  FROM public.nutrition_plans
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_src.plan_family_id
  FOR UPDATE;

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
--   SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'nutrition_plan%';
--     -- hepsi prosecdef = f (INVOKER)
--   SELECT has_function_privilege('anon',
--     'public.nutrition_plan_create_with_days(uuid,text,date,date,numeric,text)','EXECUTE');  -- false
--   SELECT has_function_privilege('authenticated',
--     'public.nutrition_plan_copy(uuid,uuid,text,date)','EXECUTE');                            -- false
--   SELECT has_function_privilege('service_role',
--     'public.nutrition_plan_revise(uuid,uuid)','EXECUTE');                                     -- true
--
-- ROLLBACK (gerekirse): DROP FUNCTION IF EXISTS ... (tüm nutrition_plan_* fonksiyonları).
-- ============================================================
