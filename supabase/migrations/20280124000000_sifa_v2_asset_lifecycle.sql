-- ════════════════════════════════════════════════════════════════════════════
-- Şifa Rehberi V2 — görsel YAŞAM DÖNGÜSÜ (referans kanıtına dayalı güvenli temizlik)
-- ════════════════════════════════════════════════════════════════════════════
-- Neden: 20280110000000'daki sifa_v2_trash_candidates görselin "kullanılıyor" kanıtına yalnız CANLI kutulara
-- bakarak karar veriyordu:
--   (1) çöpteki (geri yüklenebilir) kutuda kullanılan görsel korunmuyordu,
--   (2) görsel iki kutuda kullanılır ve block_id sonradan çöpe atılan kutuyu gösterirse, 30 gün sonra CANLI
--       kutuda hâlâ kullanılan görsel silinebilirdi.
-- Bu migration TABLO/VERİ DEĞİŞTİRMEZ; yalnız fonksiyon ekler/değiştirir. Hiçbir zamanlanmış iş KURMAZ
-- (temizlik yalnız açıkça çağrılırsa çalışır; lib/sifa-rehberi-v2/server/trash.ts, varsayılan KURU ÇALIŞMA).
--
-- KORUMA KURALI (tek tanım: sifa_v2__asset_in_use):
--   Bir yüklenmiş görsel, AYNI tenant + AYNI sahibin "ölü olmayan" HERHANGİ bir kutusunun içeriğinde
--   `sifa-asset:<kimlik>` olarak geçiyorsa KULLANIMDADIR ve ASLA aday olmaz. "Ölü olmayan" = canlı kutu VEYA
--   çöpte olup saklama süresi (p_cutoff) dolmamış kutu/konu (geri yüklenebilir içerik).
-- ADAY (yalnız kişisel 'upload' görseller; kurum/legacy_ref ve stone-photos HİÇ dokunulmaz):
--   kullanımda değil VE (bağlı olduğu kutu ölü  VEYA  görsel p_upload_cutoff'tan eski — yani kaydedilmemiş ya da
--   içerikten çıkarılmış ve bekleme süresi dolmuş).
-- SATIRSIZ NESNE: sifa-arastirma kovasında, '<tenant>/<sahip>/<uuid>.<uzantı>' biçimli, DB'de hiçbir görsel
--   satırının göstermediği ve p_upload_cutoff'tan eski nesne (finalize'ı yarım kalmış yükleme).

CREATE OR REPLACE FUNCTION public.sifa_v2__block_dead(p_block_id uuid, p_cutoff timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sifa_topic_blocks b
     WHERE b.id = p_block_id AND b.scope = 'kisisel' AND (
           (b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
        OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff)));
$$;

CREATE OR REPLACE FUNCTION public.sifa_v2__asset_in_use(p_asset_id uuid, p_tenant uuid, p_owner uuid, p_cutoff timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sifa_topic_blocks b
     WHERE b.tenant_id = p_tenant AND b.owner_key = p_owner
       AND strpos(b.content_json::text, 'sifa-asset:' || p_asset_id::text) > 0
       AND NOT (
             (b.deleted_at IS NOT NULL AND b.deleted_at < p_cutoff)
          OR EXISTS (SELECT 1 FROM public.sifa_topics t WHERE t.id = b.topic_id AND t.deleted_at IS NOT NULL AND t.deleted_at < p_cutoff)));
$$;

-- Adaylar (salt-okunur). p_tenant NULL = tüm tenant'lar; verilirse yalnız o tenant (kademeli açılış / test).
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

-- Kalıcı adım. Görsel satırı YALNIZ nesnesi gerçekten silindiyse VE hâlâ kullanımda değilse silinir (yarış güvenliği:
-- koşul silme anında yeniden sınanır). Ölü kutu, bekleyen (nesnesi silinemeyen) görseli varsa bu turda kalır.
-- Kullanımdaki bir görselin block_id'si ölü kutuyu gösteriyorsa kutu silinince FK onu NULL yapar (görsel korunur).
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

-- Eski (hatalı korumalı) fonksiyonlar aynı imzayla YENİ kurala yönlendirilir; eski "1 gün" bekleme korunur.
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
    'public.sifa_v2__block_dead(uuid, timestamptz)', 'public.sifa_v2__asset_in_use(uuid, uuid, uuid, timestamptz)',
    'public.sifa_v2_gc_candidates(timestamptz, timestamptz, uuid, integer)', 'public.sifa_v2_gc_purge(timestamptz, uuid, uuid[])',
    'public.sifa_v2_trash_candidates(timestamptz)', 'public.sifa_v2_trash_purge(timestamptz, uuid[])'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;
