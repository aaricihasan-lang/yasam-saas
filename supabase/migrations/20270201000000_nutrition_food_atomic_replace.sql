-- ============================================================
-- 20270201000000_nutrition_food_atomic_replace.sql
--
-- Beslenme — Besin detay alt kayıtları için ATOMİK replace RPC'leri (veri kaybı düzeltmesi).
--
-- SORUN (2026-09-27 audit):
--   PUT /foods/[id]/nutrients|portions|traditional route'ları önce DELETE, sonra INSERT
--   yapıyordu (iki ayrı istek, transaction YOK). INSERT başarısız olursa eski satırlar
--   SİLİNMİŞ kalıyordu. Ayrıca UI source_id / portion quantity göndermediği için her kayıtta
--   mevcut kaynak bağı siliniyor ve porsiyon miktarı 1'e sıfırlanıyordu.
--
-- ÇÖZÜM: Her replace TEK PL/pgSQL gövdesinde (tek transaction) çalışır → herhangi bir hata
--   tamamını geri alır. KORUMA SEMANTİĞİ: satır nesnesinde anahtar YOKSA mevcut değer korunur;
--   anahtar VARSA (null dahil) verilen değer yazılır.
--     • nutrients: "source_id" anahtarı yoksa aynı nutrient'ın mevcut source_id'si korunur.
--     • portions : "id" mevcut porsiyonu işaret eder → id korunur; quantity/label_en/source_id
--                  anahtarı yoksa mevcut değer korunur. id'siz satır = yeni porsiyon.
--     • traditional: "source_id" anahtarı yoksa mevcut korunur; tüm alanlar boşsa satır silinir.
--
-- GÜVENLİK (her fonksiyon): SECURITY INVOKER, sabit search_path, REVOKE PUBLIC/anon/
--   authenticated + GRANT EXECUTE yalnız service_role. tenant_id istemciden gelmez (route guard).
--   SYSTEM katalog satırı bu yolla ASLA yazılamaz (p_system_tenant_id savunması, 45030).
--
-- SQLSTATE: 45014 NOT_FOUND (besin bu tenant'a ait değil) · 45015 BAD_INPUT ·
--           45030 FOOD_SYSTEM_READONLY (sistem satırı) · 23505/23503 tablo kısıtları aynen.
-- VERİ-YIKICI MI: HAYIR (yalnız fonksiyon oluşturur).
-- ROLLBACK: DROP FUNCTION public.nutrition_food_nutrients_replace(uuid,uuid,uuid,jsonb),
--   public.nutrition_food_portions_replace(uuid,uuid,uuid,jsonb),
--   public.nutrition_food_traditional_replace(uuid,uuid,uuid,jsonb);
-- ============================================================

BEGIN;

-- Ortak: besin caller tenant'a ait mi (ve sistem satırı değil mi)? Kilitle.
CREATE OR REPLACE FUNCTION public.nutrition_food_assert_writable(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_tenant_id IS NULL OR p_food_id IS NULL THEN
    RAISE EXCEPTION 'nutrition_food_bad_input' USING ERRCODE = '45015';
  END IF;
  IF p_tenant_id = p_system_tenant_id THEN
    RAISE EXCEPTION 'nutrition_food_system_readonly' USING ERRCODE = '45030';
  END IF;
  PERFORM 1 FROM public.nutrition_foods
  WHERE tenant_id = p_tenant_id AND id = p_food_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_food_not_found' USING ERRCODE = '45014';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_assert_writable(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_assert_writable(uuid, uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 1) nutrients: /100 g set replace (atomik; source_id koruma).
--    p_rows = [ { nutrient_id, amount, unit_id, source_id? } ]  (route doğrular + çözer)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_food_nutrients_replace(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid,
  p_rows             jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_prev  jsonb;
  v_count integer;
BEGIN
  PERFORM public.nutrition_food_assert_writable(p_tenant_id, p_system_tenant_id, p_food_id);
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'nutrition_food_rows_must_be_array' USING ERRCODE = '45015';
  END IF;

  -- Mevcut nutrient → source_id haritası (koruma için; silmeden ÖNCE).
  SELECT coalesce(jsonb_object_agg(nutrient_id::text, source_id), '{}'::jsonb) INTO v_prev
  FROM public.nutrition_food_nutrients
  WHERE tenant_id = p_tenant_id AND food_id = p_food_id;

  DELETE FROM public.nutrition_food_nutrients
  WHERE tenant_id = p_tenant_id AND food_id = p_food_id;

  INSERT INTO public.nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id)
  SELECT p_tenant_id, p_food_id,
         (e->>'nutrient_id')::uuid,
         (e->>'amount')::numeric,
         (e->>'unit_id')::uuid,
         100,
         CASE WHEN e ? 'source_id' THEN NULLIF(e->>'source_id', '')::uuid
              ELSE NULLIF(v_prev->>(e->>'nutrient_id'), '')::uuid END
  FROM jsonb_array_elements(p_rows) AS e;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_nutrients_replace(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_nutrients_replace(uuid, uuid, uuid, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) portions: set replace (atomik; id/quantity/label_en/source_id koruma).
--    p_rows = [ { id?, label_tr, label_en?, quantity?, measure_unit_id, gram_weight,
--                 is_default, sort_order, source_id? } ]
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_food_portions_replace(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid,
  p_rows             jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_prev  jsonb;
  v_count integer;
BEGIN
  PERFORM public.nutrition_food_assert_writable(p_tenant_id, p_system_tenant_id, p_food_id);
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'nutrition_food_rows_must_be_array' USING ERRCODE = '45015';
  END IF;

  -- Mevcut porsiyonlar (id → satır). Bilinmeyen id (başka besin/tenant) → yeni satır sayılmaz: reddedilir.
  SELECT coalesce(jsonb_object_agg(id::text, to_jsonb(p)), '{}'::jsonb) INTO v_prev
  FROM public.nutrition_food_portions p
  WHERE tenant_id = p_tenant_id AND food_id = p_food_id;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE e ? 'id' AND NULLIF(e->>'id', '') IS NOT NULL AND NOT (v_prev ? (e->>'id'))
  ) THEN
    RAISE EXCEPTION 'nutrition_food_portion_not_found' USING ERRCODE = '45014';
  END IF;

  -- Önce tümünü sil (aynı transaction) → etiket yer değiştirmede geçici tekillik çakışması yok.
  DELETE FROM public.nutrition_food_portions
  WHERE tenant_id = p_tenant_id AND food_id = p_food_id;

  INSERT INTO public.nutrition_food_portions (
    id, tenant_id, food_id, label_tr, label_en, quantity, measure_unit_id,
    gram_weight, is_default, sort_order, source_id
  )
  SELECT
    coalesce(NULLIF(e->>'id', '')::uuid, gen_random_uuid()),
    p_tenant_id, p_food_id,
    e->>'label_tr',
    CASE WHEN e ? 'label_en' THEN NULLIF(btrim(coalesce(e->>'label_en', '')), '')
         ELSE v_prev->(e->>'id')->>'label_en' END,
    CASE WHEN e ? 'quantity' AND NULLIF(e->>'quantity', '') IS NOT NULL THEN (e->>'quantity')::numeric
         ELSE coalesce((v_prev->(e->>'id')->>'quantity')::numeric, 1) END,
    (e->>'measure_unit_id')::uuid,
    (e->>'gram_weight')::numeric,
    coalesce((e->>'is_default')::boolean, false),
    coalesce((e->>'sort_order')::int, 0),
    CASE WHEN e ? 'source_id' THEN NULLIF(e->>'source_id', '')::uuid
         ELSE NULLIF(v_prev->(e->>'id')->>'source_id', '')::uuid END
  FROM jsonb_array_elements(p_rows) AS e;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_portions_replace(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_portions_replace(uuid, uuid, uuid, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) traditional: tek satır upsert (atomik; source_id koruma; tüm alan boş → sil).
--    p_row = { framework_id, thermal_quality, moisture_quality, notes, source_id? }
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutrition_food_traditional_replace(
  p_tenant_id        uuid,
  p_system_tenant_id uuid,
  p_food_id          uuid,
  p_row              jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_prev_source uuid;
  v_source      uuid;
  v_framework   uuid;
  v_thermal     text;
  v_moisture    text;
  v_notes       text;
  v_result      jsonb;
BEGIN
  PERFORM public.nutrition_food_assert_writable(p_tenant_id, p_system_tenant_id, p_food_id);
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'nutrition_food_row_must_be_object' USING ERRCODE = '45015';
  END IF;

  SELECT source_id INTO v_prev_source
  FROM public.nutrition_food_traditional
  WHERE tenant_id = p_tenant_id AND food_id = p_food_id;

  v_framework := NULLIF(p_row->>'framework_id', '')::uuid;
  v_thermal   := NULLIF(btrim(coalesce(p_row->>'thermal_quality', '')), '');
  v_moisture  := NULLIF(btrim(coalesce(p_row->>'moisture_quality', '')), '');
  v_notes     := NULLIF(btrim(coalesce(p_row->>'notes', '')), '');
  v_source    := CASE WHEN p_row ? 'source_id' THEN NULLIF(p_row->>'source_id', '')::uuid ELSE v_prev_source END;

  IF v_framework IS NULL AND v_thermal IS NULL AND v_moisture IS NULL AND v_notes IS NULL AND v_source IS NULL THEN
    DELETE FROM public.nutrition_food_traditional WHERE tenant_id = p_tenant_id AND food_id = p_food_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.nutrition_food_traditional (
    tenant_id, food_id, framework_id, thermal_quality, moisture_quality, notes, source_id
  ) VALUES (
    p_tenant_id, p_food_id, v_framework, v_thermal, v_moisture, v_notes, v_source
  )
  ON CONFLICT (tenant_id, food_id) DO UPDATE SET
    framework_id     = EXCLUDED.framework_id,
    thermal_quality  = EXCLUDED.thermal_quality,
    moisture_quality = EXCLUDED.moisture_quality,
    notes            = EXCLUDED.notes,
    source_id        = EXCLUDED.source_id;

  SELECT to_jsonb(t) INTO v_result
  FROM public.nutrition_food_traditional t
  WHERE t.tenant_id = p_tenant_id AND t.food_id = p_food_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_food_traditional_replace(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_food_traditional_replace(uuid, uuid, uuid, jsonb) TO service_role;

COMMIT;
