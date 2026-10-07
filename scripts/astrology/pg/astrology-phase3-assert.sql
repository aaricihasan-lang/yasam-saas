-- ASTROLOJİ AŞAMA 3 assert: karşı taraf KVKK cascade · save_v2 atomik/idempotent · not bağlamı ·
-- v1 + Aşama 2 satırları korunur. Yalnız yerel embedded-postgres.

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u  uuid := '99999999-9999-4999-8999-999999999999';
  cx uuid := '44444444-4444-4444-8444-444444444444';
  cy uuid := '55555555-5555-4555-8555-555555555555';
  r jsonb; pa uuid; pb uuid; pc uuid; a1 uuid; a2 jsonb; n integer; ok boolean;
  res uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  req uuid := 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
BEGIN
  -- Aşama 2 tarzı (v1) analiz hâlâ yazılabiliyor ve yeni kolonlar varsayılan.
  r := public.astro_profile_create(ta, u, cx, 'X — natal', '1990-07-15', '14:30', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:30:00Z');
  pa := (r->>'profile_id')::uuid;
  r := public.astro_analysis_save(ta, u, pa, 1, NULL, 'western.natal', 'v1 analiz', gen_random_uuid(), '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = (r->>'analysis_id')::uuid AND partner_profile_id IS NULL AND technique_params = '{}'::jsonb AND result_ids = '{}';
  IF n <> 1 THEN RAISE EXCEPTION 'v1 analiz varsayılanları yanlış'; END IF;

  -- Karşı taraf: danışana bağlı (cy) ve bağımsız (danışansız) profil.
  r := public.astro_profile_create(ta, u, cy, 'Y — karşı taraf', '1988-03-21', '06:45', true, 'exact_record', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1988-03-21T04:45:00Z');
  pb := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Z — bağımsız karşı taraf', '1985-01-02', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 7200, '1985-01-02T10:00:00Z');
  pc := (r->>'profile_id')::uuid;

  -- Sinastri sonucu (iki kişinin verisi) + analiz (v2).
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
  VALUES (res, ta, pa, 1, pb, 1, 'western.synastry', 'roxy', 'v2', 'a', '/astrology/synastry', '{}', repeat('e', 64), '{}', '{}', 's', 'p', u);

  -- Yarım çift (yalnız partner_profile_id) reddedilir.
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, partner_profile_id, technique, provider,
      provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical, technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, pa, 1, pb, 'western.synastry', 'roxy', 'v2', 'a', '/x', '{}', repeat('f', 64), '{}', '{}', 's', 'p', u);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'yarım karşı taraf çifti kabul edildi'; END IF;

  r := public.astro_analysis_save_v2(ta, u, pa, 1, pb, 1, ARRAY[res], 'western.synastry', 'X & Y sinastri', req,
        '{"partnerProfileId":"x"}', '{"label":"X","partner":{"label":"Y"}}', '{}', '{"aspects":[]}', '[]', false, NULL, '{}',
        '[{"section_key":"overall","body":"sinastri yorumu"}]');
  a1 := (r->>'analysis_id')::uuid;
  a2 := public.astro_analysis_save_v2(ta, u, pa, 1, pb, 1, ARRAY[res], 'western.synastry', 'tekrar', req, '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  IF (a2->>'analysis_id')::uuid <> a1 OR NOT (a2->>'reused')::boolean THEN RAISE EXCEPTION 'v2 idempotency bozuk'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1 AND result_id = res AND result_ids = ARRAY[res] AND partner_profile_revision = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'v2 alanları yazılmadı'; END IF;

  -- Çapraz tenant karşı taraf → FK ihlali.
  ok := false;
  BEGIN
    PERFORM public.astro_analysis_save_v2(ta, u, pa, 1, pb, 9, NULL, 'western.synastry', 'x', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'var olmayan karşı taraf revizyonu kabul edildi'; END IF;

  -- Not bağlamı: aynı profil + teknik + bölüm, FARKLI karşı taraf → iki ayrı not; aynı bağlam → tekil.
  INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, context_key, section_key, body)
  VALUES (ta, u, pa, 'western.synastry', pb::text, 'overall', 'Y ile'), (ta, u, pa, 'western.synastry', pc::text, 'overall', 'Z ile');
  ok := false;
  BEGIN
    INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, context_key, section_key, body)
    VALUES (ta, u, pa, 'western.synastry', pb::text, 'overall', 'tekrar');
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'aynı bağlam notu tekil değil'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, context_key, section_key, body)
    VALUES (ta, u, pa, 'western.synastry', 'serbest metin', 'overall', 'x');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'geçersiz bağlam anahtarı kabul edildi'; END IF;

  PERFORM set_config('astro.p3_a1', a1::text, false);
  PERFORM set_config('astro.p3_pa', pa::text, false);
END
$$;
RESET ROLE;

-- ─── KVKK: KARŞI TARAF danışanı silinince sinastri sonucu + analizi silinir; X'in diğer verisi kalır ─
DO $$
DECLARE a1 uuid := current_setting('astro.p3_a1')::uuid; pa uuid := current_setting('astro.p3_pa')::uuid; n integer;
BEGIN
  DELETE FROM public.clients WHERE id = '55555555-5555-4555-8555-555555555555';
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  IF n <> 0 THEN RAISE EXCEPTION 'karşı taraf silinince sinastri sonucu kaldı (ham yanıtında onun verisi var)'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE id = a1;
  IF n <> 0 THEN RAISE EXCEPTION 'karşı taraf silinince sinastri analizi kaldı'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = pa;
  IF n <> 1 THEN RAISE EXCEPTION 'birincil profil etkilendi'; END IF;
  SELECT count(*) INTO n FROM public.astro_analyses WHERE profile_id = pa AND technique = 'western.natal';
  IF n <> 1 THEN RAISE EXCEPTION 'birincil profilin natal analizi etkilendi'; END IF;
END
$$;

-- ─── save_v2 yalnız service_role çalıştırır; yeni kolonlar istemci rollerine açılmadı ─────────────
DO $$
DECLARE sig text := 'public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb)';
BEGIN
  IF has_function_privilege('anon', sig, 'EXECUTE') OR has_function_privilege('authenticated', sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'save_v2 istemci rolüne açık';
  END IF;
  IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN RAISE EXCEPTION 'save_v2 service_role çalıştıramıyor'; END IF;
  IF has_table_privilege('anon', 'public.astro_provider_results', 'SELECT') OR has_table_privilege('authenticated', 'public.astro_analyses', 'SELECT')
     OR has_table_privilege('authenticated', 'public.astro_expert_notes', 'SELECT') THEN
    RAISE EXCEPTION 'astro tablosu istemci rolüne açık';
  END IF;
  IF has_column_privilege('authenticated', 'public.astro_provider_results', 'partner_profile_id', 'SELECT') THEN
    RAISE EXCEPTION 'yeni kolon istemci rolüne açık';
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.astro_analyses'::regclass) IS NOT TRUE THEN RAISE EXCEPTION 'RLS kapalı'; END IF;
END
$$;
