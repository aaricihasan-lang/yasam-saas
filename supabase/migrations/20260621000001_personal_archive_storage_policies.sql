-- ============================================================
-- personal-archive bucket — storage RLS policies
--
-- Bucket PRIVATE yapıldıktan sonra anon client ile
-- upload ve delete çalışması için gerekli politikalar.
--
-- OKUMA (SELECT / signed URL): yoktur — tüm okumalar
--   service role kullanan /api/kisisel-arsiv/signed-url
--   üzerinden yapılır. Bucket private olduğu için doğrudan
--   public URL erişimi yoktur.
--
-- YAZMA (INSERT): anon role ile izinli.
--   Tenant/kullanıcı doğrulaması uygulama katmanında
--   (path yapısı: {tenantId}/{archiveId}/...).
--
-- SİLME (DELETE): anon role ile izinli.
--   Aynı uygulama katmanı güvencesi geçerli.
-- ============================================================

-- Var olan policy'leri kaldır (idempotent)
drop policy if exists "personal_archive_anon_insert" on storage.objects;
drop policy if exists "personal_archive_anon_delete" on storage.objects;

-- Upload politikası
create policy "personal_archive_anon_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'personal-archive'
    and auth.role() = 'anon'
  );

-- Silme politikası
create policy "personal_archive_anon_delete"
  on storage.objects for delete
  using (
    bucket_id = 'personal-archive'
    and auth.role() = 'anon'
  );

-- SELECT politikası YOKTUR.
-- Tüm dosya okuma işlemleri service role key ile
-- /api/kisisel-arsiv/signed-url ve
-- /api/admin/kisisel-arsiv/signed-url üzerinden yapılır.
