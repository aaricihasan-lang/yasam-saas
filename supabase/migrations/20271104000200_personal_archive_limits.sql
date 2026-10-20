-- =============================================================================
-- 20271104000200_personal_archive_limits.sql
--
-- SATIŞ ÖNCESİ AŞAMA 1 — DIJ-03 (owner kararı: YAPALIM): Kişisel Arşiv tekil dosya sınırı ve
-- tenant kotası için DB tarafı.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (Dashboard SQL Editor).
--
-- BU DOSYANIN YAPTIĞI:
--   (1) `personal-archive` bucket'ına SERT tekil nesne tavanı: file_size_limit = 50 MB
--       (uygulama sınırı PERSONAL_ARCHIVE_MAX_BYTES ile aynı). allowed_mime_types BİLİNÇLİ OLARAK
--       NULL bırakılır: tarayıcı türü bilmediğinde octet-stream/text gönderir; bucket allow-list
--       meşru yüklemeleri kırar. Tür kararı uygulamada (lib/kisisel-arsiv/uploadPolicy.ts).
--       Bucket yoksa (yeni ortam) PRIVATE olarak oluşturulur (20270103000000 ile tutarlı).
--   (2) `personal_archive_tenant_bytes(uuid)`: tek tenant'ın arşivde kullandığı GERÇEK bayt
--       (storage.objects.metadata.size). SECURITY DEFINER, yalnız service_role çalıştırabilir.
--       Uygulama bu RPC yoksa kotayı atlar (geriye uyum) → apply sırası serbest.
--
-- TENANT/RLS: storage.objects RLS'i ve politikaları DEĞİŞMEZ. Fonksiyon yalnız verilen tenant
--   önekini toplar; istemci rolleri çalıştıramaz. Kişisel veri döndürmez (yalnız sayı).
-- VERİ KAYBI: YOK. Mevcut nesneler etkilenmez (limit yalnız yeni yüklemelerde).
-- İDEMPOTENT: ON CONFLICT / CREATE OR REPLACE.
-- ROLLBACK:
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'personal-archive';
--   DROP FUNCTION IF EXISTS public.personal_archive_tenant_bytes(uuid);
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('personal-archive', 'personal-archive', false, 52428800)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      public          = false;

CREATE OR REPLACE FUNCTION public.personal_archive_tenant_bytes(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$'
                           THEN (o.metadata->>'size')::bigint ELSE 0 END), 0)::bigint
    FROM storage.objects o
   WHERE o.bucket_id = 'personal-archive'
     AND p_tenant_id IS NOT NULL
     AND o.name LIKE p_tenant_id::text || '/%';
$$;

REVOKE ALL ON FUNCTION public.personal_archive_tenant_bytes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personal_archive_tenant_bytes(uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
