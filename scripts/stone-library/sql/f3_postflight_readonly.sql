-- Doğaltaş Kütüphanesi F3 — POSTFLIGHT (SALT-OKUMA). F1 + F2 + F3 (20271201000200) uygulandıktan sonra çalıştırılır.
-- Hiçbir şey yazmaz. Bir koşul tutmazsa EXCEPTION; hepsi tutarsa tek satır "F3 POSTFLIGHT PASS".
DO $$
DECLARE t text; r text; n int; cfg record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
            WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'stone\_library\_%' LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: RLS kapalı %', t; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: policy %', t; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: % rolünün % üzerinde ayrıcalığı var', r, t;
      END IF;
    END LOOP;
  END LOOP;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'stone\_library\_%';
  IF n <> 19 THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: tablo sayısı % (beklenen 19; F3 tablo eklemez)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF n > 0 THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: anon/authenticated % fonksiyonu çalıştırabiliyor', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE 'stone\_library\_%' AND p.proname <> 'stone_library_fold' AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 48 THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: service_role RPC sayısı % (beklenen 48 = F1 27 + F2 17 + F3 5 − alternatif ad ekleme)', n; END IF;
  IF has_function_privilege('service_role', 'public.stone_library_name_add(uuid, uuid, text, text, text, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: alternatif ad ekleme RPC''si açık';
  END IF;
  -- Kaynak verisi koruması + görsel eşleşmesi tetikleyicileri (F2 birebir kuralı dahil)
  SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_stone_library_records_verbatim','trg_stone_library_facets_verbatim',
    'trg_stone_library_records_source_integrity','trg_stone_library_facets_source_integrity','trg_stone_library_stones_source_name',
    'trg_stone_library_images_binding','trg_stone_library_records_field_path','trg_stone_library_facets_field_path',
    'trg_stone_library_sources_kind','trg_stone_library_external_ids_link');
  IF n <> 10 THEN RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: koruma tetikleyicisi sayısı % (beklenen 10)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stone_library_stones_status_check' AND pg_get_constraintdef(oid) LIKE '%ready%' AND pg_get_constraintdef(oid) LIKE '%review%') THEN
    RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: yayın durumları kısıtı yok';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stone_library_stones' AND column_name = 'health_publish_decided_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stone_library_settings' AND column_name = 'medical_notice_tr') THEN
    RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: F3 kolonları eksik';
  END IF;
  -- İlk uygulamada production davranışı DEĞİŞMEZ: sağlık modu legal_review, genel kilit kapalı.
  SELECT health_publication_mode, health_content_publication_enabled INTO cfg FROM public.stone_library_settings WHERE id;
  IF cfg.health_publication_mode <> 'legal_review' OR cfg.health_content_publication_enabled THEN
    RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: sağlık yayın ayarı varsayılan değil (mod %, kilit açık %)', cfg.health_publication_mode, cfg.health_content_publication_enabled;
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE health_publish_decided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'F3 POSTFLIGHT FAIL: başlangıçta owner sağlık kararı olmamalı';
  END IF;
END $$;
SELECT 'F3 POSTFLIGHT PASS' AS sonuc;
