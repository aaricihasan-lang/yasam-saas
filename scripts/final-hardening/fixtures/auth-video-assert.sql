-- AUTH item 11 assert: politikalar kalkmış, bucket hizalı, nesne SİLİNMEMİŞ, başka politika korunmuş.
DO $$
DECLARE b record; n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND (policyname LIKE 'video_temp%' OR coalesce(qual,'') LIKE '%video-temp%' OR coalesce(with_check,'') LIKE '%video-temp%');
  IF n <> 0 THEN RAISE EXCEPTION 'video-temp politikası kaldı: %', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='stone_photos_keep';
  IF n <> 1 THEN RAISE EXCEPTION 'başka bucket politikası silinmiş'; END IF;

  SELECT * INTO b FROM storage.buckets WHERE id='video-temp';
  IF b.public IS DISTINCT FROM false THEN RAISE EXCEPTION 'bucket public'; END IF;
  IF b.file_size_limit IS DISTINCT FROM 26214400 THEN RAISE EXCEPTION 'file_size_limit %', b.file_size_limit; END IF;
  IF b.allowed_mime_types IS NULL OR array_length(b.allowed_mime_types,1) <> 23 THEN RAISE EXCEPTION 'mime listesi yanlış'; END IF;
  IF 'application/octet-stream' = ANY(b.allowed_mime_types) THEN RAISE EXCEPTION 'octet-stream listede'; END IF;
  IF NOT ('audio/amr' = ANY(b.allowed_mime_types)) THEN RAISE EXCEPTION 'audio/amr eksik'; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='video-temp';
  IF n <> 1 THEN RAISE EXCEPTION 'nesne silinmiş (% kaldı)', n; END IF;
END $$;
