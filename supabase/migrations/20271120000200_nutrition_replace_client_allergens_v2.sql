-- ============================================================
-- 20271120000200_nutrition_replace_client_allergens_v2.sql
--
-- BESLENME — DANIŞAN ALERJEN LİSTESİ ATOMİK SÜRÜM KONTROLÜ (BES-03 · AŞAMA 2)
--
-- SORUN: nutrition_replace_client_allergens (v1) tam-set değiştirmeyi atomik yapıyor (tek
--   transaction + danışan başına advisory kilit) ama BEKLENEN SÜRÜMÜ almıyor → aynı listeyi iki
--   sekmede açan uzmanlardan sonra kaydeden, öncekinin eklediği/sildiği alerjenleri sessizce geri
--   alıyordu (last-write-wins).
--
-- ÇÖZÜM (şema DEĞİŞMEZ; yalnız 2 yeni fonksiyon):
--   • nutrition_client_allergens_version(tenant, client): danışanın güncel alerjen kümesinin
--     sha256 özeti — YALNIZ SQL'de hesaplanır (uygulama aynı fonksiyonu GET'te çağırır → tek
--     doğruluk kaynağı). Boş küme de bir sürümdür.
--   • nutrition_replace_client_allergens_v2(tenant, client, items, expected_version):
--       v1 ile BİREBİR aynı doğrulamalar → AYNI advisory kilit (v1 ile de sıralanır) → kilit
--       altında güncel özet = beklenen değilse 'allergen_version_conflict' istisnası (hiçbir şey
--       değişmez) → değiştirme → yeni özet döner. Beklenen sürüm NULL/boş ise
--       'allergen_version_required' istisnası (fonksiyon içinden de atlatılamaz).
--
-- GÜVENLİK: v1 ile aynı model — SECURITY DEFINER + search_path = '', yalnız service_role EXECUTE.
-- VERİ-YIKICI MI: HAYIR (yalnız fonksiyon oluşturur). İDEMPOTENT.
-- YAYIN SIRASI: ÖNCE bu migration, SONRA uygulama kodu (kod v2 yoksa 503 döner; v1'e sessiz geri
--   dönüş YOK). v1 eski kod için yerinde kalır; yeni kod v1'i çağırmaz ve v1 yalnız service_role'e
--   açıktır (istemciden erişilemez). Yeni kod yayında doğrulandıktan sonra v1 ayrı bir temizlik
--   migration'ıyla REVOKE/DROP edilebilir.
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.nutrition_replace_client_allergens_v2(uuid, uuid, jsonb, text);
--   DROP FUNCTION IF EXISTS public.nutrition_client_allergens_version(uuid, uuid);
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.nutrition_replace_client_allergens(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'precondition failed: nutrition_replace_client_allergens (v1, 20270129000600) önce uygulanmalı';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nutrition_client_allergens_version(
  p_tenant_id uuid,
  p_client_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           COALESCE(pg_catalog.string_agg(k, pg_catalog.chr(30) ORDER BY k COLLATE "C"), ''),
           'UTF8')), 'hex')
  FROM (
    SELECT COALESCE(a.allergen_id::text, '') || pg_catalog.chr(31) ||
           COALESCE(a.custom_label, '')      || pg_catalog.chr(31) ||
           COALESCE(a.note, '') AS k
    FROM public.nutrition_client_allergens a
    WHERE a.tenant_id = p_tenant_id AND a.client_id = p_client_id
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.nutrition_replace_client_allergens_v2(
  p_tenant_id        uuid,
  p_client_id        uuid,
  p_items            jsonb,
  p_expected_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted  integer := 0;
  v_inserted integer := 0;
  v_current  text;
  v_uuid_re  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_tenant_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'allergen_version_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'client_not_found_for_tenant' USING ERRCODE = 'P0002';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'too_many_allergens' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR (NULLIF(e->>'allergen_id', '') IS NULL) = (NULLIF(btrim(COALESCE(e->>'custom_label', '')), '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'bad_allergen_item' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) e
    WHERE NULLIF(e->>'allergen_id', '') IS NOT NULL
      AND (e->>'allergen_id') !~ v_uuid_re
  ) THEN
    RAISE EXCEPTION 'bad_allergen_id' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) e
    WHERE NULLIF(e->>'allergen_id', '') IS NULL
      AND char_length(btrim(e->>'custom_label')) > 120
  ) THEN
    RAISE EXCEPTION 'custom_too_long' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) e
    WHERE NULLIF(e->>'allergen_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.nutrition_allergens a WHERE a.id = (e->>'allergen_id')::uuid
      )
  ) THEN
    RAISE EXCEPTION 'unknown_allergen' USING ERRCODE = '22023';
  END IF;

  -- v1 ile AYNI kilit anahtarı → v1/v2 dahil aynı danışana eşzamanlı değiştirmeler sıralanır.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition_client_allergens:' || p_tenant_id::text || ':' || p_client_id::text, 0)
  );

  -- Kilit ALTINDA güncel sürüm (READ COMMITTED: önceki yazarın commit'i görünür) — atomik CAS.
  v_current := public.nutrition_client_allergens_version(p_tenant_id, p_client_id);
  IF v_current <> p_expected_version THEN
    RAISE EXCEPTION 'allergen_version_conflict' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.nutrition_client_allergens
  WHERE tenant_id = p_tenant_id AND client_id = p_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.nutrition_client_allergens (tenant_id, client_id, allergen_id, custom_label, note)
  SELECT p_tenant_id, p_client_id, d.allergen_id, d.custom_label, d.note
  FROM (
    SELECT DISTINCT ON (x.dedup_key)
      x.dedup_key, x.ord, x.allergen_id, x.custom_label, x.note
    FROM (
      SELECT
        t.ord,
        CASE WHEN NULLIF(t.e->>'allergen_id', '') IS NOT NULL
             THEN (t.e->>'allergen_id')::uuid END                          AS allergen_id,
        CASE WHEN NULLIF(t.e->>'allergen_id', '') IS NULL
             THEN btrim(t.e->>'custom_label') END                           AS custom_label,
        NULLIF(btrim(COALESCE(t.e->>'note', '')), '')                        AS note,
        CASE WHEN NULLIF(t.e->>'allergen_id', '') IS NOT NULL
             THEN 'std:' || lower(t.e->>'allergen_id')
             ELSE 'custom:' || lower(btrim(t.e->>'custom_label')) END       AS dedup_key
      FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord)
    ) x
    ORDER BY x.dedup_key, x.ord
  ) d
  ORDER BY d.ord;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'version', public.nutrition_client_allergens_version(p_tenant_id, p_client_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nutrition_client_allergens_version(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nutrition_client_allergens_version(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.nutrition_client_allergens_version(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_client_allergens_version(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens_v2(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens_v2(uuid, uuid, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens_v2(uuid, uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_replace_client_allergens_v2(uuid, uuid, jsonb, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
