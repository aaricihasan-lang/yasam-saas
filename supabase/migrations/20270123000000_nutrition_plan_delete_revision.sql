-- ============================================================
-- 20270123000000_nutrition_plan_delete_revision.sql
--
-- Beslenme — Plan REVİZYONU atomik silme + SON-revizyon yetim binding temizliği.
--
-- SORUN: nutrition_plan_clients PK (tenant_id, plan_family_id); client_id FK → clients
--   ON DELETE CASCADE. Ancak plan_family_id → nutrition_plans için FK/cascade YOKTUR.
--   Bu yüzden bir family'nin SON revizyonu silinince (app-layer .delete().eq(id)) binding
--   satırı YETİM kalır (danışan silinmeden, plana bağlı olmayan artık kayıt). Ayrıca
--   read-count-delete app-layer akışı, aynı family'nin son iki revizyonunun EŞZAMANLI
--   silinmesinde yarışabilir (READ COMMITTED altında her ikisi de "1 kaldı" görebilir).
--
-- ÇÖZÜM (bu RPC): TEK transaction'da atomik + YARIŞSIZ:
--   1. hedef planı tenant-scoped çöz + kilitle (yoksa 45014).
--   2. family binding satırını (varsa) FOR UPDATE ile KİLİTLE → aynı family üzerindeki
--      eşzamanlı revizyon silmeleri SERİLEŞİR (son-revizyon tespiti yarışsız). Unbound
--      family'de kilit satırı yok; orphan riski de yok → serileştirme gereksiz.
--   3. hedef revizyonu sil (gün/öğün/item/nutrient composite-FK cascade).
--   4. family'de kalan revizyon sayısını oku.
--   5. 0 kaldıysa → binding'i temizle. GERÇEK clients kaydına ASLA dokunulmaz; yalnız
--      family-binding cleanup. (Binding AFTER DELETE trigger'ı family plan satırlarını
--      silmeye çalışır → zaten 0; güvenli no-op.)
--
-- Diğer revizyon(lar) duruyorsa binding KORUNUR (yalnız hedef revizyon silinir).
-- assign RPC ile aynı sözleşme: SECURITY INVOKER + sabit search_path + service_role-only.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.nutrition_plan_delete_revision(
  p_tenant_id uuid,
  p_plan_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_family    uuid;
  v_remaining integer;
BEGIN
  -- 1. hedef plan → family (tenant-scoped) + satır kilidi.
  SELECT plan_family_id INTO v_family
  FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nutrition_plan_not_found' USING ERRCODE = '45014';
  END IF;

  -- 2. family binding satırını kilitle → eşzamanlı revizyon silmelerini serileştir.
  PERFORM 1
  FROM public.nutrition_plan_clients
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_family
  FOR UPDATE;

  -- 3. hedef revizyonu sil (composite-FK cascade: gün/öğün/item/nutrient).
  DELETE FROM public.nutrition_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id;

  -- 4. family'de başka revizyon kaldı mı?
  SELECT count(*) INTO v_remaining
  FROM public.nutrition_plans
  WHERE tenant_id = p_tenant_id AND plan_family_id = v_family;

  -- 5. son revizyon silindiyse → yetim binding'i temizle (client kaydına DOKUNMAZ).
  IF v_remaining = 0 THEN
    DELETE FROM public.nutrition_plan_clients
    WHERE tenant_id = p_tenant_id AND plan_family_id = v_family;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'plan_family_id', v_family,
    'family_removed', v_remaining = 0
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_plan_delete_revision(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_plan_delete_revision(uuid, uuid)
  TO service_role;

COMMIT;
