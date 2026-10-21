-- ASTROLOJİ — GA-P2-05 karantina tablosu doğrulaması (yalnız yerel GEÇİCİ embedded-postgres; SENTETİK veri; production YOK).
--   born-locked (RLS açık, politika 0) · anon/authenticated hiçbir yetki · service_role yalnız SELECT/INSERT/DELETE (UPDATE/TRUNCATE yok)
--   · tekrar kayıt (UNIQUE) · başka tenant / başka uzman / başka uzmanın karşı tarafı FK reddi · CHECK'ler (neden, hash, nesne,
--   4 MB, bağlam 64 KB, süre ≤ 90 gün, karşı taraf çifti) · varsayılan süre 30 gün · 2 MB üstü (sonuç tablosunun reddettiği)
--   yanıt karantinaya sığar · profil silmede (RPC) ve karşı taraf silmede CASCADE · mevcut astro tablo yetkileri değişmedi.

-- 1) Şema / yetki
DO $$
DECLARE
  pol int; rls boolean; priv text; t text;
BEGIN
  SELECT relrowsecurity INTO rls FROM pg_class WHERE oid = 'public.astro_provider_quarantine'::regclass;
  IF NOT rls THEN RAISE EXCEPTION 'PQ: RLS kapalı'; END IF;
  SELECT count(*) INTO pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'astro_provider_quarantine';
  IF pol <> 0 THEN RAISE EXCEPTION 'PQ: politika olmamalı (%), born-locked', pol; END IF;
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('anon', 'public.astro_provider_quarantine', priv) THEN RAISE EXCEPTION 'PQ: anon % yetkisi var', priv; END IF;
    IF has_table_privilege('authenticated', 'public.astro_provider_quarantine', priv) THEN RAISE EXCEPTION 'PQ: authenticated % yetkisi var', priv; END IF;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.astro_provider_quarantine', priv) THEN RAISE EXCEPTION 'PQ: service_role % eksik', priv; END IF;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('service_role', 'public.astro_provider_quarantine', priv) THEN RAISE EXCEPTION 'PQ: service_role % olmamalı (ham yanıt değişmez)', priv; END IF;
  END LOOP;
  -- Mevcut tabloların yetkileri DEĞİŞMEDİ (foundation allowlist'i).
  FOREACH t IN ARRAY ARRAY['astro_provider_results', 'astro_provider_interpretations', 'astro_birth_profile_revisions'] LOOP
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') OR NOT has_table_privilege('service_role', 'public.' || t, 'INSERT') THEN RAISE EXCEPTION 'PQ: % service_role SELECT/INSERT kayboldu', t; END IF;
    IF has_table_privilege('service_role', 'public.' || t, 'UPDATE') OR has_table_privilege('service_role', 'public.' || t, 'DELETE') THEN RAISE EXCEPTION 'PQ: % service_role UPDATE/DELETE kazandı', t; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION 'PQ: % anon/authenticated SELECT kazandı', t; END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.astro_birth_profiles', 'DELETE') THEN RAISE EXCEPTION 'PQ: astro_birth_profiles doğrudan DELETE açıldı'; END IF;
  -- Bileşik FK'ler 7A anahtarına ve CASCADE.
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.astro_provider_quarantine'::regclass AND contype = 'f'
        AND confrelid = 'public.astro_birth_profiles'::regclass AND confdeltype = 'c' AND array_length(conkey, 1) = 3) <> 2 THEN
    RAISE EXCEPTION 'PQ: bileşik CASCADE FK sayısı 2 değil';
  END IF;
END $$;

-- 2) Veri kuralları (service_role ile)
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u uuid := 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  u2 uuid := 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
  ub uuid := 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
  ctx jsonb := '{"selectionTechnique":"kp.transit","options":{},"unit":{}}';
  r jsonb; p uuid; p_partner uuid; p_other uuid; p_tb uuid; n int; ok boolean; d interval; big jsonb;
BEGIN
  r := public.astro_profile_create(ta, u, NULL, 'PQ sentetik', '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
  p := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'PQ sentetik karşı taraf', '1991-02-02', NULL, false, 'unknown', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 10800, '1991-02-02T09:00:00Z');
  p_partner := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u2, NULL, 'PQ başka uzman', '1992-03-03', NULL, false, 'unknown', NULL, 'İzmir', 38.4, 27.1, 'Europe/Istanbul', 'auto', 10800, '1992-03-03T09:00:00Z');
  p_other := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(tb, ub, NULL, 'PQ başka tenant', '1993-04-04', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1993-04-04T09:00:00Z');
  p_tb := (r->>'profile_id')::uuid;

  INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, error_codes, raw_response, context)
  VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/vedic-astrology/kp/planets-interval', 'astro-roxy-kp-planets-at-1', repeat('a', 64), 'invalid_response', ARRAY['mars: KP numarası'], '{"planets":{}}', ctx);
  -- varsayılan süre: 30 gün
  SELECT expires_at - created_at INTO d FROM public.astro_provider_quarantine WHERE input_hash = repeat('a', 64);
  IF d <> interval '30 days' THEN RAISE EXCEPTION 'PQ: varsayılan süre 30 gün değil (%)', d; END IF;

  -- tekrar kayıt önleme (aynı tenant + uzman + girdi + adaptör)
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'astro-roxy-kp-planets-at-1', repeat('a', 64), 'write_failed', '{}', ctx);
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: aynı girdi ikinci kez kaydedildi'; END IF;
  -- yeni adaptör sürümü ayrı satır
  INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
  VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'astro-roxy-kp-planets-at-2', repeat('a', 64), 'write_failed', '{}', ctx);
  -- aynı girdi BAŞKA uzmanda (kendi profiliyle) ayrı satır — uzman kapsamlı anahtar
  INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
  VALUES (ta, u2, p_other, 1, 'kp.transit', 'roxy', '/x', 'astro-roxy-kp-planets-at-1', repeat('a', 64), 'invalid_response', '{}', ctx);
  -- karşı taraflı satır (aynı uzmanın profili)
  INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
  VALUES (ta, u, p, 1, p_partner, 1, 'western.synastry', 'roxy', '/x', 'v', repeat('9', 64), 'invalid_response', '{}', ctx);

  -- tenant / uzman tutarlılığı (bileşik FK)
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (tb, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('b', 64), 'invalid_response', '{}', ctx);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: başka tenant ile bu profile satır yazıldı'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u2, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('c', 64), 'invalid_response', '{}', ctx);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: başka uzmanın profiline satır yazıldı'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p_tb, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('c', 64), 'invalid_response', '{}', ctx);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: başka tenant profiline satır yazıldı'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, p_other, 1, 'western.synastry', 'roxy', '/x', 'v', repeat('c', 64), 'invalid_response', '{}', ctx);
  EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: başka uzmanın profili karşı taraf olarak yazıldı'; END IF;

  -- CHECK kısıtları
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('d', 64), 'baska', '{}', ctx);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: geçersiz reason kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', 'kisa-hash', 'invalid_response', '{}', ctx);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: geçersiz input_hash kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('e', 64), 'invalid_response', '[1,2]', ctx);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: nesne olmayan ham yanıt kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('e', 64), 'invalid_response', '{}', '[]');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: nesne olmayan bağlam kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('e', 64), 'invalid_response', '{}', jsonb_build_object('x', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 3000) i)));
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: 64 KB üstü bağlam kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('f', 64), 'invalid_response', jsonb_build_object('x', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 140000) i)), ctx);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: 4 MB üstü ham yanıt kabul edildi'; END IF;
  -- (b) yolu: sonuç tablosunun 2 MB sınırını aşan (≈3 MB) yanıt karantinaya SIĞAR.
  big := jsonb_build_object('x', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 94000) i));
  IF pg_column_size(big) <= 2097152 THEN RAISE EXCEPTION 'PQ: test yanıtı 2 MB üstü değil (%)', pg_column_size(big); END IF;
  INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, error_codes, raw_response, context)
  VALUES (ta, u, p, 1, 'western.natal', 'roxy', '/astrology/natal-chart', 'v', repeat('7', 64), 'write_failed', ARRAY['23514'], big, ctx);
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context, expires_at)
    VALUES (ta, u, p, 1, 'kp.transit', 'roxy', '/x', 'v', repeat('1', 64), 'invalid_response', '{}', ctx, now() + interval '91 days');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: 90 günden uzun saklama kabul edildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (ta, u, p, 1, p_partner, 'western.synastry', 'roxy', '/x', 'v', repeat('2', 64), 'invalid_response', '{}', ctx);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: karşı taraf revizyonsuz kabul edildi'; END IF;

  -- UPDATE / TRUNCATE yetkisi yok (ham yanıt değişmez)
  ok := false;
  BEGIN UPDATE public.astro_provider_quarantine SET reason = 'write_failed' WHERE tenant_id = ta;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: UPDATE yapılabildi'; END IF;
  ok := false;
  BEGIN TRUNCATE public.astro_provider_quarantine;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: TRUNCATE yapılabildi'; END IF;

  -- süresi dolan temizliği (DELETE, yalnız aynı tenant + uzman) mümkün ve başka uzmanı etkilemez
  DELETE FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u AND adapter_version = 'astro-roxy-kp-planets-at-2';
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u; IF n <> 3 THEN RAISE EXCEPTION 'PQ: uzman u satır sayısı % (3 beklenir)', n; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u2; IF n <> 1 THEN RAISE EXCEPTION 'PQ: uzman u2 satırı etkilendi (%)', n; END IF;
END $$;
RESET ROLE;

-- 3) anon / authenticated hiçbir işlem yapamaz
SET ROLE anon;
DO $$
DECLARE ok boolean;
BEGIN
  ok := false; BEGIN PERFORM 1 FROM public.astro_provider_quarantine; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: anon okuyabildi'; END IF;
  ok := false; BEGIN DELETE FROM public.astro_provider_quarantine; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: anon silebildi'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$
DECLARE ok boolean;
BEGIN
  ok := false; BEGIN PERFORM 1 FROM public.astro_provider_quarantine; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: authenticated okuyabildi'; END IF;
  ok := false;
  BEGIN
    INSERT INTO public.astro_provider_quarantine (tenant_id, owner_user_id, profile_id, profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'kp.transit', 'roxy', '/x', 'v', repeat('3', 64), 'invalid_response', '{}', '{}');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'PQ: authenticated yazabildi'; END IF;
END $$;
RESET ROLE;

-- 4) KVKK: karşı taraf profili ve profil silinince (tek yol RPC) karantina satırları CASCADE ile silinir
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u uuid := 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  u2 uuid := 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
  p uuid; p_partner uuid; exp jsonb; n int;
BEGIN
  SELECT id INTO p FROM public.astro_birth_profiles WHERE tenant_id = ta AND owner_user_id = u AND label = 'PQ sentetik';
  SELECT id INTO p_partner FROM public.astro_birth_profiles WHERE tenant_id = ta AND owner_user_id = u AND label = 'PQ sentetik karşı taraf';
  -- karşı taraf silinir → yalnız onun geçtiği satır gider
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[p_partner]);
  PERFORM public.astro_profile_delete(ta, u, exp);
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u AND partner_profile_id IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'PQ: karşı taraf silindi ama satırı kaldı (%)', n; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u; IF n <> 2 THEN RAISE EXCEPTION 'PQ: karşı taraf silme fazla satır sildi (%)', n; END IF;
  -- profil silinir → tüm satırları gider; başka uzmanın satırı kalır
  SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count))
    INTO exp FROM public.astro_profile_delete_preview(ta, u, ARRAY[p]);
  PERFORM public.astro_profile_delete(ta, u, exp);
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u; IF n <> 0 THEN RAISE EXCEPTION 'PQ: profil silindi ama karantina satırı kaldı (%)', n; END IF;
  SELECT count(*) INTO n FROM public.astro_provider_quarantine WHERE tenant_id = ta AND owner_user_id = u2; IF n <> 1 THEN RAISE EXCEPTION 'PQ: başka uzmanın satırı silindi (%)', n; END IF;
END $$;
RESET ROLE;

-- temizlik (sonraki assert'leri etkilemesin)
DELETE FROM public.astro_provider_quarantine;
