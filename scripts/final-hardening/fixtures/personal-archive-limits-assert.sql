-- DIJ-03 (20271104000200) davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM storage.buckets
   WHERE id = 'personal-archive' AND public = false AND file_size_limit = 52428800 AND allowed_mime_types IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'P1 personal-archive bucket limiti/özelliği beklenen değil'; END IF;

  n := public.personal_archive_tenant_bytes('10000000-0000-0000-0000-00000000000a');
  IF n <> 3500 THEN RAISE EXCEPTION 'P2 tenant A toplamı 3500 değil (%) — bozuk boyut 0 sayılmalı, başka bucket sayılmamalı', n; END IF;
  n := public.personal_archive_tenant_bytes('10000000-0000-0000-0000-00000000000b');
  IF n <> 7000 THEN RAISE EXCEPTION 'P3 tenant B toplamı 7000 değil (%)', n; END IF;
  n := public.personal_archive_tenant_bytes('10000000-0000-0000-0000-0000000000ff');
  IF n <> 0 THEN RAISE EXCEPTION 'P4 boş tenant 0 değil (%)', n; END IF;
  n := public.personal_archive_tenant_bytes(NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'P5 NULL tenant 0 değil (%)', n; END IF;

  IF has_function_privilege('anon', 'public.personal_archive_tenant_bytes(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.personal_archive_tenant_bytes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P6 istemci EXECUTE açık';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.personal_archive_tenant_bytes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P7 service_role EXECUTE yok';
  END IF;
  RAISE NOTICE 'DIJ-03 personal-archive limits assert: PASS';
END $$;
