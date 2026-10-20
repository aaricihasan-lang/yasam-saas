-- DY-05/DB-03: YENİ ORTAM (bucket yok) → migration bucket'ı PRIVATE oluşturur. Yerel embedded-pg.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM storage.buckets
   WHERE id = 'stone-photos' AND public = false AND file_size_limit = 10485760;
  IF n <> 1 THEN RAISE EXCEPTION 'F1 yeni ortamda stone-photos private oluşturulmadı'; END IF;
  RAISE NOTICE 'DY-05/DB-03 fresh assert: PASS';
END $$;
