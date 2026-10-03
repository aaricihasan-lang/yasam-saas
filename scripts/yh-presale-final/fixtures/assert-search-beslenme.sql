-- YH satış öncesi nihai — ASSERT: arama v2 (LIMIT doğruluğu, tenant izolasyonu, tarih ekseni) +
-- Beslenme CDC (SYSTEM reddi, çocuk→ebeveyn, yayılım) + M3 aktivasyon (yerel PG).

-- ─── Arama v2: kapalı modülde >150 eşleşme + açık modülde 1 eşleşme → açık sonuç GÖRÜNÜR ───
DO $s1$
DECLARE
  c_a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  c_b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  w constant float4[] := ARRAY[1.0, 0.6, 0.35, 0.15]::float4[];
  v_n int; v_mod int; v_bio_v1 int;
BEGIN
  INSERT INTO public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, title, search_text)
  SELECT c_a, 'dogaltas', 'stones', gen_random_uuid(), 'zzqlimit taş ' || g, 'zzqlimit'
  FROM generate_series(1, 200) AS g;
  INSERT INTO public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, title, search_text)
  VALUES (c_a, 'biyoenerji', 'bioenergy_symbols', gen_random_uuid(), 'zzqlimit sembol', 'zzqlimit');

  -- v1: 150 sınırı modül filtresinden ÖNCE → biyoenerji sonucu ilk 150'de olmayabilir (sorunun kanıtı).
  SELECT count(*) FILTER (WHERE source_module = 'biyoenerji') INTO v_bio_v1
  FROM public.yh_search_candidates('zzqlimit:*', c_a, false, w, 150);

  -- v2: kullanıcı yalnız biyoenerji'ye yetkili (doğaltaş kapalı) → biyoenerji sonucu MUTLAKA görünür.
  SELECT count(*) INTO v_n FROM public.yh_search_candidates_v2('zzqlimit:*', c_a, w, 150, ARRAY['biyoenerji']);
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT search-v2-limit: acik modul sonucu gorunmeli (%), v1=%', v_n, v_bio_v1; END IF;

  -- v2: modül filtresi yok (admin) → 150 tavanı korunur.
  SELECT count(*) INTO v_n FROM public.yh_search_candidates_v2('zzqlimit:*', c_a, w, 150, NULL);
  IF v_n <> 150 THEN RAISE EXCEPTION 'ASSERT search-v2-cap: 150 beklenir (%)', v_n; END IF;

  -- v2: boş modül listesi → 0 satır (hiçbir modüle yetki yok).
  SELECT count(*) INTO v_n FROM public.yh_search_candidates_v2('zzqlimit:*', c_a, w, 150, ARRAY[]::text[]);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT search-v2-empty-scope: 0 beklenir (%)', v_n; END IF;

  -- Tenant izolasyonu: B, A'nın kayıtlarını HİÇBİR modül filtresiyle göremez.
  SELECT count(*) INTO v_n FROM public.yh_search_candidates_v2('zzqlimit:*', c_b, w, 500, NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT search-v2-tenant: baska tenant 0 gormeli (%)', v_n; END IF;

  -- Ortak (NULL tenant) satır v2'de ASLA dönmez.
  INSERT INTO public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, title, search_text)
  VALUES (NULL, 'aromaterapi', 'aromatherapy_oils', gen_random_uuid(), 'zzqshared', 'zzqshared');
  SELECT count(*) INTO v_n FROM public.yh_search_candidates_v2('zzqshared:*', c_a, w, 150, NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT search-v2-no-shared: NULL tenant satir donmemeli (%)', v_n; END IF;

  -- Demo tenant hariç.
  SELECT count(*) INTO v_mod FROM public.yh_search_candidates_v2('zzqlimit:*', '40f842a0-e3e8-448c-8971-9a938e1faccb', w, 150, NULL);
  IF v_mod <> 0 THEN RAISE EXCEPTION 'ASSERT search-v2-demo: demo 0 (%)', v_mod; END IF;
END
$s1$;

-- ─── Danışan v2: tarih ekseni occurred_at → source_updated_at (notlar artık kaybolmaz) ───
DO $s2$
DECLARE
  c_a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  c_b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  w constant float4[] := ARRAY[1.0, 0.6, 0.35, 0.15]::float4[];
  v_client uuid; v_client_b uuid; v_n int;
BEGIN
  INSERT INTO public.clients (tenant_id, ad, soyad) VALUES (c_a, 'ZZ', 'Danışan') RETURNING id INTO v_client;
  INSERT INTO public.clients (tenant_id, ad, soyad) VALUES (c_b, 'ZZ', 'Danışan') RETURNING id INTO v_client_b;
  INSERT INTO public.yasam_hafizasi_client_index
    (tenant_id, client_id, source_module, source_table, source_id, title, search_text, occurred_at, source_updated_at)
  VALUES
    (c_a, v_client, 'danisan_not', 'client_notes', gen_random_uuid(), 'zzqnot', 'zzqnot', NULL, '2026-10-01T10:00:00Z'),
    (c_a, v_client, 'danisan_seans', 'client_sessions', gen_random_uuid(), 'zzqnot seans', 'zzqnot', '2026-09-15T10:00:00Z', NULL),
    (c_b, v_client_b, 'danisan_not', 'client_notes', gen_random_uuid(), 'zzqnot', 'zzqnot', NULL, '2026-10-01T10:00:00Z');

  SELECT count(*) INTO v_n FROM public.yh_search_tenant_client_candidates_v2('zzqnot:*', c_a, w, 150, NULL, '2026-10-01', '2026-10-01');
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT client-v2-date-fallback: occurred_at NULL not tarihte bulunmali (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.yh_search_tenant_client_candidates_v2('zzqnot:*', c_a, w, 150, NULL, '2026-09-01', '2026-09-30');
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT client-v2-date-window: yalniz eylul seansi (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.yh_search_tenant_client_candidates_v2('zzqnot:*', c_a, w, 150, ARRAY['danisan_seans'], NULL, NULL);
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT client-v2-modules: yalniz seans (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.yh_search_tenant_client_candidates_v2('zzqnot:*', c_a, w, 150, NULL, NULL, NULL);
  IF v_n <> 2 THEN RAISE EXCEPTION 'ASSERT client-v2-tenant: A yalniz kendi 2 kaydini gorur (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.yh_search_client_candidates_v2('zzqnot:*', c_a, v_client_b, w, 150, NULL, NULL, NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT client-v2-cross-client: A, B danisanini goremez (%)', v_n; END IF;
END
$s2$;

-- ─── Beslenme CDC ───
DO $b1$
DECLARE
  c_sys constant uuid := '00000000-0000-4000-8000-000000000001';
  c_a   constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_sys uuid; v_food uuid; v_topic uuid; v_tpl uuid; v_src uuid; v_n int; v_ver1 bigint; v_ver2 bigint; v_op text;
BEGIN
  INSERT INTO public.nutrition_foods (tenant_id, name_tr) VALUES (c_sys, 'ZZ SYSTEM elma') RETURNING id INTO v_sys;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id = v_sys;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT beslenme-system: SYSTEM besin enqueue edilmemeli'; END IF;
  INSERT INTO public.nutrition_food_portions (tenant_id, food_id, label_tr) VALUES (c_sys, v_sys, '1 adet');
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_key LIKE 'beslenme:%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT beslenme-system-child: SYSTEM cocugu enqueue edilmemeli (%)', v_n; END IF;

  INSERT INTO public.nutrition_foods (tenant_id, name_tr, origin_food_id) VALUES (c_a, 'ZZ kişisel elma', v_sys) RETURNING id INTO v_food;
  SELECT event_version INTO v_ver1 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:foods' AND source_id = v_food AND tenant_id = c_a;
  IF v_ver1 IS NULL THEN RAISE EXCEPTION 'ASSERT beslenme-fork: tenant fork enqueue edilmeli'; END IF;

  INSERT INTO public.nutrition_food_portions (tenant_id, food_id, label_tr) VALUES (c_a, v_food, '1 orta boy');
  SELECT event_version INTO v_ver2 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:foods' AND source_id = v_food;
  IF v_ver2 <= v_ver1 THEN RAISE EXCEPTION 'ASSERT beslenme-child-parent: porsiyon besini yeniden kuyruga almali'; END IF;

  INSERT INTO public.nutrition_topics (tenant_id, title) VALUES (c_a, 'ZZ kalp sağlığı') RETURNING id INTO v_topic;
  INSERT INTO public.nutrition_topic_sections (tenant_id, topic_id, heading, content) VALUES (c_a, v_topic, 'Giriş', 'ZZ içerik');
  INSERT INTO public.nutrition_topic_foods (tenant_id, topic_id, food_id, relation_type) VALUES (c_a, v_topic, v_food, 'recommended');
  SELECT event_version INTO v_ver1 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:topics' AND source_id = v_topic;
  UPDATE public.nutrition_foods SET name_tr = 'ZZ kişisel elma 2' WHERE id = v_food;
  SELECT event_version INTO v_ver2 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:topics' AND source_id = v_topic;
  IF v_ver2 <= v_ver1 THEN RAISE EXCEPTION 'ASSERT beslenme-fanout: besin adi degisimi konuyu yenilemeli'; END IF;

  INSERT INTO public.nutrition_sources (tenant_id, title) VALUES (c_a, 'ZZ kaynak') RETURNING id INTO v_src;
  INSERT INTO public.nutrition_topic_sources (tenant_id, topic_id, source_id) VALUES (c_a, v_topic, v_src);
  SELECT event_version INTO v_ver1 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:topics' AND source_id = v_topic;
  UPDATE public.nutrition_sources SET title = 'ZZ kaynak 2' WHERE id = v_src;
  SELECT event_version INTO v_ver2 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:topics' AND source_id = v_topic;
  IF v_ver2 <= v_ver1 THEN RAISE EXCEPTION 'ASSERT beslenme-source-fanout: kaynak basligi konuyu yenilemeli'; END IF;

  INSERT INTO public.nutrition_templates (tenant_id, title) VALUES (c_a, 'ZZ kahvaltı şablonu') RETURNING id INTO v_tpl;
  SELECT event_version INTO v_ver1 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:templates' AND source_id = v_tpl;
  INSERT INTO public.nutrition_template_meals (tenant_id, template_id, label, meal_type, note) VALUES (c_a, v_tpl, 'Kahvaltı', 'breakfast', 'ZZ danışan notu');
  SELECT event_version INTO v_ver2 FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:templates' AND source_id = v_tpl;
  IF v_ver2 <= v_ver1 THEN RAISE EXCEPTION 'ASSERT beslenme-template-child: ogun sablonu yenilemeli'; END IF;

  -- Konu silme → bölüm/bağ cascade + konu DELETE olayı coalescing'de son söz.
  DELETE FROM public.nutrition_topics WHERE id = v_topic;
  SELECT operation INTO v_op FROM public.yasam_hafizasi_outbox WHERE source_key = 'beslenme:topics' AND source_id = v_topic;
  IF v_op <> 'delete' THEN RAISE EXCEPTION 'ASSERT beslenme-delete: konu silme delete olayi olmali (%)', v_op; END IF;

  -- Plan/danışan tablolarına HİÇBİR trigger yok (fixture'da tablo yok; trigger sayısı kontrolü).
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgname LIKE 'yh_cdc_nutrition_%' AND NOT tgisinternal;
  IF v_n <> 13 THEN RAISE EXCEPTION 'ASSERT beslenme-trigger-count: 13 beklenir (%)', v_n; END IF;
END
$b1$;

-- ─── M3: hedef mesleki kaynaklar aktif, backfill kapalı; kapsam dışılar dokunulmadı ───
DO $m3$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.yh_source_activation
  WHERE source_key IN (
    'dogaltas:minerals','dogaltas:knowledge','dogaltas:combinations','refleksoloji:protocols',
    'sifa_rehberi:guides','sifa_rehberi:guide-sections','biyoenerji:subconscious-causes','biyoenerji:symbols',
    'biyoenerji:chakras','biyoenerji:imaginations','biyoenerji:sessions','biyoenerji:energy-bodies',
    'biyoenerji:chakra-blocks','aromaterapi:oils','aromaterapi:reference-sheets','aromaterapi:reference-rows',
    'aromaterapi:blends','aromaterapi:plant-taxa','aromaterapi:preparations','aromaterapi:method',
    'kupa_hacamat:knowledge','kupa_hacamat:points','kupa_hacamat:topics','kupa_hacamat:techniques',
    'kupa_hacamat:safety-notes','kisisel_arsiv:archives','beslenme:foods','beslenme:topics','beslenme:templates')
    AND is_active = true AND backfill_allowed = false;
  IF v_n <> 29 THEN RAISE EXCEPTION 'ASSERT m3-activation: 29 aktif kaynak beklenir (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.yh_source_activation WHERE source_key LIKE 'numeroloji:%' OR source_key LIKE 'yebs:%' OR source_key = 'refleksoloji:notes';
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT m3-out-of-scope: kapsam disi kaynak aktive edilmemeli (%)', v_n; END IF;
END
$m3$;
