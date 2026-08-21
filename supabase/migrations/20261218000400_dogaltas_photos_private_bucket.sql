-- =============================================================================
-- 20261218000400_dogaltas_photos_private_bucket.sql
-- (Not: timestamp, upstream'de eklenen 20261218000000..000300 YH client migration'ları ile
--  çakışmayı önlemek için 000400'e alındı — apply sırası bu YH migration'larından SONRA.)
--
-- F-016 — Doğaltaş taş fotoğrafları için ADANMIŞ PRIVATE bucket (`dogaltas-photos`).
--
-- BAĞLAM (satış-gate red-team F-016):
--   Mevcut `stone-photos` bucket PUBLIC ve PAYLAŞIMLI: Doğaltaş (catalog/{tenantId}/…)
--   + Şifa Rehberi (healing-guides/{tenantId}/…) + danışan-çalışma-alanı. Bu bucket'ı
--   private'a çevirmek o iki modülün getPublicUrl bağlantılarını kırar → satış-gate
--   KAPSAMI DIŞI (cross-module). Bu yüzden Doğaltaş'a AYRI private bucket verilir; paylaşımlı
--   bucket'a DOKUNULMAZ.
--
-- BU DOSYANIN YAPTIĞI:
--   - `dogaltas-photos` bucket'ını OLUŞTURUR (yoksa) veya günceller: public=false,
--     MIME allow-list (png/jpeg/webp/gif), file_size_limit=10 MB. Idempotent (ON CONFLICT).
--   - anon/authenticated için storage.objects READ policy AÇMAZ → tüm erişim server
--     route'ları (service_role) üzerinden: yükleme /api/dogaltas/stones/photos,
--     okuma /api/dogaltas/stones/photos/signed-urls (kısa ömürlü signed URL).
--
-- BİLİNÇLİ OLARAK YAPILMAYANLAR:
--   ⛔ `stone-photos` bucket'ı DEĞİŞTİRİLMEZ (siblinglar korunur).
--   ⛔ Veri taşıma / backfill YOK — prod pre-check: mevcut Doğaltaş görsel referansı = 0.
--   ⛔ Mevcut nesneler SİLİNMEZ.
--
-- ⚠️ APPLY POLİTİKASI: Bu bir DOSYA'dır. Production storage mutation için AYRI KULLANICI
--    ONAYI olmadan UYGULANMAZ (FAZ 2). KOD TARAFI ZATEN NİHAİ: STONE_PHOTO_BUCKET =
--    'dogaltas-photos', file_path canonical (kalıcı public URL yok), render batch signed-URL
--    çözücüye bağlı. FAZ 2 yalnız apply + deploy + UAT'tir; ek source-code değişikliği GEREKMEZ.
--    Deployment sırası (Model A): önce bu migration apply (bucket oluşur), SONRA kod deploy.
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dogaltas-photos',
  'dogaltas-photos',
  false,                                                       -- PRIVATE
  10485760,                                                    -- 10 MB
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası):
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id='dogaltas-photos';
--   -- Beklenen: public=false, 10485760, {image/webp,image/jpeg,image/png,image/gif}
--
-- ROLLBACK (bucket'ı yeniden public yapar — gerekirse):
--   UPDATE storage.buckets SET public=true WHERE id='dogaltas-photos';
--   -- Tümüyle geri almak için (yalnız boşsa güvenli):
--   -- DELETE FROM storage.buckets WHERE id='dogaltas-photos'
--   --   AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='dogaltas-photos');
-- =============================================================================
