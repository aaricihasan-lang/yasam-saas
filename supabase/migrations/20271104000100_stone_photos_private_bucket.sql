-- =============================================================================
-- 20271104000100_stone_photos_private_bucket.sql
--
-- SATIŞ ÖNCESİ AŞAMA 1 — DY-05 / DB-03 (owner kararı: YAPALIM): `stone-photos` bucket güvenliği.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (Dashboard SQL Editor).
--    `supabase db push` KULLANMAYIN. ÖNCE owner salt-okunur manifestinin G bölümü alınmalı
--    (prod'da bucket public mi, hangi politikalar var) — bu dosya iki durumda da güvenlidir.
--
-- SORUN:
--   `stone-photos` (Danışan Yolculuğu taş fotoğrafları + Şifa Rehberi görselleri) repoda hiçbir
--   migration ile private yapılmıyor; tarihsel olarak PUBLIC + anon ALL politikası taşıyordu
--   ("Allow all storage for stone photos", roles {public}). Prod'daki kapatma yalnız dashboard'da
--   yapıldıysa yeni bir ortam (staging/DR geri yükleme) bucket'ı yeniden public açar.
--   expected-manifest.json `stone-photos.public=false` bekliyor; kural yerelde hiç test edilmedi.
--
-- KOD DURUMU (bu migration için ön koşul, origin/main e94ee5b7'de SAĞLANMIŞ):
--   Tüm tüketiciler sunucu-yetkili modelde (#252, #262): yükleme signed upload (prepare/finalize),
--   okuma kısa ömürlü signed URL, silme service_role + tenant prefix guard. Kodda stone-photos için
--   getPublicUrl / anon upload / anon remove YOK. Word raporları nesneyi service_role ile indirir.
--
-- BU DOSYANIN YAPTIĞI (idempotent):
--   1) Bucket yoksa OLUŞTURUR, varsa GÜNCELLER: public=false, file_size_limit=10 MB,
--      allowed_mime_types = png/jpeg/webp/gif (kodun allow-list'i ile birebir:
--      lib/clients/stonePhotoStorage.ts, lib/sifa-rehberi/stonePhotoStorage.ts).
--   2) storage.objects üzerinde `stone-photos`'a atıf yapan ve anon/authenticated/public rolüne
--      açık TÜM politikaları kaldırır (adı bilinen tarihsel politika dahil).
--   Diğer bucket'lara ve politikalara DOKUNMAZ. Nesne SİLMEZ/TAŞIMAZ.
--
-- ETKİ: anon anahtarıyla stone-photos listeleme/okuma/yazma/silme kapanır. Mevcut DB'deki eski
--   kalıcı public URL'ler (image_url) artık açılmaz — uygulama bunları KULLANMAZ (file_path → signed).
-- TENANT/RLS: storage.objects RLS'i değişmez; yalnız istemci rollerine açık politika kalkar.
--   Sunucu (service_role) erişimi RLS'i atladığı için uygulama akışı etkilenmez.
-- VERİ KAYBI: YOK.
--
-- ROLLBACK (yalnız acil durumda; güvenliği geri açar):
--   UPDATE storage.buckets SET public = true, file_size_limit = NULL, allowed_mime_types = NULL
--    WHERE id = 'stone-photos';
--   (Eski anon ALL politikası BİLİNÇLİ olarak geri yüklenmez.)
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stone-photos',
  'stone-photos',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND (coalesce(qual, '') ILIKE '%stone-photos%' OR coalesce(with_check, '') ILIKE '%stone-photos%')
       AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

COMMIT;
