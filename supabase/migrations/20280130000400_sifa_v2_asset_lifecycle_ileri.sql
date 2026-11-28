-- 20280130000400_sifa_v2_asset_lifecycle_ileri.sql — modül: sifa-rehberi
-- İLERİ YÖNLÜ TELAFİ: 20280124000000_sifa_v2_asset_lifecycle.sql production'a HİÇ uygulanmadı (DB-03 tohumunda "gecmis prod:false";
-- gerçek şema karşılaştırması 27.11.2026: production = yalnız çekirdek). Bu dosya onun F3 ile çakışmayan 4 fonksiyonunu AYNEN kurar
-- (gövdeler scripts/sifa-rehberi-f3/gen-lc-ileri.mjs ile 20280124'ten alındı). __block_dead / __asset_in_use F3'te tanımlıdır.
-- Taze ortamda (20280124 + F3 kurulu) aynı tanımları yeniden yazar → değişiklik yok. Tablo / veri / Storage DEĞİŞMEZ.
-- Numara merkezi defterden ayrıldı (DB-03). Production'a yalnız uygulama kapısıyla (uygula-prod.mjs), F3'ten SONRA uygulanır.
-- Son adım: yayın hazırlık işareti sifa_v2_f3_hazir() — uygulama Şifa'yı yalnız bu fonksiyon varsa açar (üç migration tamam).
-- onkosul: to_regprocedure('public.sifa_blocks_guard_nest()') IS NOT NULL AND to_regprocedure('public.yh_sifa_v2_note_trash_enqueue()') IS NOT NULL

BEGIN;

CREATE OR REPLACE FUNCTION public.sifa_v2_gc_candidates(p_cutoff timestamptz, p_upload_cutoff timestamptz, p_tenant uuid, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_res jsonb;
  v_stray jsonb := '[]'::jsonb;
BEGIN
  WITH dead_blocks AS (
    SELECT b.id FROM public.sifa_topic_blocks b
     WHERE b.scope = 'kisisel' AND (p_tenant IS NULL OR b.tenant_id = p_tenant)
       AND public.sifa_v2__block_dead(b.id, p_cutoff)
  ), dead_assets AS (
    SELECT a.id, a.bucket, a.storage_path FROM public.sifa_block_assets a
     WHERE a.scope = 'kisisel' AND a.origin = 'upload' AND a.bucket = 'sifa-arastirma'
       AND (p_tenant IS NULL OR a.tenant_id = p_tenant)
       AND NOT public.sifa_v2__asset_in_use(a.id, a.tenant_id, a.owner_key, p_cutoff)
       AND (a.block_id IN (SELECT id FROM dead_blocks) OR a.created_at < p_upload_cutoff)
     ORDER BY a.created_at
     LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'topics', (SELECT COALESCE(jsonb_agg(t.id), '[]'::jsonb) FROM public.sifa_topics t
                WHERE t.scope = 'kisisel' AND (p_tenant IS NULL OR t.tenant_id = p_tenant)
                  AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff),
    'blocks', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM dead_blocks),
    'assets', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'storage_path', storage_path)), '[]'::jsonb) FROM dead_assets))
    INTO v_res;
  -- Satırsız nesneler: yalnız Storage şeması varsa (yerel test PostgreSQL'inde yok → boş liste).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(x.name), '[]'::jsonb) FROM (
        SELECT o.name FROM storage.objects o
         WHERE o.bucket_id = 'sifa-arastirma' AND o.created_at < $1
           AND ($2::uuid IS NULL OR o.name LIKE $2::text || '/%')
           AND o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'
           AND NOT EXISTS (SELECT 1 FROM public.sifa_block_assets a WHERE a.bucket = 'sifa-arastirma' AND a.storage_path = o.name)
         ORDER BY o.created_at
         LIMIT $3) x
    $q$ INTO v_stray USING p_upload_cutoff, p_tenant, v_limit;
  END IF;
  RETURN v_res || jsonb_build_object('stray_objects', v_stray);
END;
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2_gc_purge(p_cutoff timestamptz, p_tenant uuid, p_removed_assets uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a int; v_b int; v_t int; v_total_t int := 0;
BEGIN
  DELETE FROM public.sifa_block_assets a
   WHERE a.id = ANY (COALESCE(p_removed_assets, '{}'::uuid[])) AND a.scope = 'kisisel' AND a.origin = 'upload'
     AND (p_tenant IS NULL OR a.tenant_id = p_tenant)
     AND NOT public.sifa_v2__asset_in_use(a.id, a.tenant_id, a.owner_key, p_cutoff);
  GET DIAGNOSTICS v_a = ROW_COUNT;
  DELETE FROM public.sifa_topic_blocks b
   WHERE b.scope = 'kisisel' AND (p_tenant IS NULL OR b.tenant_id = p_tenant)
     AND public.sifa_v2__block_dead(b.id, p_cutoff)
     AND NOT EXISTS (SELECT 1 FROM public.sifa_block_assets a
                      WHERE a.block_id = b.id AND NOT public.sifa_v2__asset_in_use(a.id, a.tenant_id, a.owner_key, p_cutoff));
  GET DIAGNOSTICS v_b = ROW_COUNT;
  LOOP
    DELETE FROM public.sifa_topics t
     WHERE t.scope = 'kisisel' AND (p_tenant IS NULL OR t.tenant_id = p_tenant)
       AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff
       AND NOT EXISTS (SELECT 1 FROM public.sifa_topics c WHERE c.parent_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.sifa_topic_blocks b WHERE b.topic_id = t.id);
    GET DIAGNOSTICS v_t = ROW_COUNT;
    v_total_t := v_total_t + v_t;
    EXIT WHEN v_t = 0;
  END LOOP;
  RETURN jsonb_build_object('assets', v_a, 'blocks', v_b, 'topics', v_total_t);
END;
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2_trash_candidates(p_cutoff timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.sifa_v2_gc_candidates(p_cutoff, now() - interval '1 day', NULL, 2000);
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2_trash_purge(p_cutoff timestamptz, p_removed_assets uuid[])
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.sifa_v2_gc_purge(p_cutoff, NULL, p_removed_assets);
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.sifa_v2_gc_candidates(timestamptz, timestamptz, uuid, integer)',
    'public.sifa_v2_gc_purge(timestamptz, uuid, uuid[])',
    'public.sifa_v2_trash_candidates(timestamptz)',
    'public.sifa_v2_trash_purge(timestamptz, uuid[])'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;

-- Yayın hazırlık işareti: F3 + YH + bu migration tamam → uygulama Şifa'yı açabilir. Salt okunur; tablo okumaz.
CREATE OR REPLACE FUNCTION public.sifa_v2_f3_hazir()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_regprocedure('public.sifa_blocks_guard_nest()') IS NOT NULL
     AND to_regprocedure('public.sifa_v2_gc_candidates(timestamptz, timestamptz, uuid, integer)') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.sifa_v2_f3_hazir() FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION public.sifa_v2_f3_hazir() TO service_role; END IF;
END $$;

COMMIT;
