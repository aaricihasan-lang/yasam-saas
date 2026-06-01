-- video-temp bucket: MIME kısıtını kaldır
-- Bucket video ve ses formatlarını kabul etsin.
-- Uygulama katmanında validateVideoFile ile kontrol yapıldığından
-- bucket seviyesinde kısıtlama gerekmez.
-- application/octet-stream (WhatsApp AMR vb.) de bu şekilde kabul edilir.

update storage.buckets
set allowed_mime_types = null
where id = 'video-temp';
