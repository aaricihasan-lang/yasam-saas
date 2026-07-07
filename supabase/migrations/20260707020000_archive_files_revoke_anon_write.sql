-- ============================================================
-- K-3: personal_archive_files — anon YAZMA yetkisini kaldır
--
-- Neden: dosya satırı insert/delete tarayıcıdan anon key ile yapılıyordu.
-- Artık yazmalar /api/kisisel-arsiv/files (service_role) üzerinden.
-- anon/authenticated için INSERT/UPDATE/DELETE kaldırılır.
--
-- SELECT KORUNUR: admin çalışma-alanı arşiv görünümleri (app/admin/users/[id]/
-- workspace/archive/*) hâlâ anon SELECT kullanıyor → kilitlenmez. (İstemci
-- listesi artık server route'tan gelir; admin okuması anon kalır.)
--
-- DEPLOY SIRASI (P1c'nin TERSİ): ÖNCE kod deploy (istemci artık anon yazmıyor),
-- SONRA bu revoke. Ters sırada eski prod kodu "permission denied" alır.
-- İdempotent: tekrar çalıştırılabilir.
-- ============================================================

revoke insert, update, delete on public.personal_archive_files from anon;
revoke insert, update, delete on public.personal_archive_files from authenticated;
