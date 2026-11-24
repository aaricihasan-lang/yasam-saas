-- GİRİŞ GÜVENLİĞİ F2-D davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
-- Zincir (fixture): session-model + f2a + f2b + f2c + f2d fixture'ları → 20270129000200 → 20271003200000 →
--   20271003200100 → F2-A → F2-B 000100 → 000200 → F2-C 000300 ; migration: 20280103000400 (iki kez).
-- HMAC uygulama katmanındadır (f2d-routes harness'ı gerçek pepper ile sınar); burada özet değerleri
-- sentetik sha256 — DB durum makinesi, sınırlar, kilit, kota, bildirim, yalıtım ve yetkiler sınanır.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
CREATE FUNCTION pg_temp.iss(p_user uuid, p_purpose text, p_ch uuid, p_code text, p_daily int DEFAULT 100000, p_warn int DEFAULT 100000)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_email_otp_issue(p_user, p_purpose, p_ch, pg_temp.h(p_code), pg_temp.h('to:' || p_user), 'synthetic', p_daily, p_warn);
$$;
CREATE FUNCTION pg_temp.ok(p_del jsonb) RETURNS void LANGUAGE sql AS $$
  SELECT public.auth_email_delivery_result((p_del->>'delivery_id')::bigint, true, NULL, 'msg-1');
$$;
CREATE FUNCTION pg_temp.ver(p_user uuid, p_purpose text, p_ch uuid, p_code text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_email_otp_verify(p_user, p_purpose, p_ch, pg_temp.h(p_code));
$$;
-- Zamanı test için geri al (yalnız yerel test): age = 60 sn bekleme geçer; hour = saatlik pencere geçer.
CREATE FUNCTION pg_temp.age(p_user uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE public.auth_email_otps SET created_at = created_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds'
   WHERE user_id = p_user;
$$;
CREATE FUNCTION pg_temp.hour(p_user uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE public.auth_email_otps SET created_at = created_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes'
   WHERE user_id = p_user;
$$;
CREATE FUNCTION pg_temp.fin(p_ch uuid, p_hash text, p_tok text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_finalize_login(p_ch, p_hash, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    'desktop', 'desktop_web', NULL, now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
$$;

DO $$
DECLARE
  OWNER  constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2   constant uuid := '00000000-0000-0000-0000-00000000a002';
  FREE   constant uuid := '00000000-0000-0000-0000-00000000e001';
  VE     constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  VE2    constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  NOMAIL constant uuid := '00000000-0000-0000-0000-00000000e0d3';
  r jsonb; d jsonb; n int; t text; ch uuid; ch2 uuid; ch3 uuid; base int;
BEGIN
  PERFORM public.create_session_admin_web(OWNER, 'f2d-owner', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  PERFORM public.create_session_admin_web(ADM2, 'f2d-adm2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
  VALUES (VE2, 'f2d-ve2-self', true, 'desktop_web', 'expert', now() + interval '1 day', NULL);
  PERFORM set_config('yasam.mfa_finalize', 'off', true);

  -- ── A) Başlangıç: kimse doğrulanmış değil; yöntem yok; boş tablolar ────────
  SELECT count(*) INTO n FROM public.users WHERE email_verified_at IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'A1 migration kimseyi doğrulanmış yapmamalı (%)', n; END IF;
  SELECT (SELECT count(*) FROM public.auth_email_otps) + (SELECT count(*) FROM public.auth_email_deliveries) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'A2 migration satır üretmemeli'; END IF;
  IF public.auth_mfa_user_has_method(VE) THEN RAISE EXCEPTION 'A3 doğrulanmamış e-posta yöntem değildir'; END IF;
  r := public.auth_mfa_set_required('f2d-owner', VE, true, 'erken');
  IF r->>'code' <> 'no_method' THEN RAISE EXCEPTION 'A4 yöntemsiz hesap zorunlu yapılamaz: %', r; END IF;
  r := pg_temp.iss(NOMAIL, 'verify_email', NULL, '111111');
  IF r->>'reason' <> 'inactive' THEN RAISE EXCEPTION 'A5 e-postasız hesaba kod yok: %', r; END IF;
  r := pg_temp.iss(VE, 'verify_email', gen_random_uuid(), '111111');
  IF r->>'reason' <> 'bad_request' THEN RAISE EXCEPTION 'A6 doğrulama kodu challenge''a bağlanamaz: %', r; END IF;
  r := public.auth_email_otp_issue(VE, 'verify_email', NULL, 'ABC', pg_temp.h('x'), 'synthetic', 10, 10);
  IF r->>'reason' <> 'bad_request' THEN RAISE EXCEPTION 'A7 özet biçimi zorunlu (düz kod kabul edilmez): %', r; END IF;

  -- ── B) Gönderim sonucu: başarısız gönderilen kod DOĞRULANAMAZ; uyarı Owner'a ─
  d := pg_temp.iss(VE, 'verify_email', NULL, '222222');
  IF NOT (d->>'ok')::boolean THEN RAISE EXCEPTION 'B1 kod rezervasyonu: %', d; END IF;
  r := pg_temp.ver(VE, 'verify_email', NULL, '222222');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'B2 gönderim sonucu gelmeden kod geçersiz: %', r; END IF;
  PERFORM public.auth_email_delivery_result((d->>'delivery_id')::bigint, false, 'provider_down', NULL);
  r := pg_temp.ver(VE, 'verify_email', NULL, '222222');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'B3 gönderilemeyen kod doğrulanamaz: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_email_otps WHERE user_id = VE AND state = 'failed';
  IF n <> 1 THEN RAISE EXCEPTION 'B4 kod failed olmalı'; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND kind = 'action'
     AND target_user_id = OWNER AND resolved_at IS NULL AND payload->>'reason' = 'provider_down';
  IF n <> 1 THEN RAISE EXCEPTION 'B5 Owner zilinde eposta_uyari (hedef Owner)'; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND payload::text LIKE '%@%';
  IF n <> 0 THEN RAISE EXCEPTION 'B6 bildirimde adres olmamalı'; END IF;
  PERFORM public.auth_email_delivery_result((d->>'delivery_id')::bigint, true, NULL, 'late');
  SELECT count(*) INTO n FROM public.auth_email_otps WHERE user_id = VE AND state = 'active';
  IF n <> 0 THEN RAISE EXCEPTION 'B7 sonuç ikinci kez yazılamaz (failed → active YOK)'; END IF;

  -- ── C) Bekleme süresi ────────────────────────────────────────────────────
  r := pg_temp.iss(VE, 'verify_email', NULL, '333333');
  IF r->>'reason' <> 'cooldown' OR (r->>'retry_after')::int NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'C1 60 sn bekleme: %', r; END IF;

  -- ── D) Doğrulama: yanlış → kalan hak; doğru → tek kullanım + e-posta doğrulandı ─
  PERFORM pg_temp.age(VE);
  d := pg_temp.iss(VE, 'verify_email', NULL, '444444');
  PERFORM pg_temp.ok(d);
  r := pg_temp.ver(VE, 'verify_email', NULL, '000000');
  IF r->>'reason' <> 'wrong' OR (r->>'attempts_left')::int <> 4 THEN RAISE EXCEPTION 'D1 yanlış kod: %', r; END IF;
  r := pg_temp.ver(VE2, 'verify_email', NULL, '444444');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'D2 başka kullanıcının kodu geçersiz: %', r; END IF;
  r := pg_temp.ver(VE, 'verify_email', NULL, '444444');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D3 doğru kod: %', r; END IF;
  r := pg_temp.ver(VE, 'verify_email', NULL, '444444');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'D4 kod tek kullanımlık: %', r; END IF;
  IF (SELECT email_verified_at FROM public.users WHERE id = VE) IS NULL THEN RAISE EXCEPTION 'D5 email_verified_at'; END IF;
  IF (SELECT email_verified_at FROM public.users WHERE id = VE2) IS NOT NULL THEN RAISE EXCEPTION 'D6 başka kullanıcı etkilenmez'; END IF;
  IF NOT public.auth_mfa_user_has_method(VE) THEN RAISE EXCEPTION 'D7 doğrulanmış e-posta yöntemdir'; END IF;
  r := public.auth_mfa_user_methods(VE);
  IF NOT (r->>'email_verified')::boolean OR (r->>'has_device')::boolean THEN RAISE EXCEPTION 'D8 yöntem bilgisi: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = VE;
  IF n <> 0 THEN RAISE EXCEPTION 'D9 e-posta doğrulaması OTURUM AÇMAZ'; END IF;

  -- ── E) Süre dolumu ───────────────────────────────────────────────────────
  PERFORM pg_temp.age(VE2);
  d := pg_temp.iss(VE2, 'verify_email', NULL, '555555');
  PERFORM pg_temp.ok(d);
  UPDATE public.auth_email_otps SET created_at = now() - interval '5 minutes', expires_at = now() - interval '1 second'
   WHERE id = (d->>'otp_id')::bigint;
  r := pg_temp.ver(VE2, 'verify_email', NULL, '555555');
  IF r->>'reason' <> 'expired' THEN RAISE EXCEPTION 'E1 süresi dolan kod: %', r; END IF;
  r := pg_temp.ver(VE2, 'verify_email', NULL, '555555');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'E2 süresi dolan kod bir daha denenemez: %', r; END IF;

  -- ── F) Giriş kodu: yalnız doğrulanmış adrese, challenge'a bağlı; 5 yanlış → kilit + red ─
  r := public.auth_mfa_set_required('f2d-owner', VE, true, 'e-posta testi');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'F0 doğrulanmış e-postalı hesap zorunlu yapılabilir: %', r; END IF;
  r := public.auth_mfa_begin(VE, pg_temp.h('bind-1'), 'desktop_web', 'x', 'UA', 300);
  ch := (r->>'challenge_id')::uuid;
  r := pg_temp.iss(VE2, 'login', ch, '666666');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F1 başka kullanıcının challenge''ı: %', r; END IF;
  UPDATE public.users SET email_verified_at = NULL WHERE id = VE;
  r := pg_temp.iss(VE, 'login', ch, '666666');
  IF r->>'reason' <> 'email_unverified' THEN RAISE EXCEPTION 'F2 doğrulanmamış adrese giriş kodu yok: %', r; END IF;
  UPDATE public.users SET email_verified_at = now() WHERE id = VE;
  r := pg_temp.iss(VE, 'login', NULL, '666666');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F3 giriş kodu challenge''sız olamaz: %', r; END IF;
  PERFORM pg_temp.age(VE);
  d := pg_temp.iss(VE, 'login', ch, '666666');
  PERFORM pg_temp.ok(d);
  FOR i IN 1..4 LOOP
    r := pg_temp.ver(VE, 'login', ch, '00000' || i);
    IF r->>'reason' <> 'wrong' OR (r->>'attempts_left')::int <> 5 - i THEN RAISE EXCEPTION 'F4.% yanlış: %', i, r; END IF;
  END LOOP;
  r := pg_temp.ver(VE, 'login', ch, '000009');
  IF r->>'reason' <> 'locked' THEN RAISE EXCEPTION 'F5 5. yanlış kilitler: %', r; END IF;
  SELECT state || ':' || coalesce(denied_reason, '') INTO t FROM public.auth_mfa_challenges WHERE id = ch;
  IF t <> 'denied:otp_locked' THEN RAISE EXCEPTION 'F6 challenge kalıcı red: %', t; END IF;
  r := pg_temp.ver(VE, 'login', ch, '666666');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F7 kilitten sonra DOĞRU kod da geçmez: %', r; END IF;
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = VE AND event_type = 'mfa_email_otp_locked';
  IF n <> 1 THEN RAISE EXCEPTION 'F8 güvenlik olayı'; END IF;
  r := pg_temp.fin(ch, pg_temp.h('bind-1'), 'f2d-tok-x');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'F9 reddedilen challenge oturum açamaz: %', r; END IF;

  -- ── G) Başarılı e-posta girişi + bağlama: kod başka challenge'da geçersiz ─
  r := public.auth_mfa_begin(VE, pg_temp.h('bind-2'), 'desktop_web', 'x', 'UA', 300); ch2 := (r->>'challenge_id')::uuid;
  r := public.auth_mfa_begin(VE, pg_temp.h('bind-3'), 'desktop_web', 'x', 'UA', 300); ch3 := (r->>'challenge_id')::uuid;
  PERFORM pg_temp.age(VE);
  d := pg_temp.iss(VE, 'login', ch2, '777777');
  PERFORM pg_temp.ok(d);
  r := pg_temp.ver(VE, 'login', ch3, '777777');
  IF r->>'reason' <> 'no_code' THEN RAISE EXCEPTION 'G1 kod yalnız kendi challenge''ında: %', r; END IF;
  r := pg_temp.fin(ch2, pg_temp.h('bind-2'), 'f2d-tok-early');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'G2 doğrulanmadan oturum yok: %', r; END IF;
  r := pg_temp.ver(VE, 'login', ch2, '777777');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'G3 doğru giriş kodu: %', r; END IF;
  SELECT state || ':' || coalesce(method, '') INTO t FROM public.auth_mfa_challenges WHERE id = ch2;
  IF t <> 'verified:email_otp' THEN RAISE EXCEPTION 'G4 challenge verified/email_otp: %', t; END IF;
  r := pg_temp.fin(ch2, pg_temp.h('bind-3'), 'f2d-tok-wrongbind');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'G5 başka tarayıcı bağlamasıyla oturum yok: %', r; END IF;
  r := pg_temp.fin(ch2, pg_temp.h('bind-2'), 'f2d-tok-1');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'G6 finalize: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2d-tok-1' AND user_id = VE AND mfa_method = 'email_otp';
  IF n <> 1 THEN RAISE EXCEPTION 'G7 oturum mfa_method=email_otp'; END IF;
  r := pg_temp.ver(VE, 'login', ch2, '777777');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'G8 kullanılmış challenge''a kod yok: %', r; END IF;

  -- ── H) Gönderim sınırları: challenge başına ≤3; kullanıcı başına saatte ≤6 ─
  PERFORM pg_temp.hour(VE);
  FOR i IN 1..3 LOOP
    PERFORM pg_temp.age(VE);
    r := pg_temp.iss(VE, 'login', ch3, '88888' || i);
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'H1.% challenge başına 3 kod: %', i, r; END IF;
    PERFORM pg_temp.ok(r);
  END LOOP;
  SELECT count(*) INTO n FROM public.auth_email_otps WHERE challenge_id = ch3 AND state = 'superseded';
  IF n <> 2 THEN RAISE EXCEPTION 'H2 yeni kod eskisini geçersiz kılar (%)', n; END IF;
  r := pg_temp.ver(VE, 'login', ch3, '888881');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'H3 eski kod geçersiz: %', r; END IF;
  PERFORM pg_temp.age(VE);
  r := pg_temp.iss(VE, 'login', ch3, '888884');
  IF r->>'reason' NOT IN ('too_many', 'rate_limited') THEN RAISE EXCEPTION 'H4 4. kod reddedilir: %', r; END IF;
  FOR i IN 1..6 LOOP
    PERFORM pg_temp.age(VE2);
    r := pg_temp.iss(VE2, 'verify_email', NULL, '99999' || i);
    IF i <= 5 AND NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'H5.% saatlik sınır öncesi: %', i, r; END IF;
    IF (r->>'ok')::boolean THEN PERFORM pg_temp.ok(r); END IF;
  END LOOP;
  -- VE2: E bölümünde 1 + burada 6 = 7. → saatte 6 sınırı 6. denemede devreye girmiş olmalı.
  IF r->>'reason' <> 'rate_limited' THEN RAISE EXCEPTION 'H6 kullanıcı başına saatte 6: %', r; END IF;

  -- ── I) Kaba kuvvet tavanı: kayan 24 saatte toplam 10 yanlış → yeni kod yok ─
  FOR i IN 1..3 LOOP
    PERFORM pg_temp.age(FREE);
    d := pg_temp.iss(FREE, 'verify_email', NULL, '12345' || i);
    IF NOT (d->>'ok')::boolean THEN RAISE EXCEPTION 'I1.% : %', i, d; END IF;
    PERFORM pg_temp.ok(d);
    FOR j IN 1..(CASE WHEN i < 3 THEN 4 ELSE 2 END) LOOP
      PERFORM pg_temp.ver(FREE, 'verify_email', NULL, '00000' || j);
    END LOOP;
  END LOOP;
  PERFORM pg_temp.age(FREE);
  r := pg_temp.iss(FREE, 'verify_email', NULL, '123459');
  IF r->>'reason' <> 'rate_limited' THEN RAISE EXCEPTION 'I2 24 saatte 10 yanlış sonrası kod yok: %', r; END IF;

  -- ── J) Kota: eşik uyarısı + dolunca gönderim YOK; tek açık uyarı; Owner kapatır ─
  r := public.auth_email_alerts_ack('f2d-adm2');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'J0 yalnız Owner kapatır: %', r; END IF;
  r := public.auth_email_alerts_ack('f2d-owner');
  IF NOT (r->>'ok')::boolean OR (r->>'closed')::int <> 1 THEN RAISE EXCEPTION 'J1 açık uyarı kapatılır: %', r; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolution = 'kapandi';
  IF n <> 1 THEN RAISE EXCEPTION 'J2 kapanış çözümü'; END IF;
  SELECT count(*)::int INTO base FROM public.auth_email_deliveries WHERE created_at > now() - interval '24 hours' AND state IN ('reserved', 'sent');
  PERFORM pg_temp.hour(VE);
  r := public.auth_mfa_begin(VE, pg_temp.h('bind-4'), 'desktop_web', 'x', 'UA', 300); ch := (r->>'challenge_id')::uuid;
  PERFORM pg_temp.age(VE);
  r := pg_temp.iss(VE, 'login', ch, '246810', 100000, base + 1);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'J3 eşik gönderimi engellemez: %', r; END IF;
  PERFORM pg_temp.ok(r);
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolved_at IS NULL AND payload->>'reason' = 'kota_esigi' AND target_user_id = OWNER;
  IF n <> 1 THEN RAISE EXCEPTION 'J4 kota eşiği uyarısı'; END IF;
  PERFORM public.auth_email_alerts_ack('f2d-owner');
  PERFORM pg_temp.age(VE);
  r := pg_temp.iss(VE, 'login', ch, '246811', base + 1, base + 1);
  IF r->>'reason' <> 'quota_exhausted' THEN RAISE EXCEPTION 'J5 kota dolunca gönderim yok: %', r; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolved_at IS NULL AND payload->>'reason' = 'kota_doldu' AND target_user_id = OWNER;
  IF n <> 1 THEN RAISE EXCEPTION 'J6 kota doldu uyarısı'; END IF;
  r := pg_temp.ver(VE, 'login', ch, '246811');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'J7 kota reddinde yeni kod üretilmedi: %', r; END IF;
  PERFORM public.auth_email_notify('oauth_invalid_grant', '{}'::jsonb);
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'J8 aynı anda tek açık e-posta uyarısı (%)', n; END IF;

  -- ── K) Owner durum / test ───────────────────────────────────────────────
  r := public.auth_email_status('f2d-adm2');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'K1 Owner olmayan admin: %', r; END IF;
  r := public.auth_email_status('f2d-ve2-self');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'K2 uzman: %', r; END IF;
  r := public.auth_email_status('f2d-owner');
  IF NOT (r->>'ok')::boolean OR (r->'last_24h'->>'sent')::int < 1 OR (r->>'verified_users')::int <> 1
     OR jsonb_array_length(r->'open_alerts') <> 1 OR r->'last_failure'->>'code' <> 'provider_down' THEN
    RAISE EXCEPTION 'K3 durum: %', r; END IF;
  IF r::text LIKE '%@%' THEN RAISE EXCEPTION 'K4 durumda adres olmamalı'; END IF;
  FOR i IN 1..5 LOOP
    r := public.auth_email_owner_test_reserve('f2d-owner', pg_temp.h('owner-to'), 'synthetic');
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'K5.% test rezervasyonu: %', i, r; END IF;
    PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, 'm');
  END LOOP;
  r := public.auth_email_owner_test_reserve('f2d-owner', pg_temp.h('owner-to'), 'synthetic');
  IF r->>'code' <> 'rate_limited' THEN RAISE EXCEPTION 'K6 saatte 5 test: %', r; END IF;
  r := public.auth_email_owner_test_reserve('f2d-adm2', pg_temp.h('owner-to'), 'synthetic');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'K7 test yalnız Owner: %', r; END IF;

  -- ── L) Bildirim geçmişi tür filtresi (prod gövdesi + genişletilmiş liste) ─
  r := public.admin_notification_history(OWNER, NULL, 'eposta_uyari', 'all', NULL, NULL, 25, 0);
  IF (r->>'total')::int < 1 THEN RAISE EXCEPTION 'L1 eposta_uyari filtresi: %', r; END IF;
  r := public.admin_notification_history(OWNER, NULL, 'cihaz_eslesme', 'all', NULL, NULL, 25, 0);
  IF r->>'total' IS NULL THEN RAISE EXCEPTION 'L2 cihaz_eslesme filtresi: %', r; END IF;
  r := public.admin_notification_history(OWNER, NULL, 'basvuru', 'open', NULL, NULL, 25, 0);
  IF (r->>'total')::int <> 1 THEN RAISE EXCEPTION 'L3 eski filtreler aynı: %', r; END IF;
  BEGIN
    PERFORM public.admin_notification_history(OWNER, NULL, 'gecersiz', 'all', NULL, NULL, 25, 0);
    RAISE EXCEPTION 'L4 geçersiz tür reddedilmeli';
  EXCEPTION WHEN SQLSTATE 'AN400' THEN NULL;
  END;

  -- ── M) Düz kod yok + yetkiler ───────────────────────────────────────────
  SELECT count(*) INTO n FROM public.auth_email_otps WHERE code_hash !~ '^[0-9a-f]{64}$' OR code_hash ~ '^[0-9]{6}$';
  IF n <> 0 THEN RAISE EXCEPTION 'M1 yalnız özet'; END IF;
  IF has_table_privilege('service_role', 'public.auth_email_otps', 'SELECT')
     OR has_table_privilege('service_role', 'public.auth_email_deliveries', 'SELECT')
     OR has_table_privilege('anon', 'public.auth_email_otps', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_email_deliveries', 'INSERT') THEN
    RAISE EXCEPTION 'M2 tablolara doğrudan erişim olmamalı'; END IF;
  IF has_function_privilege('anon', 'public.auth_email_otp_verify(uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_email_otp_issue(uuid,text,uuid,text,text,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.auth_email_notify(text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.auth_email_status(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_email_alerts_ack(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.auth_email_otp_verify(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'M3 fonksiyon yetkileri'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND (p.proname LIKE 'auth_email_%' OR p.proname IN ('auth_mfa_user_has_method', 'auth_mfa_user_methods'))
     AND NOT (p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%');
  IF n <> 0 THEN RAISE EXCEPTION 'M4 SECURITY DEFINER + search_path (% eksik)', n; END IF;
  SELECT count(*) INTO n FROM public.users WHERE mfa_required AND NOT public.auth_mfa_user_has_method(id);
  IF n <> 0 THEN RAISE EXCEPTION 'M5 yöntemsiz zorunlu hesap olmamalı (%)', n; END IF;

  RAISE NOTICE 'session-f2d assert: PASS';
END $$;
