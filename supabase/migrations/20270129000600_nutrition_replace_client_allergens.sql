-- ============================================================
-- 20270129000600_nutrition_replace_client_allergens.sql
--
-- FAZ1 FINAL HARDENING (DY-B) — Danışan BEYAN alerjenleri için ATOMİK tam-set replace.
--
-- AMAÇ:
--   PUT /api/beslenme/clients/[clientId]/allergens bugün iki ayrı istekle çalışıyor:
--   DELETE (tüm satırlar) → INSERT (yeni set). INSERT başarısız olursa (ağ, 23505, CHECK)
--   danışanın beyan alerjenleri SESSİZCE boşalıyordu. Bu RPC silme + ekleme işlemini tek
--   fonksiyon gövdesinde (tek transaction) yapar: herhangi bir hata → tamamı geri alınır.
--
-- SÖZLEŞME:
--   public.nutrition_replace_client_allergens(p_tenant_id uuid, p_client_id uuid, p_items jsonb)
--     p_items = [ { "allergen_id": uuid } | { "custom_label": text }, ... (+ "note") ]
--   - Her eleman TAM OLARAK bir kaynak (standart allergen_id XOR custom_label) — tablo
--     CHECK'i (nutrition_client_allergens_one_source) ile aynı kural.
--   - custom_label btrim'lenir; dedup lower(btrim()) (partial UNIQUE index ile hizalı);
--     standart dedup allergen_id. İlk geçen kazanır (sıra korunur).
--   - Tenant + client sahipliği fonksiyon içinde doğrulanır (clients.tenant_id); çağıranın
--     tenant_id'sine körü körüne güvenilmez. Ayrıca tablo tenant-guard trigger'ı aktiftir.
--   - Standart id'ler nutrition_allergens'ta olmalı (aynı transaction içinde doğrulanır).
--   - custom_label kolonu KORUNUR (Diğer/serbest beyan desteği değişmez).
--   - Aynı danışana eşzamanlı iki replace → transaction-seviyesi advisory lock ile sıralanır.
--   Dönüş: {"deleted": n, "inserted": m}
--   Hata kodları (RAISE EXCEPTION mesajı): invalid_arguments, client_not_found_for_tenant,
--     items_must_be_array, too_many_allergens, bad_allergen_item, bad_allergen_id,
--     custom_too_long, unknown_allergen.
--
-- PRECONDITION: public.nutrition_client_allergens (+ custom_label, 20270122000100),
--   public.nutrition_allergens, public.clients mevcut olmalı. Yoksa açık hata ile durur.
-- GÜVENLİK: SECURITY DEFINER + SET search_path = '' (tüm relation'lar şema-nitelikli);
--   REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.
-- VERİ-YIKICI MI: HAYIR (yalnız fonksiyon oluşturur; mevcut satırlara dokunmaz).
-- İDEMPOTENT: CREATE OR REPLACE + REVOKE/GRANT tekrar çalıştırılabilir.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Uygulama sırası: bu migration, route'un RPC'ye geçtiği KOD
--    deploy'undan ÖNCE uygulanmalıdır (RPC yoksa route 503 ALLERGEN_RPC_MISSING döner;
--    eski delete→insert yoluna sessiz geri dönüş YOKTUR).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.nutrition_replace_client_allergens(uuid, uuid, jsonb);
--   (ve route'u önceki sürüme döndür)
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.nutrition_client_allergens') IS NULL
     OR to_regclass('public.nutrition_allergens') IS NULL
     OR to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'precondition failed: nutrition_client_allergens / nutrition_allergens / clients tablosu yok';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nutrition_client_allergens' AND column_name = 'custom_label'
  ) THEN
    RAISE EXCEPTION 'precondition failed: nutrition_client_allergens.custom_label yok (20270122000100 önce uygulanmalı)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nutrition_replace_client_allergens(
  p_tenant_id uuid,
  p_client_id uuid,
  p_items     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted  integer := 0;
  v_inserted integer := 0;
  v_uuid_re  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_tenant_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  -- Danışan çağıranın (sunucu/oturumdan türetilmiş) tenant'ına ait olmalı.
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

  -- Mutasyondan ÖNCE tüm elemanları doğrula (hata → hiçbir şeye dokunma).
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

  -- Aynı danışana eşzamanlı replace'leri sırala (transaction sonunda otomatik bırakılır).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition_client_allergens:' || p_tenant_id::text || ':' || p_client_id::text, 0)
  );

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

  RETURN jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.nutrition_replace_client_allergens(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_replace_client_allergens(uuid, uuid, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   SELECT has_function_privilege('anon','public.nutrition_replace_client_allergens(uuid,uuid,jsonb)','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.nutrition_replace_client_allergens(uuid,uuid,jsonb)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role','public.nutrition_replace_client_allergens(uuid,uuid,jsonb)','EXECUTE');  -- true
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'nutrition_replace_client_allergens';                        -- t, {search_path=""}
-- ============================================================
