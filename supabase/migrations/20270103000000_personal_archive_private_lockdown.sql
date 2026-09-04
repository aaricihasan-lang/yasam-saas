-- ============================================================
-- P1-3 — personal-archive storage lockdown
--
-- ÖNCEKİ PRODUCTION DURUMU (salt-okunur reality check ile doğrulandı):
--   storage.buckets: personal-archive.public = TRUE
--   storage.objects üzerinde personal-archive için PUBLIC/ANON policy'ler:
--     - "Allow public personal archive read"    (SELECT, {public}, bucket_id='personal-archive')
--     - "Allow public personal archive uploads"  (INSERT, {public}, bucket_id='personal-archive')
--     - "Allow public personal archive delete"   (DELETE, {public}, bucket_id='personal-archive')
--     - "personal_archive_anon_insert"           (INSERT, {public}, bucket_id + auth.role()='anon')
--     - "personal_archive_anon_delete"           (DELETE, {public}, bucket_id + auth.role()='anon')
--   → Bu policy'ler yalnız bucket adına bakıyordu; tenant izolasyonu YOKTU. Sonuç:
--     herhangi bir anon istemci keyfi tenant öneki altına dosya yükleyebiliyor
--     (cross-tenant insert) ve path'i bilen anon başka tenant objesini silebiliyordu
--     (cross-tenant delete). Public bucket + public SELECT → known-URL okuma da mümkündü.
--
-- BU MIGRATION (ADDITIVE; mevcut migration dosyaları DEĞİŞTİRİLMEZ):
--   1. Bucket'ı PRIVATE yapar (public = false) → kalıcı public URL / known-URL okuma biter.
--   2. Yukarıdaki 5 güvensiz public/anon policy'yi idempotent DROP eder.
--   3. YENİ anon/public policy OLUŞTURMAZ. Tüm upload/delete/read artık service_role
--      ile SUNUCU-YETKİLİ route'lardan geçer:
--        - upload : POST /api/kisisel-arsiv/files/upload   (requireModuleAccess + server path)
--        - delete : DELETE /api/kisisel-arsiv/files         (path DB'den çözülür, tenant-scoped)
--        - read   : GET  /api/kisisel-arsiv/signed-url       (service_role signed URL)
--
-- MEVCUT OBJELER: silinmez / taşınmaz / rename edilmez. Private bucket içinde kalır;
--   signed-url mekanizması service_role kullandığı için bu objeler için çalışmaya devam eder.
-- ============================================================

-- 1) Bucket'ı private yap (mevcut objeler korunur; yalnız erişim modeli değişir).
update storage.buckets
set public = false
where id = 'personal-archive';

-- 2) Güvensiz public/anon policy'leri kaldır (idempotent).
drop policy if exists "Allow public personal archive read"    on storage.objects;
drop policy if exists "Allow public personal archive uploads"  on storage.objects;
drop policy if exists "Allow public personal archive delete"   on storage.objects;
drop policy if exists "personal_archive_anon_insert"           on storage.objects;
drop policy if exists "personal_archive_anon_delete"           on storage.objects;

-- 3) YENİ policy OLUŞTURULMAZ. Bucket private + service_role erişimi yeterlidir.
--    (Herhangi bir yeni personal-archive public/anon policy eklenmesi bu fix'i geri alır.)
