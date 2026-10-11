-- ASTROLOJİ AŞAMA 7A — TEMİZ KURULUM doğrulaması (20271101000000…000300). Yalnız yerel embedded-postgres;
-- SENTETİK veri. Aynı tenant'ta iki uzman (U1, U2) + başka tenant uzmanı (UB) + aynı ad/soyad/doğum
-- tarihli üç danışan. DB düzeyinde: sahiplik FK'leri, uzman kapsamlı önbellek, RPC sahiplik kontrolü,
-- danışan silmede astroloji kaydının korunması.

-- Aynı ad + soyad + doğum tarihi, üç AYRI danışan (tenant A).
INSERT INTO public.clients (id, tenant_id, ad, soyad, dogum) VALUES
  ('c7c70001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Deneme', 'Kişi', '1991-02-03'),
  ('c7c70002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Deneme', 'Kişi', '1991-02-03'),
  ('c7c70003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Deneme', 'Kişi', '1991-02-03')
ON CONFLICT (id) DO NOTHING;

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u1 uuid := '71717171-7171-4171-8171-717171717171';
  u2 uuid := '72727272-7272-4272-8272-727272727272';
  ub uuid := '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b';
  k1 uuid := 'c7c70001-0000-4000-8000-000000000001';
  k2 uuid := 'c7c70002-0000-4000-8000-000000000002';
  k3 uuid := 'c7c70003-0000-4000-8000-000000000003';
  r jsonb; p1 uuid; p1b uuid; p1c uuid; p2 uuid; pb uuid; a1 uuid; ok boolean; n integer; code text;
  r1 uuid := 'a7a70001-0000-4a7a-8a7a-000000000001';
  r2 uuid := 'a7a70002-0000-4a7a-8a7a-000000000002';
  req1 uuid := 'b7b70001-0000-4b7b-8b7b-000000000001';
BEGIN
  -- U1: aynı kimlikli üç danışana üç ayrı profil. U2: kendi profili. UB: başka tenant.
  r := public.astro_profile_create(ta, u1, k1, 'Deneme Kişi (1)', '1991-02-03', '10:00', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 7200, '1991-02-03T08:00:00Z');
  p1 := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u1, k2, 'Deneme Kişi (2)', '1991-02-03', '10:00', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 7200, '1991-02-03T08:00:00Z');
  p1b := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u1, k3, 'Deneme Kişi (3)', '1991-02-03', '10:00', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 7200, '1991-02-03T08:00:00Z');
  p1c := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u2, NULL, 'U2 profili', '1980-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1980-01-01T10:00:00Z');
  p2 := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(tb, ub, NULL, 'UB profili', '1970-01-01', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1970-01-01T10:00:00Z');
  pb := (r->>'profile_id')::uuid;

  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id IN (p1, p1b, p1c) AND owner_user_id = u1;
  IF n <> 3 THEN RAISE EXCEPTION 'profil sahibi yazılmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE profile_id = p2 AND owner_user_id = u2;
  IF n <> 1 THEN RAISE EXCEPTION 'revizyon sahibi yazılmadı'; END IF;

  -- U2, U1'in profiline revizyon ekleyemez (yok gibi).
  ok := false;
  BEGIN
    PERFORM public.astro_profile_append_revision(ta, u2, p1, 1, '1991-02-03', '11:00', true, 'rectified', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 7200, '1991-02-03T09:00:00Z', NULL);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'başka uzman profile revizyon ekledi'; END IF;

  -- Doğrudan INSERT ile yabancı profile revizyon → FK.
  ok := false;
  BEGIN
    INSERT INTO public.astro_birth_profile_revisions (tenant_id, owner_user_id, profile_id, revision, birth_date, time_known, time_accuracy, location_label,
      latitude, longitude, timezone, utc_offset_seconds, birth_utc, created_by_user_id)
    VALUES (ta, u2, p1, 9, '1991-02-03', false, 'unknown', 'x', 0, 0, 'UTC', 0, '1991-02-03T00:00:00Z', u2);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yabancı profile revizyon FK ile reddedilmedi'; END IF;

  -- Önbellek: aynı input_hash U1 ve U2 için AYRI satır; U1 aynı hash'i iki kez yazamaz.
  INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
    endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (r1, ta, u1, p1, 1, 'western.natal', 'roxy', 'v2', 'a', '/astrology/natal-chart', '{}', repeat('a', 64), '{}', '{}', 's', 'p', u1);
  INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
    endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (r2, ta, u2, p2, 1, 'western.natal', 'roxy', 'v2', 'a', '/astrology/natal-chart', '{}', repeat('a', 64), '{}', '{}', 's', 'p', u2);
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
      endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, u1, p1b, 1, 'western.natal', 'roxy', 'v2', 'a', '/astrology/natal-chart', '{}', repeat('a', 64), '{}', '{}', 's', 'p', u1);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'aynı uzmanın önbelleği tekil değil'; END IF;

  -- Sonuç başka uzmanın profiline bağlanamaz (birincil veya karşı taraf).
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
      endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, u2, p1, 1, 'western.natal', 'roxy', 'v2', 'a', '/x', '{}', repeat('b', 64), '{}', '{}', 's', 'p', u2);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'sonuç başka uzmanın profiline bağlandı'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider,
      provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, u1, p1, 1, p2, 1, 'western.synastry', 'roxy', 'v2', 'a', '/x', '{}', repeat('c', 64), '{}', '{}', 's', 'p', u1);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'sinastri karşı tarafı başka uzmanın profili olabildi'; END IF;

  -- Yorum, sonucun sahibinden farklı uzmana yazılamaz.
  INSERT INTO public.astro_provider_interpretations (tenant_id, owner_user_id, result_id, provider, lang, content_schema, projection_version, content)
  VALUES (ta, u1, r1, 'roxy', 'tr', 'i', 'p', '{"summary":"x"}');
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_interpretations (tenant_id, owner_user_id, result_id, provider, lang, content_schema, projection_version, content)
    VALUES (ta, u2, r1, 'roxy', 'tr', 'i', 'q', '{"summary":"y"}');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yorum başka uzmanın sonucuna bağlandı'; END IF;

  -- Çalışma notu başka uzmanın profiline yazılamaz.
  ok := false;
  BEGIN
    INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, section_key, body) VALUES (ta, u2, p1, 'western.natal', 'overall', 'x');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'not başka uzmanın profiline yazıldı'; END IF;

  -- Kayıtlı analiz: U1 kaydeder; U2 aynı profille/aynı istek kimliğiyle U1'in analizine ulaşamaz.
  r := public.astro_analysis_save_v2(ta, u1, p1, 1, NULL, NULL, ARRAY[r1], 'western.natal', 'Deneme natal', req1, '{}', '{"label":"Deneme Kişi (1)","client":{"name":"Deneme Kişi"}}',
        '{}', '{"bodies":[]}', '[]', true, '{"provider":"roxy","content":{"summary":"x"}}', '{}', '[{"section_key":"overall","body":"not"}]');
  a1 := (r->>'analysis_id')::uuid;
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save_v2(ta, u2, p1, 1, NULL, NULL, NULL, 'western.natal', 'x', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'başka uzman profilinden analiz kaydedildi'; END IF;
  ok := false;
  BEGIN
    r := public.astro_analysis_save_v2(ta, u2, p2, 1, NULL, NULL, NULL, 'western.natal', 'x', req1, '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
    IF (r->>'analysis_id')::uuid = a1 THEN RAISE EXCEPTION 'U2 U1''in analiz kimliğini aldı'; END IF;
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yabancı istek kimliği yeni analiz üretti (beklenen: tekillik reddi)'; END IF;
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save_v2(ta, u1, p1, 1, p2, 1, NULL, 'western.synastry', 'x', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'analizde karşı taraf başka uzmanın profili olabildi'; END IF;
  -- v1 (kodda kullanılmıyor) da sahiplik FK'sine takılır.
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save(ta, u2, p1, 1, NULL, 'western.natal', 'x', gen_random_uuid(), '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'v1 kaydetme başka uzman profilini kabul etti'; END IF;

  -- Başka tenant: profil/sonuç bağlanamaz.
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, provider_api_version, adapter_version,
      endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, ub, pb, 1, 'western.natal', 'roxy', 'v2', 'a', '/x', '{}', repeat('d', 64), '{}', '{}', 's', 'p', ub);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'başka tenant profili bağlandı'; END IF;
END
$$;
RESET ROLE;

-- anon / authenticated hâlâ hiçbir astroloji tablosunu göremez (yeni kolonlar dahil).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['astro_birth_profiles','astro_birth_profile_revisions','astro_provider_results','astro_provider_interpretations','astro_analyses','astro_expert_notes','astro_kb_entries'] LOOP
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon/authenticated % okuyabiliyor', t;
    END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.astro_provider_results', 'UPDATE') OR has_table_privilege('service_role', 'public.astro_analyses', 'DELETE') THEN
    RAISE EXCEPTION 'service_role değişmez tablolarda yetki kazandı';
  END IF;
END
$$;

-- Danışan silme (cascade-delete route'unun tek ifadesi): aynı kimlikli üç danışandan YALNIZ biri.
DO $$
DECLARE
  k2 uuid := 'c7c70002-0000-4000-8000-000000000002';
  before_an text; after_an text; n integer; m integer;
BEGIN
  SELECT count(*) INTO n FROM public.astro_birth_profiles;
  SELECT string_agg(md5(id::text || profile_snapshot::text || technical_snapshot::text), ',' ORDER BY id) INTO before_an FROM public.astro_analyses;
  -- k2'ye bağlı profile bir analiz de olsun (silinmemeli).
  PERFORM public.astro_analysis_save_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '71717171-7171-4171-8171-717171717171',
    (SELECT id FROM public.astro_birth_profiles WHERE client_id = k2), 1, NULL, NULL, NULL, 'western.natal', 'Deneme (2) natal', gen_random_uuid(),
    '{}', '{"label":"Deneme Kişi (2)","client":{"name":"Deneme Kişi"}}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  SELECT count(*) INTO m FROM public.astro_analyses;
  SELECT string_agg(md5(id::text || profile_snapshot::text || technical_snapshot::text), ',' ORDER BY id) INTO before_an FROM public.astro_analyses;

  DELETE FROM public.clients WHERE id = k2;

  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE label LIKE 'Deneme Kişi (%)';
  IF n <> 3 THEN RAISE EXCEPTION 'danışan silme profili sildi (% kaldı)', n; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE label = 'Deneme Kişi (2)' AND client_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'silinen danışanın bağı NULL olmadı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE label IN ('Deneme Kişi (1)', 'Deneme Kişi (3)') AND client_id IS NOT NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'aynı kimlikli diğer danışanların bağı etkilendi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses;
  IF n <> m THEN RAISE EXCEPTION 'danışan silme kayıtlı analizi sildi'; END IF;
  SELECT string_agg(md5(id::text || profile_snapshot::text || technical_snapshot::text), ',' ORDER BY id) INTO after_an FROM public.astro_analyses;
  IF after_an <> before_an THEN RAISE EXCEPTION 'danışan silme snapshot''ı değiştirdi'; END IF;
END
$$;
