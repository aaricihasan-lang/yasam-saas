-- ============================================================
-- 20270201000300_nutrition_plan_refresh_snapshots.sql
--
-- Beslenme — TASLAK planda MANUEL "Besin değerlerini güncelle".
--
-- SNAPSHOT MİMARİSİ KORUNUR (§13): plan kalemleri eklendikleri andaki /100 g değerleri
--   dondurur; canlı besin değişikliği geçmiş planı SESSİZCE değiştirmez. Bu RPC yalnız
--   kullanıcı bilerek başlattığında, yalnız status='draft' planda, route'un effective
--   (uzman kopyası ?? sistem) besinden ürettiği snapshot'larla kalemleri tek transaction'da
--   yeniden yazar. grams / quantity / porsiyon etiketi-gramı / sıra / not DEĞİŞMEZ.
--
-- p_items = [ { item_id, food_id, food_name, food_ownership, external_provider,
--               external_version, nutrients: [ { nutrient_code, amount, unit_code } ] } ]
--
-- SQLSTATE: 45010 PLAN_NOT_DRAFT (taslak olmayan plan) · 45014 NOT_FOUND (plan/kalem bu
--   tenant+plana ait değil; kısmi işlem YOK) · 45015 BAD_INPUT.
-- GÜVENLİK: SECURITY INVOKER, sabit search_path, yalnız service_role EXECUTE.
-- VERİ-YIKICI MI: HAYIR (yalnız fonksiyon).
-- ROLLBACK: DROP FUNCTION public.nutrition_plan_refresh_item_snapshots(uuid, uuid, jsonb);
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nutrition_plan_refresh_item_snapshots(
  p_tenant_id uuid,
  p_plan_id   uuid,
  p_items     jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status   text;
  v_expected integer;
  v_found    integer;
  e          jsonb;
  v_count    integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'nutrition_plan_refresh_bad_input' USING ERRCODE = '45015';
  END IF;

  SELECT status INTO v_status FROM public.nutrition_plans
  WHERE tenant_id = p_tenant_id AND id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'nutrition_plan_not_draft' USING ERRCODE = '45010';
  END IF;

  v_expected := jsonb_array_length(p_items);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_found
  FROM public.nutrition_plan_items it
  WHERE it.tenant_id = p_tenant_id AND it.plan_id = p_plan_id
    AND it.id IN (SELECT (x->>'item_id')::uuid FROM jsonb_array_elements(p_items) AS x);
  IF v_found <> v_expected THEN
    RAISE EXCEPTION 'nutrition_plan_item_not_found' USING ERRCODE = '45014';
  END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF btrim(coalesce(e->>'food_name', '')) = '' OR (e->>'food_ownership') NOT IN ('system', 'custom') THEN
      RAISE EXCEPTION 'nutrition_plan_refresh_bad_snapshot' USING ERRCODE = '45015';
    END IF;

    UPDATE public.nutrition_plan_items SET
      food_id = NULLIF(e->>'food_id', '')::uuid,
      food_name_snapshot = e->>'food_name',
      food_ownership_snapshot = e->>'food_ownership',
      external_provider_snapshot = NULLIF(btrim(coalesce(e->>'external_provider', '')), ''),
      external_version_snapshot = NULLIF(btrim(coalesce(e->>'external_version', '')), '')
    WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id AND id = (e->>'item_id')::uuid;

    DELETE FROM public.nutrition_plan_item_nutrients
    WHERE tenant_id = p_tenant_id AND item_id = (e->>'item_id')::uuid;

    INSERT INTO public.nutrition_plan_item_nutrients (tenant_id, item_id, nutrient_code, amount, unit_code)
    SELECT p_tenant_id, (e->>'item_id')::uuid, n->>'nutrient_code', (n->>'amount')::numeric, n->>'unit_code'
    FROM jsonb_array_elements(coalesce(e->'nutrients', '[]'::jsonb)) AS n
    WHERE btrim(coalesce(n->>'nutrient_code', '')) <> ''
      AND btrim(coalesce(n->>'unit_code', '')) <> ''
      AND coalesce((n->>'amount')::numeric, -1) >= 0
    ON CONFLICT (tenant_id, item_id, nutrient_code) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_refresh_item_snapshots(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_refresh_item_snapshots(uuid, uuid, jsonb) TO service_role;

COMMIT;
