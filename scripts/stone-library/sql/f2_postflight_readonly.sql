-- Doğaltaş Kütüphanesi F2 — POSTFLIGHT (SALT-OKUMA). F1 + F2 (20271201000100) uygulandıktan sonra çalıştırılır.
-- Hiçbir şey yazmaz. Bir koşul tutmazsa EXCEPTION; hepsi tutarsa tek satır "F2 POSTFLIGHT PASS".
DO $$
DECLARE t text; r text; n int;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
            WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'stone\_library\_%' LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: RLS kapalı %', t; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: policy %', t; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: % rolünün % üzerinde ayrıcalığı var', r, t;
      END IF;
    END LOOP;
  END LOOP;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'stone\_library\_%';
  IF n <> 19 THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: tablo sayısı % (beklenen 19)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF n > 0 THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: anon/authenticated % fonksiyonu çalıştırabiliyor', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold' AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 44 THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: service_role RPC sayısı % (beklenen 44)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stone_library_records' AND column_name = 'quality_flags')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stone_library_published' AND column_name = 'has_image') THEN
    RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: F2 kolonları eksik';
  END IF;
  IF to_regclass('storage.buckets') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'stone-library-images' AND public = false) THEN
    RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: private görsel bucket yok';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_images) OR EXISTS (SELECT 1 FROM public.stone_library_license_grants) THEN
    RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: başlangıçta görsel / izin olmamalı';
  END IF;
  IF (SELECT count(*) FROM public.stone_library_vocab WHERE facet = 'color') <> 21 THEN RAISE EXCEPTION 'F2 POSTFLIGHT FAIL: renk sözlüğü'; END IF;
END $$;
SELECT 'F2 POSTFLIGHT PASS' AS sonuc;
