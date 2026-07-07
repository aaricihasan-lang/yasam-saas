-- ============================================================
-- K-3: video_transcription_jobs — anon YAZMA yetkisini kaldır
--
-- Neden: iş kaydı oluşturma/güncelleme tarayıcıdan anon key ile yapılıyordu.
-- Artık tüm yazmalar /api/video-ceviri/job + /transcribe/translate/... (service_role)
-- üzerinden. anon/authenticated için INSERT/UPDATE/DELETE kaldırılır.
--
-- SELECT KORUNUR: admin çalışma-alanı görünümleri hâlâ anon SELECT kullanıyor;
-- kilitlenmez (istemci listesi artık server route'tan gelse de admin okuması anon).
--
-- DEPLOY SIRASI (P1c'nin TERSİ): ÖNCE kod deploy edilmeli (istemci artık anon
-- yazmıyor), SONRA bu revoke uygulanmalı. Ters sırada eski prod kodu (anon yazma)
-- "permission denied" alır.
-- İdempotent: tekrar çalıştırılabilir.
-- ============================================================

revoke insert, update, delete on public.video_transcription_jobs from anon;
revoke insert, update, delete on public.video_transcription_jobs from authenticated;
