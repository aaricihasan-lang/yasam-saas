-- =============================================================================
-- 20270113000000_expert_storage_usage_rpc.sql   [ADDITIVE — RPC ONLY]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-4 (fiziksel depolama).
--
-- AMAÇ: Supabase storage.objects METADATA'sını (dosya içeriği DEĞİL) esas alarak
--   çalışma alanı (tenant) bazlı fiziksel obje sayısı + toplam byte'ı DB içinde
--   TOPLULAŞTIRAN dar-yetkili RPC. Sınırsız uygulama-tarafı obje taraması YOK.
--
-- ATIF MATRİSİ (object path → tenant), yalnız bilinen 7 bucket allowlist'i:
--   stone-photos           : {tenant}/... | catalog/{tenant}/... | healing-guides/{tenant}/...
--   hd-chart-images        : {tenant}/...
--   client-analysis-images : {tenant}/...
--   video-temp             : {tenant}/...        (silinen temp obje storage.objects'ten düşer → sayılmaz)
--   video-ceviri-output    : {tenant}/...
--   belge-ceviri           : {tenant}/input|... → {tenant}/...
--   personal-archive       : {tenant}/...
--   * İlk segment (stone-photos'ta catalog/healing-guides sonrası segment) UUID DEĞİLSE
--     → tenant_id NULL (unattributed). Tahminen bir uzmana YÜKLENMEZ.
--   * Bir fiziksel obje = storage.objects'te bir satır → GROUP BY ile BİR KEZ sayılır
--     (bir obje birden çok uygulama kaydınca referanslansa bile çift sayılmaz).
--   * Legacy tenant (11111111-...) normal tenant gibi döner; işaretleme uygulama katmanında.
--   * Demo hesap storage'a yazmaz → ek işlem gerekmez.
--
-- BOYUT: (metadata->>'size')::bigint. Eksik/parse edilemeyen boyut → missing_size_count
--   ile ayrıca sayılır; total_bytes yalnız BİLİNEN boyutları toplar (uygulama partial bildirir).
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE
--   (PUBLIC/anon/authenticated REVOKE). Salt-okur (storage.objects'e yazma YOK).
--
-- KAPSAM: yalnız fonksiyon. Yeni tablo/kolon YOK, veri (DML) YOK.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.expert_storage_usage()
RETURNS TABLE (
  tenant_id          uuid,
  bucket             text,
  object_count       bigint,
  total_bytes        bigint,
  missing_size_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage, pg_catalog
AS $$
  WITH base AS (
    SELECT
      o.bucket_id AS bucket,
      -- tenant segmenti: stone-photos'ta özel prefix'ler sonrası, diğerlerinde ilk segment.
      CASE
        WHEN o.bucket_id = 'stone-photos'
             AND split_part(o.name, '/', 1) IN ('catalog','healing-guides')
          THEN split_part(o.name, '/', 2)
        ELSE split_part(o.name, '/', 1)
      END AS tenant_seg,
      NULLIF(o.metadata->>'size','')::bigint AS size_bytes
    FROM storage.objects o
    WHERE o.bucket_id IN (
      'stone-photos','hd-chart-images','client-analysis-images',
      'video-temp','video-ceviri-output','belge-ceviri','personal-archive'
    )
  ),
  attributed AS (
    SELECT
      CASE WHEN tenant_seg ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN tenant_seg::uuid ELSE NULL END AS tenant_id,
      bucket,
      size_bytes
    FROM base
  )
  SELECT
    tenant_id,
    bucket,
    count(*)::bigint                                        AS object_count,
    coalesce(sum(size_bytes), 0)::bigint                    AS total_bytes,
    count(*) FILTER (WHERE size_bytes IS NULL)::bigint       AS missing_size_count
  FROM attributed
  GROUP BY tenant_id, bucket;
$$;

COMMENT ON FUNCTION public.expert_storage_usage() IS
  'FAZ 1 İP-4 — storage.objects metadata''sından tenant×bucket fiziksel obje/byte toplamı. '
  'Salt-okur, service_role-only. tenant_id NULL = atfedilemeyen (unattributed).';

REVOKE ALL ON FUNCTION public.expert_storage_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_storage_usage() TO service_role;

COMMIT;

-- =============================================================================
-- ÖN KOŞUL: storage.objects (Supabase Storage) mevcut olmalı ve fonksiyon sahibi
--   (postgres) SELECT yetkisine sahip olmalı (Supabase'de varsayılan).
-- DOĞRULAMA:
--   SELECT prosecdef FROM pg_proc WHERE proname='expert_storage_usage';                 -- t
--   SELECT has_function_privilege('service_role','public.expert_storage_usage()','EXECUTE'); -- t
--   SELECT has_function_privilege('anon','public.expert_storage_usage()','EXECUTE');         -- f
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.expert_storage_usage();
-- =============================================================================
