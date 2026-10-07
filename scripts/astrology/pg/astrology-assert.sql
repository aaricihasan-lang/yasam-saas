-- ASTROLOJİ AŞAMA 1 assert: born-locked grant/RLS, değişmez revizyon, atomik fonksiyonlar,
-- iyimser kilit, tenant FK, önbellek tekilliği, KVKK cascade. Yalnız yerel embedded-postgres.

-- ─── 1) Grant / RLS (superuser bağlamında katalog kontrolü) ──────────────────
DO $$
DECLARE
  t text;
  n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['astro_birth_profiles','astro_birth_profile_revisions','astro_provider_results','astro_provider_interpretations'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION '% RLS kapalı', t;
    END IF;
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n <> 0 THEN RAISE EXCEPTION '% üzerinde % policy var (born-locked: 0 beklenir)', t, n; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION '% anon SELECT açık', t; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'INSERT') THEN RAISE EXCEPTION '% anon INSERT açık', t; END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION '% authenticated SELECT açık', t; END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT') THEN RAISE EXCEPTION '% authenticated INSERT açık', t; END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION '% service_role SELECT yok', t; END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'INSERT') THEN RAISE EXCEPTION '% service_role INSERT yok', t; END IF;
    IF has_table_privilege('service_role', 'public.' || t, 'DELETE') THEN RAISE EXCEPTION '% service_role DELETE açık (beklenmez)', t; END IF;
    IF has_table_privilege('service_role', 'public.' || t, 'TRUNCATE') THEN RAISE EXCEPTION '% service_role TRUNCATE açık', t; END IF;
  END LOOP;
  -- Değişmezlik: revizyon / sonuç / yorum UPDATE edilemez; yalnız profil (etiket + güncel revizyon).
  IF has_table_privilege('service_role', 'public.astro_birth_profile_revisions', 'UPDATE') THEN RAISE EXCEPTION 'revizyon UPDATE açık'; END IF;
  IF has_table_privilege('service_role', 'public.astro_provider_results', 'UPDATE') THEN RAISE EXCEPTION 'sonuç UPDATE açık'; END IF;
  IF has_table_privilege('service_role', 'public.astro_provider_interpretations', 'UPDATE') THEN RAISE EXCEPTION 'yorum UPDATE açık'; END IF;
  IF NOT has_table_privilege('service_role', 'public.astro_birth_profiles', 'UPDATE') THEN RAISE EXCEPTION 'profil UPDATE yok'; END IF;
  -- Fonksiyonlar: anon/authenticated çalıştıramaz.
  IF has_function_privilege('anon', 'public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon astro_profile_create EXECUTE açık';
  END IF;
  IF has_function_privilege('authenticated', 'public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated astro_profile_append_revision EXECUTE açık';
  END IF;
END
$$;

-- ─── 2) anon gerçekten okuyamaz (rol değiştirerek) ───────────────────────────
SET ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.astro_provider_results LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'anon astro_provider_results okuyabildi'; END IF;
END
$$;
RESET ROLE;

-- ─── 3) service_role akışları ────────────────────────────────────────────────
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  c1 uuid := '11111111-1111-4111-8111-111111111111';
  c2 uuid := '22222222-2222-4222-8222-222222222222';
  u  uuid := '99999999-9999-4999-8999-999999999999';
  r jsonb;
  p1 uuid;
  p2 uuid;
  p_std uuid;
  res_id uuid := 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
  n integer;
  ok boolean;
  h text := repeat('a', 64);
BEGIN
  -- Atomik oluşturma: profil + revizyon 1.
  r := public.astro_profile_create(ta, u, c1, 'Ali — natal', '1990-07-15', '14:30', true, 'exact_record',
        'TR-34', 'İstanbul, Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:30:00Z');
  p1 := (r->>'profile_id')::uuid;
  IF (r->>'revision')::int <> 1 THEN RAISE EXCEPTION 'ilk revizyon 1 değil'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE profile_id = p1;
  IF n <> 1 THEN RAISE EXCEPTION 'revizyon sayısı % (1 beklenir)', n; END IF;

  -- Saat bilinmeyen bağımsız profil (danışansız).
  r := public.astro_profile_create(ta, u, NULL, 'Bağımsız', '1985-01-02', NULL, false, 'unknown',
        'TR-06', 'Ankara, Türkiye', 39.93, 32.85, 'Europe/Istanbul', 'auto', 7200, '1985-01-01T22:00:00Z');
  p_std := (r->>'profile_id')::uuid;

  -- Revizyon ekleme (iyimser kilit): expected=1 → 2; eski revizyon aynen kalır.
  r := public.astro_profile_append_revision(ta, u, p1, 1, '1990-07-15', '14:45', true, 'rectified',
        'TR-34', 'İstanbul, Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:45:00Z', 'rectification');
  IF (r->>'revision')::int <> 2 THEN RAISE EXCEPTION 'ikinci revizyon 2 değil'; END IF;
  SELECT current_revision INTO n FROM public.astro_birth_profiles WHERE id = p1;
  IF n <> 2 THEN RAISE EXCEPTION 'current_revision % (2 beklenir)', n; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE profile_id = p1 AND revision = 1 AND birth_time = '14:30';
  IF n <> 1 THEN RAISE EXCEPTION 'eski revizyon korunmadı'; END IF;

  -- Bayat expected → çakışma.
  ok := false;
  BEGIN
    PERFORM public.astro_profile_append_revision(ta, u, p1, 1, '1990-07-15', '15:00', true, 'approximate',
        'TR-34', 'İstanbul, Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T12:00:00Z', NULL);
  EXCEPTION WHEN serialization_failure THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'bayat revizyon çakışması yakalanmadı'; END IF;

  -- Başka tenant'ın profiline revizyon → bulunamadı.
  ok := false;
  BEGIN
    PERFORM public.astro_profile_append_revision(tb, u, p1, 2, '1990-07-15', '15:00', true, 'approximate',
        'TR-34', 'İstanbul, Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T12:00:00Z', NULL);
  EXCEPTION WHEN no_data_found THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant revizyon engellenmedi'; END IF;

  -- Revizyon UPDATE yetkisi YOK (değişmezlik DB seviyesinde).
  ok := false;
  BEGIN
    UPDATE public.astro_birth_profile_revisions SET birth_time = '00:00' WHERE profile_id = p1;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'revizyon UPDATE engellenmedi'; END IF;

  -- Çapraz tenant danışan bağı → FK ihlali (tenant B + tenant A danışanı).
  ok := false;
  BEGIN
    PERFORM public.astro_profile_create(tb, u, c1, 'Sızıntı', '1990-07-15', '14:30', true, 'exact_record',
        NULL, 'X', 0, 0, 'UTC', 'auto', 0, '1990-07-15T14:30:00Z');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant danışan bağı engellenmedi'; END IF;

  -- CHECK: saat bilinmiyor ama saat dolu → red.
  ok := false;
  BEGIN
    PERFORM public.astro_profile_create(ta, u, c2, 'Tutarsız', '1990-07-15', '14:30', false, 'unknown',
        NULL, 'X', 0, 0, 'UTC', 'auto', 0, '1990-07-15T14:30:00Z');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'time_known tutarsızlığı kabul edildi'; END IF;

  -- CHECK: geçersiz DST seçimi.
  ok := false;
  BEGIN
    PERFORM public.astro_profile_create(ta, u, c2, 'DST', '1990-07-15', '14:30', true, 'exact_record',
        NULL, 'X', 0, 0, 'UTC', 'guess', 0, '1990-07-15T14:30:00Z');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'geçersiz dst_choice kabul edildi'; END IF;

  -- Sonuç + yorum (A/B katmanı) yazımı.
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical,
    technical_schema, projection_version, created_by_user_id)
  VALUES (res_id, ta, p1, 2, 'western.natal', 'roxy', 'v2', 'astro-roxy-natal-1', '/astrology/natal-chart',
    '{"date":"1990-07-15"}', h, '{"planets":[]}', '{"bodies":[]}', 'astro.western.natal.v1', 'natal-proj-1', u);
  INSERT INTO public.astro_provider_interpretations (tenant_id, result_id, provider, lang, content_schema, projection_version, content)
  VALUES (ta, res_id, 'roxy', 'tr', 'astro.western.natal.interp.v1', 'natal-proj-1', '{"bodies":[]}');

  -- Önbellek tekilliği: aynı tenant + aynı input_hash → unique ihlali.
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider,
      provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical,
      technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, p1, 2, 'western.natal', 'roxy', 'v2', 'astro-roxy-natal-1', '/astrology/natal-chart',
      '{}', h, '{}', '{}', 'astro.western.natal.v1', 'natal-proj-1', u);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'aynı (tenant,input_hash) ikinci kez yazıldı'; END IF;

  -- Var olmayan revizyona sonuç → FK ihlali.
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider,
      provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical,
      technical_schema, projection_version, created_by_user_id)
    VALUES (gen_random_uuid(), ta, p1, 9, 'western.natal', 'roxy', 'v2', 'a', '/x', '{}', repeat('b', 64), '{}', '{}', 's', 'p', u);
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'var olmayan revizyona sonuç yazıldı'; END IF;

  -- Sonuç DELETE yetkisi YOK.
  ok := false;
  BEGIN
    DELETE FROM public.astro_provider_results WHERE id = res_id;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'sonuç DELETE engellenmedi'; END IF;

  -- Diğer tenant'ta aynı input_hash serbest (önbellek tenant içinde).
  r := public.astro_profile_create(tb, u, NULL, 'B tenant', '1990-07-15', '14:30', true, 'exact_record',
        NULL, 'X', 0, 0, 'UTC', 'auto', 0, '1990-07-15T14:30:00Z');
  p2 := (r->>'profile_id')::uuid;
  INSERT INTO public.astro_provider_results (id, tenant_id, profile_id, profile_revision, technique, provider,
    provider_api_version, adapter_version, endpoint, input, input_hash, raw_response, technical,
    technical_schema, projection_version, created_by_user_id)
  VALUES (gen_random_uuid(), tb, p2, 1, 'western.natal', 'roxy', 'v2', 'astro-roxy-natal-1', '/astrology/natal-chart',
    '{}', h, '{}', '{}', 'astro.western.natal.v1', 'natal-proj-1', u);

  -- Çapraz tenant yorum bağı → FK ihlali.
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_interpretations (tenant_id, result_id, provider, lang, content_schema, projection_version, content)
    VALUES (tb, res_id, 'roxy', 'tr', 's', 'natal-proj-2', '{}');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'çapraz tenant yorum bağı engellenmedi'; END IF;

  PERFORM set_config('astro.assert_p1', p1::text, false);
  PERFORM set_config('astro.assert_pstd', p_std::text, false);
END
$$;
RESET ROLE;

-- ─── 4) KVKK cascade: danışan silinince zincir silinir; bağımsız profil kalır ──
DO $$
DECLARE
  p1 uuid := current_setting('astro.assert_p1')::uuid;
  p_std uuid := current_setting('astro.assert_pstd')::uuid;
  n integer;
BEGIN
  DELETE FROM public.clients WHERE id = '11111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = p1;
  IF n <> 0 THEN RAISE EXCEPTION 'profil cascade silinmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profile_revisions WHERE profile_id = p1;
  IF n <> 0 THEN RAISE EXCEPTION 'revizyonlar cascade silinmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE profile_id = p1;
  IF n <> 0 THEN RAISE EXCEPTION 'sonuçlar cascade silinmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_interpretations WHERE result_id = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
  IF n <> 0 THEN RAISE EXCEPTION 'yorumlar cascade silinmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_birth_profiles WHERE id = p_std;
  IF n <> 1 THEN RAISE EXCEPTION 'bağımsız profil etkilendi'; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_results WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF n <> 1 THEN RAISE EXCEPTION 'başka tenant sonucu etkilendi'; END IF;
END
$$;
