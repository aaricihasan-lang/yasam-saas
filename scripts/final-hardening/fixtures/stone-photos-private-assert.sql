-- DY-05/DB-03 (20271106000100) davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
DO $$
DECLARE n int; b record;
BEGIN
  SELECT * INTO b FROM storage.buckets WHERE id = 'stone-photos';
  IF b.public IS DISTINCT FROM false THEN RAISE EXCEPTION 'S1 stone-photos hâlâ public'; END IF;
  IF b.file_size_limit IS DISTINCT FROM 10485760 THEN RAISE EXCEPTION 'S2 file_size_limit 10 MB değil (%)', b.file_size_limit; END IF;
  IF b.allowed_mime_types IS DISTINCT FROM ARRAY['image/png','image/jpeg','image/webp','image/gif'] THEN
    RAISE EXCEPTION 'S3 MIME allow-list beklenen değil (%)', b.allowed_mime_types;
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (coalesce(qual, '') ILIKE '%stone-photos%' OR coalesce(with_check, '') ILIKE '%stone-photos%');
  IF n <> 0 THEN RAISE EXCEPTION 'S4 stone-photos istemci politikası kaldı (%)', n; END IF;
  -- Komşular değişmedi
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'store images public read';
  IF n <> 1 THEN RAISE EXCEPTION 'S5 komşu bucket politikası silindi'; END IF;
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'store-product-images' AND public = true;
  IF n <> 1 THEN RAISE EXCEPTION 'S6 store-product-images değişti'; END IF;
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'dogaltas-photos' AND public = false AND file_size_limit IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'S7 dogaltas-photos değişti'; END IF;
  -- Nesneler korunur
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'stone-photos';
  IF n <> 2 THEN RAISE EXCEPTION 'S8 stone-photos nesneleri değişti (%)', n; END IF;
  RAISE NOTICE 'DY-05/DB-03 stone-photos assert: PASS';
END $$;
