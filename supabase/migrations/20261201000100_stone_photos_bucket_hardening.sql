-- =============================================================================
-- 20261201000100_stone_photos_bucket_hardening.sql
--
-- stone-photos bucket — MİNİMAL sertleştirme (MIME allow-list + boyut limiti)
--
-- BAĞLAM (Şifa Rehberi FAZ 1 preflight, production read-only doğrulama):
--   stone-photos bucket PAYLAŞIMLI: Doğaltaş (taş fotoğrafları, catalog/, tenant/)
--   + Şifa Rehberi (healing-guides/{tenantId}/...). Canlı durum:
--     public:true, file_size_limit:NULL, allowed_mime_types:NULL, anon list:200.
--   Mevcut nesne envanteri (örneklem): yalnız image/png + image/webp; 28KB–1.8MB.
--
-- BU DOSYANIN YAPTIĞI (yalnız YENİ upload'ları etkiler; mevcut nesnelere DOKUNMAZ):
--   - allowed_mime_types → yalnız görsel tipleri (png/jpeg/webp/gif)
--   - file_size_limit    → 10 MB (gözlenen max ~1.8MB'nin çok üstünde → normal
--                          kullanımı engellemez; kardeş client-analysis-images ile hizalı)
--
-- BİLİNÇLİ OLARAK YAPILMAYANLAR (cross-module regresyon riski → AYRI ONAY):
--   ⛔ public:true DEĞİŞTİRİLMEZ  — her iki modül de getPublicUrl ile public URL kullanıyor;
--      private'a çevirmek mevcut görsel bağlantılarını kırar. (Blocker olarak raporlandı.)
--   ⛔ anon object LISTING kapatma — storage.objects RLS gerektirir; public-read-by-URL'i
--      etkilememesi ayrıca doğrulanmalı (cross-module). Bu fazda yapılmaz.
--   ⛔ SVG/HTML gibi aktif içerik zaten allow-list dışında kalır (yalnız raster görseller).
--
-- ⚠️ APPLY POLİTİKASI: DOSYA'dır. Production storage mutation için KULLANICI ONAYI
--    olmadan UYGULANMAZ. Apply öncesi §DOĞRULAMA ile mevcut nesne MIME dağılımını
--    (özellikle Doğaltaş tarafında image dışı tip yoksa) tam teyit et.
-- =============================================================================

BEGIN;

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  file_size_limit = 10485760  -- 10 MB
WHERE id = 'stone-photos';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply öncesi — mevcut nesnelerin tamamı image mı?):
--   SELECT (metadata->>'mimetype') AS mime, count(*)
--   FROM storage.objects WHERE bucket_id='stone-photos' GROUP BY 1 ORDER BY 2 DESC;
--   -- Beklenen: yalnız image/* tipleri. Aksi halde allow-list'i genişlet veya apply etme.
--   SELECT max((metadata->>'size')::bigint) FROM storage.objects WHERE bucket_id='stone-photos';
--   -- Beklenen: 10485760'ın altında.
--
-- ROLLBACK (limitleri kaldırır):
--   UPDATE storage.buckets SET allowed_mime_types=NULL, file_size_limit=NULL WHERE id='stone-photos';
-- =============================================================================
