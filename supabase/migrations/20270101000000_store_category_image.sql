-- ============================================================
-- 20270101000000_store_category_image.sql
--
-- YAŞAM SİSTEMİ DOĞAL PAZAR — V1.1 kategori görsel yönetimi (ADDITIVE).
--
-- KAPSAM: store_categories tablosuna nullable image_path kolonu eklenir.
--   Her kategori EN FAZLA bir ana görsele sahip olur (ayrı görsel tablosu YOK).
--   Görsel dosyaları mevcut public `store-product-images` bucket'ında
--   `categories/{categoryId}/{uuid}.{ext}` namespace'inde tutulur (YENİ BUCKET YOK).
--
-- NEDEN ADDITIVE / GERİ-UYUMLU:
--   * image_path NULL DEFAULT → mevcut satırlar (ör. gerçek "ANALİZ" kategorisi ve
--     "Doğal Taşlar" vb.) değişmeden kalır; hiçbir veri yeniden yazılmaz.
--   * Eski uygulama kodu bu kolonu bilmese de okuma/yazmayı bozmaz
--     (INSERT'ler image_path vermez → DEFAULT NULL; SELECT * yeni kolonu yok sayabilir).
--   * Yeni tablo, bucket, RLS/grant değişikliği YOK — yalnız kolon + CHECK.
--
-- CONSTRAINT: image_path IS NULL VEYA (boş-değil AND <= 500 karakter) —
--   store_product_images.file_path (<=500) sınırıyla uyumlu.
-- ============================================================

BEGIN;

ALTER TABLE public.store_categories
  ADD COLUMN image_path text;

ALTER TABLE public.store_categories
  ADD CONSTRAINT store_categories_image_path_chk CHECK (
    image_path IS NULL OR (btrim(image_path) <> '' AND char_length(image_path) <= 500)
  );

COMMIT;
