-- 20271230000000 doğrulaması (yerel gömülü PG; prod'a temas YOK). Her ihlal EXCEPTION → FAIL.
DO $$
DECLARE
  OWNER  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  PASIF  constant uuid := 'a0000000-0000-4000-8000-000000000002';
  ADMIN2 constant uuid := 'a0000000-0000-4000-8000-000000000003';
  E1 constant uuid := 'e0000000-0000-4000-8000-000000000001';
  E2 constant uuid := 'e0000000-0000-4000-8000-000000000002';
  E3 constant uuid := 'e0000000-0000-4000-8000-000000000003';
  E4 constant uuid := 'e0000000-0000-4000-8000-000000000004';
  E5 constant uuid := 'e0000000-0000-4000-8000-000000000005';
  A4 constant uuid := 'a0000000-0000-4000-8000-000000000004';
  E6 constant uuid := 'e0000000-0000-4000-8000-000000000006';
  r jsonb; n int; g jsonb; p jsonb; failed boolean; st text;
BEGIN
  -- 1) Backfill: yalnız Astroloji'si boolean true olan uzmanlar → {"mode":"all"}; diğerleri NULL. Modül izinleri DEĞİŞMEZ.
  SELECT astrology_technique_grants INTO g FROM public.users WHERE id = E1; IF g IS DISTINCT FROM '{"mode":"all"}'::jsonb THEN RAISE EXCEPTION 'E1 backfill: %', g; END IF;
  SELECT astrology_technique_grants INTO g FROM public.users WHERE id = E5; IF g IS DISTINCT FROM '{"mode":"all"}'::jsonb THEN RAISE EXCEPTION 'E5 backfill: %', g; END IF;
  SELECT count(*) INTO n FROM public.users WHERE id IN (E2, E3, E4, A4, E6, OWNER) AND astrology_technique_grants IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'backfill kapsamı dışı % satır', n; END IF;
  SELECT module_permissions INTO p FROM public.users WHERE id = E1;
  IF p IS DISTINCT FROM '{"astrology": true, "astrology_provider_interp": true, "numerology": true}'::jsonb THEN RAISE EXCEPTION 'E1 module_permissions değişti: %', p; END IF;

  -- 2) Biçim CHECK: geçersiz şekiller reddedilir.
  FOREACH st IN ARRAY ARRAY[
    '{"mode":"list","techniques":[]}',
    '{"mode":"list","techniques":["western.natal","western.natal"]}',
    '{"mode":"list","techniques":["WESTERN.natal"]}',
    '{"mode":"list","techniques":["western.natal"],"x":1}',
    '{"mode":"list","techniques":[1]}',
    '{"mode":"list","techniques":"western.natal"}',
    '{"mode":"everything"}',
    '{"mode":"all","techniques":["western.natal"]}',
    '[]', '"all"'
  ] LOOP
    failed := false;
    BEGIN
      UPDATE public.users SET astrology_technique_grants = st::jsonb WHERE id = E3;
    EXCEPTION WHEN check_violation THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'CHECK geçersiz biçimi kabul etti: %', st; END IF;
  END LOOP;
  IF NOT public.astrology_technique_grants_is_valid('{"mode":"list","techniques":["western.natal","sky.degree_crossings"]}') THEN RAISE EXCEPTION 'geçerli liste reddedildi'; END IF;
  IF (SELECT public.astrology_technique_grants_is_valid(jsonb_build_object('mode','list','techniques', (SELECT jsonb_agg('western.t_' || i) FROM generate_series(1,65) i))))
    THEN RAISE EXCEPTION '65 teknik kabul edildi'; END IF;

  -- 3) Astroloji'yi açarak (E2: kapalıydı) ilk kayıt: modül + teknikler TEK işlemde; diğer modüller korunur; denetim 2 satır.
  r := public.admin_set_astrology_technique_grants(E2, OWNER, '{"mode":"list","techniques":["western.natal"]}', true);
  IF (r->>'module_enabled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'E2 modül açılmadı: %', r; END IF;
  SELECT module_permissions, astrology_technique_grants INTO p, g FROM public.users WHERE id = E2;
  IF p IS DISTINCT FROM '{"astrology": true, "numerology": true, "stones": true}'::jsonb THEN RAISE EXCEPTION 'E2 izinleri: %', p; END IF;
  IF g IS DISTINCT FROM '{"mode":"list","techniques":["western.natal"]}'::jsonb THEN RAISE EXCEPTION 'E2 teknikler: %', g; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2 AND action = 'module_enabled' AND context = '{"modules":["astrology"],"count":1}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'E2 modül denetimi % satır', n; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2 AND action = 'module_enabled' AND context = '{"scope":"astrology_techniques","techniques":["western.natal"],"count":1}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'E2 teknik denetimi % satır', n; END IF;

  -- 4) Ekleme + çıkarma farkı: yalnız gerçek fark denetlenir; modül zaten açık → modül satırı YOK.
  r := public.admin_set_astrology_technique_grants(E2, ADMIN2, '{"mode":"list","techniques":["western.transit","sky.ephemeris"]}', true);
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2;
  IF n <> 4 THEN RAISE EXCEPTION 'E2 toplam denetim % (4 beklenir)', n; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2 AND actor_admin_id = ADMIN2 AND actor_is_main_admin = false AND action = 'module_disabled'
    AND context = '{"scope":"astrology_techniques","techniques":["western.natal"],"count":1}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'E2 çıkarma denetimi'; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2 AND actor_admin_id = ADMIN2 AND action = 'module_enabled'
    AND context = '{"scope":"astrology_techniques","techniques":["sky.ephemeris","western.transit"],"count":2}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'E2 ekleme denetimi'; END IF;

  -- 5) Aynı değer yeniden → denetim satırı YOK (no-op).
  r := public.admin_set_astrology_technique_grants(E2, OWNER, '{"mode":"list","techniques":["western.transit","sky.ephemeris"]}', false);
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = E2; IF n <> 4 THEN RAISE EXCEPTION 'no-op denetim üretti'; END IF;

  -- 6) Modül kapalıyken teknik kaydı KORUNUR; enable=false ile düzenleme modülü AÇMAZ.
  UPDATE public.users SET module_permissions = module_permissions || '{"astrology": false}' WHERE id = E2;
  SELECT astrology_technique_grants INTO g FROM public.users WHERE id = E2;
  IF g IS DISTINCT FROM '{"mode":"list","techniques":["western.transit","sky.ephemeris"]}'::jsonb THEN RAISE EXCEPTION 'modül kapanınca teknik kaydı değişti'; END IF;
  r := public.admin_set_astrology_technique_grants(E2, OWNER, '{"mode":"all"}', false);
  SELECT module_permissions -> 'astrology', astrology_technique_grants INTO p, g FROM public.users WHERE id = E2;
  IF p IS DISTINCT FROM 'false'::jsonb OR g IS DISTINCT FROM '{"mode":"all"}'::jsonb THEN RAISE EXCEPTION 'kapalı modülde düzenleme: % %', p, g; END IF;

  -- 7) Reddedilen çağrılar (yazım yok).
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants(E3, PASIF, '{"mode":"all"}', true); EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'pasif admin yazabildi'; END IF;
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants(E3, E1, '{"mode":"all"}', true); EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'uzman aktör başka uzmanın iznini değiştirdi'; END IF;
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants(A4, OWNER, '{"mode":"all"}', true); EXCEPTION WHEN SQLSTATE 'UY002' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'admin hedef kabul edildi'; END IF;
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants(E3, OWNER, '{"mode":"list","techniques":[]}', true); EXCEPTION WHEN SQLSTATE 'UY003' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'boş seçim kabul edildi'; END IF;
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants(E3, OWNER, NULL, true); EXCEPTION WHEN SQLSTATE 'UY003' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'NULL izin kabul edildi'; END IF;
  failed := false; BEGIN PERFORM public.admin_set_astrology_technique_grants('e0000000-0000-4000-8000-0000000000ff', OWNER, '{"mode":"all"}', true); EXCEPTION WHEN SQLSTATE 'UY003' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'olmayan kullanıcı kabul edildi'; END IF;
  SELECT module_permissions, astrology_technique_grants INTO p, g FROM public.users WHERE id = E3;
  IF p IS DISTINCT FROM '{"clients": true}'::jsonb OR g IS NOT NULL THEN RAISE EXCEPTION 'reddedilen çağrı E3''e yazdı: % %', p, g; END IF;

  -- 8) module_permissions NULL olan uzman: modül açılır, NULL birleşimi bozulmaz.
  r := public.admin_set_astrology_technique_grants(E6, OWNER, '{"mode":"list","techniques":["kp.chart"]}', true);
  SELECT module_permissions INTO p FROM public.users WHERE id = E6; IF p IS DISTINCT FROM '{"astrology": true}'::jsonb THEN RAISE EXCEPTION 'E6: %', p; END IF;

  -- 9) Yetki: yalnız service_role çalıştırır; SECURITY DEFINER; users RLS açık kalır.
  IF has_function_privilege('anon', 'public.admin_set_astrology_technique_grants(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_set_astrology_technique_grants(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_set_astrology_technique_grants(uuid,uuid,jsonb,boolean)', 'EXECUTE')
  THEN RAISE EXCEPTION 'fonksiyon yetkileri hatalı'; END IF;
  IF has_function_privilege('anon', 'public.astrology_technique_grants_is_valid(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'doğrulayıcı anon'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'admin_set_astrology_technique_grants') THEN RAISE EXCEPTION 'SECURITY DEFINER değil'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass) THEN RAISE EXCEPTION 'users RLS kapandı'; END IF;
END $$;

-- 10) ATOMİKLİK: denetim yazımı başarısız olursa izin yazımı da geri alınır (kısmi kayıt yok).
CREATE FUNCTION public._tg_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'denetim yazımı başarısız (test)'; END $f$;
CREATE TRIGGER _tg_fail BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public._tg_fail_audit();
DO $$
DECLARE failed boolean := false; p jsonb; g jsonb;
BEGIN
  BEGIN
    PERFORM public.admin_set_astrology_technique_grants('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '{"mode":"all"}', true);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'tetikleyici hatası yutuldu'; END IF;
  SELECT module_permissions, astrology_technique_grants INTO p, g FROM public.users WHERE id = 'e0000000-0000-4000-8000-000000000003';
  IF p IS DISTINCT FROM '{"clients": true}'::jsonb OR g IS NOT NULL THEN RAISE EXCEPTION 'KISMİ KAYIT: % %', p, g; END IF;
END $$;
DROP TRIGGER _tg_fail ON public.admin_audit_log;
DROP FUNCTION public._tg_fail_audit();
SELECT 'technique-grants-assert OK';
