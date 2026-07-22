-- =============================================================================
-- 20260726010000_hd_chart_images_bucket_private.sql
--
-- hd-chart-images — PRIVATE storage bucket (HD-0 — güvenlik)
--
-- BAĞLAM:
--   HD harita görselleri kişisel veridir. Bucket PRIVATE olmalı; erişim yalnız
--   doğrulanmış sunucu route'ları (service_role) + kısa ömürlü signed URL üzerinden.
--   Salt-okunur probe (2026-07-22) canlıda 'hd-chart-images' bucket'ının HENÜZ
--   OLMADIĞINI gösterdi (eski public-bucket migration'ı production'a uygulanmamış).
--   Bu migration bucket'ı PRIVATE olarak kesinleştirir.
--
-- ⚠️ ON CONFLICT DO NOTHING KULLANILMAZ:
--   Başka bir ortamda bucket yanlışlıkla PUBLIC oluşturulmuşsa, DO UPDATE ile
--   public=false + doğru boyut/mime allow-list yeniden dayatılır (idempotent).
--
-- ⛔ anon/authenticated için storage policy AÇILMAZ — client doğrudan storage'a
--    ERİŞMEZ. Tüm upload/download/silme doğrulanmış server route + service_role
--    üzerinden yürür (service_role RLS-bypass; ek policy gerekmez).
-- ⛔ Mevcut dosya/bucket/kayıt SİLİNMEZ.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hd-chart-images',
  'hd-chart-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,            -- private'ı kesinleştir
  file_size_limit   = EXCLUDED.file_size_limit,   -- 5 MB
  allowed_mime_types = EXCLUDED.allowed_mime_types; -- jpg/png/webp

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT id, public, file_size_limit, allowed_mime_types
--     FROM storage.buckets WHERE id = 'hd-chart-images';
--     -- public=false, file_size_limit=5242880, allowed_mime_types={image/jpeg,image/png,image/webp}
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='storage' AND tablename='objects'
--       AND qual ILIKE '%hd-chart-images%';   -- 0 (client'a açık policy yok)
-- =============================================================================
