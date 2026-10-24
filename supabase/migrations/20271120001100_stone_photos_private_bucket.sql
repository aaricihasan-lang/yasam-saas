-- =============================================================================
-- 20271120001100_stone_photos_private_bucket.sql
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
-- GÜVENLİK SINIRI: Kaldırılacak bir politika stone-photos ile birlikte BAŞKA bir bucket'a da atıf
--   yapıyorsa (ör. bucket_id IN ('stone-photos','x')) migration HİÇBİR ŞEY DEĞİŞTİRMEDEN durur
--   (RAISE → ROLLBACK); o politika elle incelenmelidir. Böylece diğer bucket/tenant yetkileri değişmez.
-- KİLİT: storage.buckets tek satır UPDATE; DROP POLICY storage.objects üzerinde kısa ACCESS EXCLUSIVE
--   kilit alır (milisaniyeler; o an süren storage istekleri kısa süre bekler). Düşük trafikte uygulayın.
--
-- GERİ DÖNÜŞ (güvenliği DÜŞÜRMEZ — bucket'ı yeniden PUBLIC yapmak varsayılan geri dönüş DEĞİLDİR):
--   1) Yükleme reddediliyorsa (beklenmeyen tür/boyut): yalnız sınırları gevşetin, bucket private kalır:
--        UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'stone-photos';
--   2) Görsel görüntülenemiyorsa: uygulama zaten signed URL kullanır; sorun kod tarafındadır →
--      ilgili PR revert edilir, bucket private kalır. Eski kalıcı public URL'ler kasıtlı olarak açılmaz.
--   3) public=true + anon politikası YALNIZ owner'ın yazılı kararıyla, mahremiyet riski kabul edilerek
--      ve süreli olarak düşünülebilir (önerilmez; danışan sağlık fotoğrafları tenant'lar arası açılır).
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
  b record;
BEGIN
  FOR p IN
    SELECT policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND (coalesce(qual, '') ILIKE '%stone-photos%' OR coalesce(with_check, '') ILIKE '%stone-photos%')
       AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  LOOP
    -- Başka bir bucket'a da atıf yapan politika kaldırılmaz → tüm migration durur (diğer bucket korunur).
    FOR b IN SELECT id FROM storage.buckets WHERE id <> 'stone-photos' LOOP
      IF p.expr LIKE '%''' || b.id || '''%' THEN
        RAISE EXCEPTION 'DY-05: politika "%" stone-photos ile birlikte "%" bucket''ına da atıf yapıyor; elle inceleyin (hiçbir değişiklik yapılmadı)', p.policyname, b.id;
      END IF;
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

COMMIT;
