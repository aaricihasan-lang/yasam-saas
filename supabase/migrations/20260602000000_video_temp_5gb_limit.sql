-- video-temp bucket: dosya boyutu limitini 5 GB'a yükselt
-- 5 GB = 5 * 1024 * 1024 * 1024 = 5368709120 byte

update storage.buckets
set file_size_limit = 5368709120
where id = 'video-temp';
