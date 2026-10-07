-- ASTROLOJİ AŞAMA 2 assert: KB / çalışma notu / DEĞİŞMEZ analiz / atomik+idempotent kaydetme /
-- KVKK cascade / alan-yolu denetimi. Yalnız yerel embedded-postgres.

-- ─── 1) Grant / RLS ──────────────────────────────────────────────────────────
DO $$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['astro_kb_entries','astro_expert_notes','astro_analyses','astro_analysis_notes','astro_unmapped_fields'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION '% RLS kapalı', t; END IF;
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n <> 0 THEN RAISE EXCEPTION '% policy var', t; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '% anon/authenticated SELECT açık', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION '% service_role SELECT yok', t; END IF;
  END LOOP;
  -- Kayıtlı analiz + notları DEĞİŞMEZ.
  IF has_table_privilege('service_role', 'public.astro_analyses', 'UPDATE') OR has_table_privilege('service_role', 'public.astro_analyses', 'DELETE') THEN
    RAISE EXCEPTION 'astro_analyses UPDATE/DELETE açık';
  END IF;
  IF has_table_privilege('service_role', 'public.astro_analysis_notes', 'UPDATE') OR has_table_privilege('service_role', 'public.astro_analysis_notes', 'DELETE') THEN
    RAISE EXCEPTION 'astro_analysis_notes UPDATE/DELETE açık';
  END IF;
  IF has_table_privilege('service_role', 'public.astro_expert_notes', 'DELETE') THEN RAISE EXCEPTION 'çalışma notu DELETE açık (beklenmez)'; END IF;
  IF NOT has_table_privilege('service_role', 'public.astro_kb_entries', 'DELETE') THEN RAISE EXCEPTION 'KB DELETE yok'; END IF;
  IF has_function_privilege('anon', 'public.astro_analysis_save(uuid, uuid, uuid, integer, uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon astro_analysis_save çalıştırabiliyor';
  END IF;
END
$$;

-- ─── 2) service_role akışları ────────────────────────────────────────────────
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c2 uuid := '22222222-2222-4222-8222-222222222222';
  u  uuid := '99999999-9999-4999-8999-999999999999';
  r jsonb; p uuid; a1 uuid; a2 jsonb; n integer; ok boolean; req uuid := 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
  res uuid := 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
BEGIN
  r := public.astro_profile_create(ta, u, c2, 'Ayşe — natal', '1991-03-02', '08:15', true, 'exact_record',
        'tr-06-ankara', 'Ankara, Türkiye', 39.93, 32.85, 'Europe/Istanbul', 'auto', 10800, '1991-03-02T05:15:00Z');
  p := (r->>'profile_id')::uuid;
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema,
    projection_version, created_by_user_id)
  VALUES (res, ta, p, 1, 'western.natal', 'roxy', 'v2', 'a', '/astrology/natal-chart', '{}', repeat('d', 64), '{}', '{"bodies":[]}', 's', 'natal-proj-2', u);

  -- KB + çalışma notu.
  INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body)
  VALUES (ta, u, 'western', 'planet_in_house:saturn:7', 'Satürn 7. ev', 'Not A');
  INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, section_key, body)
  VALUES (ta, u, p, 'western.natal', 'overall', 'Ayşe için çalışma notu v1');

  -- Geçersiz konu anahtarı reddedilir.
  ok := false;
  BEGIN
    INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body)
    VALUES (ta, u, 'western', 'Satürn 7. ev', 't', 'b');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'serbest metin konu anahtarı kabul edildi'; END IF;

  -- Atomik kaydetme + not kopyası.
  r := public.astro_analysis_save(ta, u, p, 1, res, 'western.natal', 'Ayşe — Natal', req,
        '{"label":"Ayşe"}', '{"houseSystem":"placidus"}', '{"bodies":[]}', '[{"topicKey":"planet_in_house:saturn:7","body":"Not A"}]',
        false, NULL, '{"provider":"roxy"}', '[{"section_key":"overall","body":"Ayşe için çalışma notu v1"}]');
  a1 := (r->>'analysis_id')::uuid;
  IF (r->>'reused')::boolean THEN RAISE EXCEPTION 'ilk kayıt reused döndü'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_notes WHERE analysis_id = a1 AND body = 'Ayşe için çalışma notu v1';
  IF n <> 1 THEN RAISE EXCEPTION 'not kopyası yok'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1 AND client_id = c2;
  IF n <> 1 THEN RAISE EXCEPTION 'danışan bağı profilden alınmadı'; END IF;

  -- İdempotent: aynı istek kimliği → aynı analiz, yeni satır yok.
  a2 := public.astro_analysis_save(ta, u, p, 1, res, 'western.natal', 'tekrar', req,
        '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  IF (a2->>'analysis_id')::uuid <> a1 OR NOT (a2->>'reused')::boolean THEN RAISE EXCEPTION 'idempotency bozuk'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE tenant_id = ta;
  IF n <> 1 THEN RAISE EXCEPTION 'çift analiz: %', n; END IF;

  -- Atomiklik: geçersiz not bölümü → analiz de YAZILMAZ.
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save(ta, u, p, 1, res, 'western.natal', 'bozuk', gen_random_uuid(),
        '{}', '{}', '{}', '[]', false, NULL, '{}', '[{"section_key":"GEÇERSİZ bölüm","body":"x"}]');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'geçersiz not kabul edildi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE tenant_id = ta;
  IF n <> 1 THEN RAISE EXCEPTION 'atomiklik bozuk: yarım analiz kaldı (%)', n; END IF;

  -- Yorum dahil değilken yorum snapshot'ı tutarlılığı (CHECK).
  ok := false;
  BEGIN
    INSERT INTO public.astro_analyses (tenant_id, owner_user_id, profile_id, profile_revision, technique, title, save_request_id,
      profile_snapshot, method_snapshot, technical_snapshot, provider_interp_included, provider_interp_snapshot, versions_snapshot)
    VALUES (ta, u, p, 1, 'western.natal', 'x', gen_random_uuid(), '{}', '{}', '{}', false, '{"x":1}', '{}');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'dahil değil ama yorum snapshot kabul edildi'; END IF;

  -- DEĞİŞMEZ: UPDATE / DELETE yetkisi yok.
  ok := false;
  BEGIN UPDATE public.astro_analyses SET title = 'değişti' WHERE id = a1;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'analiz UPDATE engellenmedi'; END IF;
  ok := false;
  BEGIN UPDATE public.astro_analysis_notes SET body = 'değişti' WHERE analysis_id = a1;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'analiz notu UPDATE engellenmedi'; END IF;

  -- Kaynak değişince snapshot DEĞİŞMEZ.
  UPDATE public.astro_kb_entries SET body = 'Not B', revision = revision + 1 WHERE tenant_id = ta AND topic_key = 'planet_in_house:saturn:7';
  UPDATE public.astro_expert_notes SET body = 'Ayşe için çalışma notu v2', revision = revision + 1 WHERE tenant_id = ta AND profile_id = p;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1 AND kb_snapshot->0->>'body' = 'Not A';
  IF n <> 1 THEN RAISE EXCEPTION 'KB snapshot değişti'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_notes WHERE analysis_id = a1 AND body = 'Ayşe için çalışma notu v1';
  IF n <> 1 THEN RAISE EXCEPTION 'not snapshot değişti'; END IF;

  -- Çapraz tenant: B tenant'ı A profiline analiz yazamaz.
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save(tb, u, p, 1, NULL, 'western.natal', 'x', gen_random_uuid(), '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN no_data_found THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant analiz engellenmedi'; END IF;

  -- Alan yolu denetimi: yalnız yol; değer/serbest metin reddedilir; tekrar görülünce sayaç artar.
  PERFORM public.astro_unmapped_touch('roxy', '/astrology/natal-chart', ARRAY['aiReading', 'planets[].traitProfile']);
  PERFORM public.astro_unmapped_touch('roxy', '/astrology/natal-chart', ARRAY['aiReading']);
  SELECT seen_count INTO n FROM public.astro_unmapped_fields WHERE field_path = 'aiReading';
  IF n <> 2 THEN RAISE EXCEPTION 'seen_count %', n; END IF;
  ok := false;
  BEGIN PERFORM public.astro_unmapped_touch('roxy', '/x', ARRAY['Güneş Yengeç burcunda — yorum metni']);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'değer/serbest metin alan yolu olarak kabul edildi'; END IF;

  PERFORM set_config('astro.p2_analysis', a1::text, false);
END
$$;
RESET ROLE;

-- ─── 3) Sonuç satırı silinse bile snapshot kalır; danışan silinince (KVKK) zincir silinir ─
DO $$
DECLARE a1 uuid := current_setting('astro.p2_analysis')::uuid; n integer;
BEGIN
  DELETE FROM public.astro_provider_results WHERE id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1 AND result_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'sonuç silinince analiz korunmadı / bağ NULL olmadı'; END IF;

  DELETE FROM public.clients WHERE id = '22222222-2222-4222-8222-222222222222';
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1;
  IF n <> 0 THEN RAISE EXCEPTION 'danışan silinince analiz kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_analysis_notes WHERE analysis_id = a1;
  IF n <> 0 THEN RAISE EXCEPTION 'danışan silinince analiz notu kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_expert_notes WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF n <> 0 THEN RAISE EXCEPTION 'danışan silinince çalışma notu kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_kb_entries WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF n <> 1 THEN RAISE EXCEPTION 'Bilgi Bankası danışana bağlı olmamalı (silinmemeli)'; END IF;
END
$$;
