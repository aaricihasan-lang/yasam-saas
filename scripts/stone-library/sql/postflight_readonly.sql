-- Doğaltaş Kütüphanesi F1 — POSTFLIGHT (SALT-OKUMA). Migration 20271201000000 uygulandıktan sonra çalıştırılır.
-- Hiçbir şey yazmaz. Bir koşul tutmazsa EXCEPTION ile durur; hepsi tutarsa tek satır "POSTFLIGHT PASS" döner.
-- Yerel kanıt: node scripts/final-hardening/pg-migration-check.mjs --fixture scripts/stone-library/pg/fixture.sql \
--   --migration supabase/migrations/20271201000000_stone_library_core.sql --twice --assert scripts/stone-library/sql/postflight_readonly.sql
DO $$
DECLARE
  v_tables text[] := ARRAY['stone_library_settings','stone_library_sources','stone_library_source_documents','stone_library_vocab',
    'stone_library_stones','stone_library_names','stone_library_external_ids','stone_library_import_batches','stone_library_import_events',
    'stone_library_raw','stone_library_records','stone_library_facets','stone_library_reviews','stone_library_history',
    'stone_library_delete_ops','stone_library_access_grants','stone_library_published'];
  t text; r text; n int;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: tablo yok %', t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: RLS kapalı %', t; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: beklenmeyen policy %', t; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'POSTFLIGHT FAIL: % rolünün % üzerinde ayrıcalığı var', r, t;
      END IF;
    END LOOP;
  END LOOP;
  -- RPC'ler: anon/authenticated hiçbirini çalıştıramaz; service_role yalnız sözleşmedekileri.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF n > 0 THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: anon/authenticated % stone_library fonksiyonunu çalıştırabiliyor', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND p.proname <> 'stone_library_fold';
  IF n <> 27 THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: service_role çalıştırabildiği RPC sayısı % (beklenen 27)', n; END IF;
  IF has_function_privilege('service_role', 'public.stone_library_refresh_all()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.stone_library_actor_is_owner(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: iç yardımcı service_role tarafından çalıştırılabiliyor';
  END IF;
  -- Başlangıç durumu: tek ayar satırı (sağlık kilidi KAPALI), sözlük 54, içerik ve yetki YOK.
  IF (SELECT count(*) FROM public.stone_library_settings) <> 1
     OR (SELECT health_content_publication_enabled FROM public.stone_library_settings) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: ayar satırı / sağlık kilidi beklenen durumda değil';
  END IF;
  IF (SELECT count(*) FROM public.stone_library_vocab) <> 54 THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: sözlük satır sayısı'; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_access_grants) THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: başlangıçta yetki olmamalı'; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_published) OR EXISTS (SELECT 1 FROM public.stone_library_stones)
     OR EXISTS (SELECT 1 FROM public.stone_library_sources) OR EXISTS (SELECT 1 FROM public.stone_library_raw) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: başlangıçta kütüphane boş olmalı';
  END IF;
  IF public.stone_library_fold('AMETİST') <> 'ametist' OR public.stone_library_fold('Lapis  Lazuli!') <> 'lapis lazuli' THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: Türkçe katlama';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN RAISE EXCEPTION 'POSTFLIGHT FAIL: pg_trgm yok'; END IF;
END $$;
SELECT 'POSTFLIGHT PASS' AS sonuc;
