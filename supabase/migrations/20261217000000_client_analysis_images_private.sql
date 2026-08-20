-- =============================================================================
-- 20261217000000_client_analysis_images_private.sql
--
-- client-analysis-images — PRIVATE storage bucket (DY satış-blokeri kapanışı)
--
-- BAĞLAM:
--   Danışan analiz görselleri KİŞİSEL VERİDİR. Bucket 20260614000000 ile PUBLIC
--   oluşturulmuştu → anonim GET ile /object/public/... görsele erişilebiliyordu.
--   Bu migration bucket'ı PRIVATE'a çevirir. Erişim yalnız doğrulanmış sunucu
--   route'ları (service_role) üzerinden; görsel Word raporunda service_role
--   .download() ile deterministik object path'ten okunur.
--
-- ⚠️ ON CONFLICT DO UPDATE (DO NOTHING DEĞİL):
--   Bucket zaten var (public=true). DO UPDATE ile public=false + mevcut boyut/mime
--   yeniden dayatılır (idempotent). hd-chart-images precedent'i ile aynı desen.
--
-- ⛔ storage.objects üzerinde anon/authenticated için policy AÇILMAZ — tarayıcı
--    doğrudan storage'a ERİŞMEZ. Tüm upload/read/silme doğrulanmış server route +
--    service_role üzerinden yürür (service_role RLS-bypass; ek policy gerekmez).
-- ⛔ Mevcut dosya/bucket/kayıt SİLİNMEZ. image_url kolonuna DOKUNULMAZ (kod
--    tarafı deterministik path'ten okur → eski absolute URL satırları da çalışır).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-analysis-images',
  'client-analysis-images',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,             -- private'ı kesinleştir
  file_size_limit    = EXCLUDED.file_size_limit,    -- 10 MB (mevcut değer korunur)
  allowed_mime_types = EXCLUDED.allowed_mime_types; -- png/jpeg (mevcut değer korunur)

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT id, public, file_size_limit, allowed_mime_types
--     FROM storage.buckets WHERE id = 'client-analysis-images';
--     -- public=false, file_size_limit=10485760, allowed_mime_types={image/png,image/jpeg}
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='storage' AND tablename='objects'
--       AND qual ILIKE '%client-analysis-images%';   -- 0 (client'a açık policy yok)
-- =============================================================================
