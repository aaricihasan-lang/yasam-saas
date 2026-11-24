-- GİRİŞ GÜVENLİĞİ F2-E davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar.
-- Zincir (fixture): session-model + f2a + f2b + f2c + f2d fixture'ları → 20270129000200 → 20271003200000 →
--   20271003200100 → F2-A → F2-B 000100 → 000200 → F2-C 000300 → F2-D 000400 ; migration: 20280103000500 (iki kez).
-- Kod özetleri uygulama ile AYNI biçim: public.auth_recovery_hash = sha256('yasam-recovery-v1:' ‖ user ‖ ':' ‖ kod).
-- Test-only kısayollar: MFA'lı oturum / cihaz / challenge satırları postgres rolüyle doğrudan kurulur (yalnız
-- burada); üretimde bunlar YALNIZ auth_finalize_login / F2-C akışıyla oluşur. Zaman, satır tarihleri geri
-- alınarak taklit edilir.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
CREATE FUNCTION pg_temp.rh(p_user uuid, p_code text) RETURNS text LANGUAGE sql AS $$ SELECT public.auth_recovery_hash(p_user, p_code); $$;
-- 10 kod: '<önek>0' … '<önek>9' (test kodu; biçim kontrolü uygulamada).
CREATE FUNCTION pg_temp.hashes(p_user uuid, p_prefix text) RETURNS text[] LANGUAGE sql AS $$
  SELECT array_agg(public.auth_recovery_hash(p_user, p_prefix || i::text) ORDER BY i) FROM generate_series(0, 9) i;
$$;
CREATE FUNCTION pg_temp.sess(p_user uuid, p_token text, p_method text, p_ch uuid DEFAULT NULL, p_created timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method, mfa_challenge_id, created_at)
  VALUES (p_user, p_token, true, 'desktop_web',
          CASE WHEN p_user = '00000000-0000-0000-0000-00000000a001' THEN 'admin' ELSE 'expert' END,
          now() + interval '1 day', p_method, p_ch, p_created);
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
END $$;
CREATE FUNCTION pg_temp.begin(p_user uuid, p_bind text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.auth_mfa_begin(p_user, pg_temp.h(p_bind), 'desktop_web', 'iphash', 'UA-test', 300)->>'challenge_id')::uuid;
$$;
CREATE FUNCTION pg_temp.rv(p_ch uuid, p_bind text, p_user uuid, p_code text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_recovery_code_verify(p_ch, pg_temp.h(p_bind), public.auth_recovery_hash(p_user, p_code));
$$;
CREATE FUNCTION pg_temp.fin(p_ch uuid, p_bind text, p_tok text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_finalize_login(p_ch, pg_temp.h(p_bind), p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    'desktop', 'desktop_web', NULL, now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
$$;
CREATE FUNCTION pg_temp.dev(p_user uuid, p_state text, p_fp text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state,
                                           activated_at, activation_nonce, activation_expires_at)
  VALUES (p_user, repeat('A', 120), pg_temp.h(p_fp), 'ABCD-EFGH', 'Pixel-' || p_fp, p_state,
          CASE WHEN p_state = 'active' THEN now() END,
          CASE WHEN p_state = 'owner_approved' THEN 'nonce-' || p_fp END,
          CASE WHEN p_state = 'owner_approved' THEN now() + interval '10 minutes' END)
  RETURNING id;
$$;
-- QR ile açılmış (tüketilmiş) challenge — telefon değişimi kanıtı için.
CREATE FUNCTION pg_temp.qrch(p_user uuid, p_dev uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.auth_mfa_challenges (user_id, browser_secret_hash, state, method, verified_at, consumed_at, session_id,
                                          approved_device_id, created_at, expires_at)
  VALUES (p_user, pg_temp.h('qr-' || p_dev::text), 'consumed', 'qr_device', now(), now(), gen_random_uuid(), p_dev, now(), now() + interval '5 minutes')
  RETURNING id;
$$;

-- Prod'daki normalize e-posta tekilliği (20260910000000 BF-11F-B) — fixture zincirinde yok; yarış testi için.
CREATE UNIQUE INDEX IF NOT EXISTS f2e_users_email_norm_uidx ON public.users (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  FREE  constant uuid := '00000000-0000-0000-0000-00000000e001';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  VE2   constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  r jsonb; n int; t text; ch uuid; ch2 uuid; d1 uuid; d2 uuid; d3 uuid; cid uuid; v_req uuid; codes text[];
BEGIN
  -- ── 0) Başlangıç: migration satır üretmez, kimse zorunlu olmaz, yeni tablolar service_role'e kapalı ──
  SELECT (SELECT count(*) FROM public.auth_recovery_codes) + (SELECT count(*) FROM public.auth_recovery_cases)
       + (SELECT count(*) FROM public.auth_recovery_events) + (SELECT count(*) FROM public.auth_email_change_requests)
       + (SELECT count(*) FROM public.auth_device_replacements) + (SELECT count(*) FROM public.auth_recovery_attempts) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '0.1 migration satır üretmemeli (%)', n; END IF;
  SELECT count(*) INTO n FROM public.users WHERE mfa_required;
  IF n <> 0 THEN RAISE EXCEPTION '0.2 migration kimseyi zorunlu yapmamalı'; END IF;
  FOREACH t IN ARRAY ARRAY['auth_recovery_codes','auth_recovery_attempts','auth_recovery_events','auth_recovery_cases',
                           'auth_email_change_requests','auth_device_replacements'] LOOP
    IF has_table_privilege('service_role', 'public.' || t, 'SELECT') OR has_table_privilege('service_role', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '0.3 % tablosu API rollerine kapalı olmalı', t;
    END IF;
  END LOOP;
  -- İç fonksiyonlar service_role'e KAPALI; dış fonksiyonlar yalnız service_role'e açık.
  FOREACH t IN ARRAY ARRAY['public.auth_mfa_mark_verified(uuid,text)', 'public.auth_recovery_hash(uuid,text)',
      'public.auth_recovery_random_code()', 'public.auth_recovery_log(uuid,uuid,text,jsonb)', 'public.auth_session_mfa(text)',
      'public.auth_device_revoke_internal(uuid,uuid,text,text)', 'public.auth_owner_offline_kit_issue()',
      'public.auth_recovery_notify(uuid,uuid,text)'] LOOP
    IF has_function_privilege('service_role', t, 'EXECUTE') OR has_function_privilege('anon', t, 'EXECUTE') THEN
      RAISE EXCEPTION '0.4 % service_role/anon''a kapalı olmalı', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.auth_recovery_codes_generate(text,text[])', 'public.auth_recovery_code_verify(uuid,text,text)',
      'public.auth_recovery_status(text)', 'public.auth_owner_offline_bootstrap(text)', 'public.auth_email_change_begin(text,text,text,text,text,integer,integer)',
      'public.auth_email_change_confirm(text,uuid,text)', 'public.auth_email_notice_reserve(uuid,text,text)', 'public.auth_device_replace_begin(text,uuid)',
      'public.auth_device_replace_cancel(text)', 'public.auth_device_replace_status(text)', 'public.auth_recovery_case_open(text,uuid,text,text)',
      'public.auth_recovery_case_close(text,uuid,text,text)', 'public.auth_recovery_case_execute(text,uuid,text,boolean)',
      'public.auth_recovery_case_list(text)'] LOOP
    IF NOT has_function_privilege('service_role', t, 'EXECUTE') OR has_function_privilege('anon', t, 'EXECUTE')
       OR has_function_privilege('authenticated', t, 'EXECUTE') THEN
      RAISE EXCEPTION '0.5 % yalnız service_role''e açık olmalı', t;
    END IF;
  END LOOP;
  -- Yöntem listesi genişledi ama F2-D bilgisi aynı kaldı.
  r := public.auth_mfa_user_methods(VE);
  IF r ? 'has_device' IS NOT TRUE OR r ? 'email_verified' IS NOT TRUE OR (r->>'recovery_codes')::int <> 0 THEN
    RAISE EXCEPTION '0.6 auth_mfa_user_methods: %', r;
  END IF;

  -- Ortak kurulum: Owner MFA'lı oturumu, VE / VE2 / AND1 doğrulanmış e-posta + zorunlu MFA.
  PERFORM pg_temp.sess(OWNER, 'o-mfa', 'qr_device');
  PERFORM public.create_session_admin_web(OWNER, 'o-plain', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  UPDATE public.users SET email_verified_at = now() WHERE id IN (VE, VE2, AND1, EXP, OWNER);
  FOREACH t IN ARRAY ARRAY[VE::text, VE2::text, AND1::text, EXP::text] LOOP
    r := public.auth_mfa_set_required('o-mfa', t::uuid, true, 'f2e testi');
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '0.7 zorunluluk: %', r; END IF;
  END LOOP;

  -- ── A) Kod üretimi ───────────────────────────────────────────────────────
  PERFORM public.create_session_admin_web(ADM2, 'adm2-plain', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  r := public.auth_recovery_codes_generate('adm2-plain', pg_temp.hashes(ADM2, 'x'));
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'A1 MFA''sız oturum kod üretemez: %', r; END IF;
  r := public.auth_recovery_codes_generate('yok-token', pg_temp.hashes(VE, 'x'));
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'A2 geçersiz token: %', r; END IF;
  PERFORM pg_temp.sess(VE, 've-qr', 'qr_device');
  r := public.auth_recovery_codes_generate('ve-qr', (pg_temp.hashes(VE, 'x'))[1:9]);
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'A3 tam 10 kod: %', r; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', array_fill(pg_temp.rh(VE, 'same'), ARRAY[10]));
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'A4 kodlar farklı olmalı: %', r; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', array_fill('DUZ-KOD'::text, ARRAY[10]));
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'A5 düz kod kabul edilmez (yalnız özet): %', r; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', pg_temp.hashes(VE, 'old'));
  IF NOT (r->>'ok')::boolean OR (r->>'count')::int <> 10 THEN RAISE EXCEPTION 'A6 üretim: %', r; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', pg_temp.hashes(VE, 'new'));
  IF NOT (r->>'ok')::boolean OR (r->>'revoked')::int <> 10 THEN RAISE EXCEPTION 'A7 yenileme eski 10 kodu iptal eder: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_codes WHERE user_id = VE AND state = 'active';
  IF n <> 10 THEN RAISE EXCEPTION 'A8 yalnız yeni 10 kod aktif (%)', n; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_codes WHERE user_id = VE AND state = 'revoked' AND revoke_reason = 'regenerated';
  IF n <> 10 THEN RAISE EXCEPTION 'A9 eski kodlar revoked/regenerated'; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', pg_temp.hashes(VE, 'third'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'A10 üçüncü üretim: %', r; END IF;
  r := public.auth_recovery_codes_generate('ve-qr', pg_temp.hashes(VE, 'fourth'));
  IF r->>'code' <> 'rate_limited' THEN RAISE EXCEPTION 'A11 24 saatte en fazla 3 üretim: %', r; END IF;
  -- Geri al: son geçerli set 'new' olsun (sonraki testler için).
  UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated' WHERE user_id = VE AND state = 'active';
  UPDATE public.auth_recovery_codes SET state = 'active', revoked_at = NULL, revoke_reason = NULL
   WHERE user_id = VE AND code_hash = ANY (pg_temp.hashes(VE, 'new'));
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = VE AND event_type = 'recovery_codes_generated';
  IF n <> 3 THEN RAISE EXCEPTION 'A12 her üretim security_events''e (%)', n; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE user_id = VE AND event = 'codes_generated';
  IF n <> 3 THEN RAISE EXCEPTION 'A13 her üretim denetim kaydına'; END IF;
  r := public.auth_mfa_user_methods(VE);
  IF (r->>'recovery_codes')::int <> 10 THEN RAISE EXCEPTION 'A14 yöntem bilgisinde kod sayısı: %', r; END IF;
  r := public.auth_recovery_status('ve-qr');
  IF (r->>'codes_active')::int <> 10 OR r::text LIKE '%' || pg_temp.rh(VE, 'new0') || '%' THEN RAISE EXCEPTION 'A15 durum (özet sızmaz): %', r; END IF;

  -- ── B) Girişte kurtarma kodu ─────────────────────────────────────────────
  ch := pg_temp.begin(VE, 'b1');
  r := public.auth_recovery_code_verify(ch, pg_temp.h('baska-tarayici'), pg_temp.rh(VE, 'new0'));
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'B1 başka tarayıcı bağlaması reddedilir: %', r; END IF;
  r := pg_temp.rv(ch, 'b1', VE, 'old0');
  IF r->>'reason' <> 'wrong' OR (r->>'attempts_left')::int <> 4 THEN RAISE EXCEPTION 'B2 yenilenmiş (eski) kod geçersiz: %', r; END IF;
  r := pg_temp.rv(ch, 'b1', VE2, 'new0');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'B3 başka kullanıcı kapsamlı özet geçersiz: %', r; END IF;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) <> 'pending' THEN RAISE EXCEPTION 'B4 yanlış kod challenge''ı doğrulamaz'; END IF;
  r := pg_temp.rv(ch, 'b1', VE, 'new0');
  IF NOT (r->>'ok')::boolean OR (r->>'remaining')::int <> 9 OR r->>'kind' <> 'user' THEN RAISE EXCEPTION 'B5 doğru kod: %', r; END IF;
  IF (SELECT state || '/' || method FROM public.auth_mfa_challenges WHERE id = ch) <> 'verified/recovery_code' THEN RAISE EXCEPTION 'B6 challenge verified/recovery_code'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = VE AND mfa_challenge_id = ch;
  IF n <> 0 THEN RAISE EXCEPTION 'B7 kurtarma kodu tek başına OTURUM AÇMAZ'; END IF;
  r := pg_temp.rv(ch, 'b1', VE, 'new1');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'B8 doğrulanmış challenge ikinci kodu tüketmez: %', r; END IF;
  r := pg_temp.fin(ch, 'b1', 've-rec-1');
  IF NOT (r->>'ok')::boolean OR r->>'mfa_method' <> 'recovery_code' THEN RAISE EXCEPTION 'B9 finalize: %', r; END IF;
  IF (SELECT mfa_method FROM public.user_sessions WHERE session_token = 've-rec-1') <> 'recovery_code' THEN RAISE EXCEPTION 'B10 oturum kanıtı recovery_code'; END IF;
  r := pg_temp.fin(ch, 'b1', 've-rec-2');
  IF r->>'reason' <> 'consumed' THEN RAISE EXCEPTION 'B11 challenge iki oturum açamaz: %', r; END IF;
  ch2 := pg_temp.begin(VE, 'b2');
  r := pg_temp.rv(ch2, 'b2', VE, 'new0');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'B12 kullanılmış kod ikinci kez geçmez: %', r; END IF;
  -- 5 yanlış → kilit + kalıcı red; aynı challenge'da doğru kod artık işe yaramaz.
  FOR i IN 1..3 LOOP r := pg_temp.rv(ch2, 'b2', VE, 'yanlis' || i); END LOOP;
  IF r->>'reason' <> 'wrong' OR (r->>'attempts_left')::int <> 1 THEN RAISE EXCEPTION 'B13 kalan 1: %', r; END IF;
  r := pg_temp.rv(ch2, 'b2', VE, 'yanlis4');
  IF r->>'reason' <> 'locked' THEN RAISE EXCEPTION 'B14 5. yanlış kilit: %', r; END IF;
  IF (SELECT state || '/' || denied_reason FROM public.auth_mfa_challenges WHERE id = ch2) <> 'denied/recovery_locked' THEN RAISE EXCEPTION 'B15 challenge red'; END IF;
  r := pg_temp.rv(ch2, 'b2', VE, 'new2');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'B16 kilitli challenge''da doğru kod da reddedilir: %', r; END IF;
  IF (SELECT state FROM public.auth_recovery_codes WHERE code_hash = pg_temp.rh(VE, 'new2')) <> 'active' THEN RAISE EXCEPTION 'B17 kilit kod harcamaz'; END IF;
  -- 24 saatte 10 yanlış → kullanıcı düzeyinde sınır (doğru kod bile denenmez).
  ch2 := pg_temp.begin(VE, 'b3');
  FOR i IN 1..2 LOOP r := pg_temp.rv(ch2, 'b3', VE, 'y3-' || i); END LOOP;
  ch := pg_temp.begin(VE, 'b4');
  r := pg_temp.rv(ch, 'b4', VE, 'y4-1');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'B18 10. yanlış: %', r; END IF;
  r := pg_temp.rv(ch, 'b4', VE, 'new2');
  IF r->>'reason' <> 'rate_limited' THEN RAISE EXCEPTION 'B19 24 saatte 10 yanlış sonrası sınır: %', r; END IF;
  IF (SELECT state FROM public.auth_recovery_codes WHERE code_hash = pg_temp.rh(VE, 'new2')) <> 'active' THEN RAISE EXCEPTION 'B20 sınır kod harcamaz'; END IF;
  UPDATE public.auth_recovery_attempts SET created_at = created_at - interval '25 hours' WHERE user_id = VE;
  r := pg_temp.rv(ch, 'b4', VE, 'new2');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B21 pencere geçince doğru kod: %', r; END IF;
  UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = VE AND state IN ('pending', 'verified');
  -- Süresi geçmiş challenge.
  ch := pg_temp.begin(VE, 'b5');
  UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = ch;
  r := pg_temp.rv(ch, 'b5', VE, 'new3');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'B22 süresi geçmiş challenge: %', r; END IF;
  -- Zorunlu olmayan kullanıcıda challenge yok → kod hiçbir şey açamaz.
  r := public.auth_mfa_begin(FREE, pg_temp.h('f1'), 'desktop_web', 'x', 'UA', 300);
  IF r->>'reason' <> 'not_required' THEN RAISE EXCEPTION 'B23 parola+MFA dışında challenge yok: %', r; END IF;
  -- MFA kanıtı alanları hâlâ yalnız finalize ile yazılır.
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, mfa_method)
    VALUES (FREE, 'sahte-recovery', true, 'desktop_web', 'expert', 'recovery_code');
    RAISE EXCEPTION 'B24 recovery_code kanıtı doğrudan yazılamaz';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role)
    VALUES (VE, 'mfa-atlatma', true, 'desktop_web', 'expert');
    RAISE EXCEPTION 'B25 zorunlu kullanıcıya finalize dışında oturum açılamaz';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = VE AND event_type = 'recovery_code_used';
  IF n <> 2 THEN RAISE EXCEPTION 'B26 kullanım security_events''e (%)', n; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE user_id = VE AND event IN ('code_wrong', 'code_locked');
  IF n < 10 THEN RAISE EXCEPTION 'B27 yanlış denemeler denetim kaydında (%)', n; END IF;

  -- ── C) Denetim kaydı değiştirilemez ──────────────────────────────────────
  BEGIN
    UPDATE public.auth_recovery_events SET event = 'code_used' WHERE user_id = VE;
    RAISE EXCEPTION 'C1 UPDATE reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.auth_recovery_events WHERE user_id = VE;
    RAISE EXCEPTION 'C2 DELETE reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE detail::text ~ '[0-9a-f]{64}';
  IF n <> 0 THEN RAISE EXCEPTION 'C3 denetim kaydında özet olmamalı'; END IF;

  -- ── D) Owner çevrimdışı kit + yeni telefon eşleştirme kodu ───────────────
  SELECT array_agg(k) INTO codes FROM public.auth_owner_offline_kit_issue() k;
  IF cardinality(codes) <> 5 OR codes[1] !~ '^[A-Z2-7]{4}(-[A-Z2-7]{4}){6}$' THEN RAISE EXCEPTION 'D1 kit 5 kod / 28 karakter: %', codes; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_codes WHERE user_id = OWNER AND kind = 'owner_offline' AND state = 'active';
  IF n <> 5 THEN RAISE EXCEPTION 'D2 kit özetleri'; END IF;
  SELECT array_agg(k) INTO codes FROM public.auth_owner_offline_kit_issue() k;   -- yeniden üretim eskiyi iptal eder
  SELECT count(*) INTO n FROM public.auth_recovery_codes WHERE user_id = OWNER AND kind = 'owner_offline' AND state = 'active';
  IF n <> 5 THEN RAISE EXCEPTION 'D3 yeni kit eskiyi iptal eder (%)', n; END IF;
  -- Owner kurtarma kodu da üretebilir (normal tür) — çevrimdışı kodla karışmaz.
  r := public.auth_recovery_codes_generate('o-mfa', pg_temp.hashes(OWNER, 'own'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D4 Owner normal kod: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_codes WHERE user_id = OWNER AND kind = 'owner_offline' AND state = 'active';
  IF n <> 5 THEN RAISE EXCEPTION 'D5 normal kod yenilemesi çevrimdışı kiti etkilemez'; END IF;
  -- Owner zorunlu MFA (Owner kendi zorunluluğunu açabilir; kaldıramaz).
  r := public.auth_mfa_set_required('o-mfa', OWNER, true, 'owner f2e');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D6 Owner zorunluluk: %', r; END IF;
  r := public.auth_mfa_set_required('o-mfa', OWNER, false, 'kapatma denemesi');
  IF r->>'code' <> 'self_disable_forbidden' THEN RAISE EXCEPTION 'D7 Owner kendi MFA''sını kapatamaz: %', r; END IF;
  -- Normal kodla açılan Owner oturumu eşleştirme kodu ALAMAZ.
  ch := pg_temp.begin(OWNER, 'ob1');
  r := pg_temp.rv(ch, 'ob1', OWNER, 'own0');
  IF NOT (r->>'ok')::boolean OR r->>'kind' <> 'user' THEN RAISE EXCEPTION 'D8 Owner normal kod: %', r; END IF;
  r := pg_temp.fin(ch, 'ob1', 'o-rec-normal');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D9 finalize: %', r; END IF;
  r := public.auth_owner_offline_bootstrap('o-rec-normal');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'D10 normal kurtarma oturumu bootstrap alamaz: %', r; END IF;
  r := public.auth_owner_offline_bootstrap('o-mfa');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'D11 QR oturumu bootstrap alamaz: %', r; END IF;
  -- Çevrimdışı kod: Owner'ın diğer bütün oturumları kapanır.
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = OWNER AND is_active;
  IF n < 3 THEN RAISE EXCEPTION 'D12 Owner''ın açık oturumları (%)', n; END IF;
  ch := pg_temp.begin(OWNER, 'ob2');
  r := public.auth_recovery_code_verify(ch, pg_temp.h('ob2'), pg_temp.rh(OWNER, replace(codes[1], '-', '')));
  IF NOT (r->>'ok')::boolean OR r->>'kind' <> 'owner_offline' THEN RAISE EXCEPTION 'D13 çevrimdışı kod: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = OWNER AND is_active;
  IF n <> 0 THEN RAISE EXCEPTION 'D14 çevrimdışı kodla Owner''ın diğer oturumları kapanır (%)', n; END IF;
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = OWNER AND event_type = 'owner_offline_code_used' AND severity = 'critical';
  IF n <> 1 THEN RAISE EXCEPTION 'D15 kritik güvenlik olayı'; END IF;
  r := pg_temp.fin(ch, 'ob2', 'o-offline');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D16 finalize: %', r; END IF;
  r := public.auth_recovery_status('o-offline');
  IF NOT (r->>'owner_bootstrap_available')::boolean OR r->>'session_recovery_kind' <> 'owner_offline' THEN RAISE EXCEPTION 'D17 durum: %', r; END IF;
  r := public.auth_owner_offline_bootstrap('o-offline');
  IF NOT (r->>'ok')::boolean OR r->>'code' !~ '^[A-Z2-7]{20}$' THEN RAISE EXCEPTION 'D18 bootstrap kodu: %', r; END IF;
  t := r->>'code';
  r := public.auth_owner_offline_bootstrap('o-offline');
  IF r->>'code' <> 'already_issued' THEN RAISE EXCEPTION 'D19 oturum başına bir kez: %', r; END IF;
  -- F2-C eşleştirme akışı bu kodla Owner cihazını owner_approved yapar (SQL konsolu gerekmeden).
  r := public.auth_device_enroll_begin(OWNER, repeat('B', 120), pg_temp.h('owner-new-phone'), 'QWER-TYUI', 'Pixel 9', 34, '2.0.0',
                                       'iph', encode(sha256(convert_to('yasam-bootstrap:' || t, 'UTF8')), 'hex'), NULL);
  IF NOT (r->>'ok')::boolean OR r->>'state' <> 'owner_approved' THEN RAISE EXCEPTION 'D20 bootstrap ile Owner cihazı: %', r; END IF;
  -- Başka kullanıcı Owner bootstrap kodunu kullanamaz (F2-C kuralı korunur).
  r := public.auth_device_enroll_begin(EXP, repeat('C', 120), pg_temp.h('exp-phone'), 'ZXCV-BNMA', 'Pixel 7', 34, '2.0.0',
                                       'iph', encode(sha256(convert_to('yasam-bootstrap:' || t, 'UTF8')), 'hex'), NULL);
  IF r->>'reason' <> 'bootstrap_invalid' THEN RAISE EXCEPTION 'D21 bootstrap yalnız Owner: %', r; END IF;
  -- 30 dk'dan eski çevrimdışı oturum bootstrap alamaz.
  ch := pg_temp.begin(OWNER, 'ob3');
  r := public.auth_recovery_code_verify(ch, pg_temp.h('ob3'), pg_temp.rh(OWNER, replace(codes[2], '-', '')));
  r := pg_temp.fin(ch, 'ob3', 'o-offline-2');
  UPDATE public.user_sessions SET created_at = now() - interval '31 minutes' WHERE session_token = 'o-offline-2';
  r := public.auth_owner_offline_bootstrap('o-offline-2');
  IF r->>'code' <> 'stale_session' THEN RAISE EXCEPTION 'D22 bayat oturum: %', r; END IF;
  -- Çevrimdışı kod Owner dışında hiçbir hesapta geçmez (Owner sıfatı kalkarsa da).
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash) VALUES (VE2, 'owner_offline', gen_random_uuid(), pg_temp.rh(VE2, 'offline-ve2'));
  ch := pg_temp.begin(VE2, 'v2o');
  r := pg_temp.rv(ch, 'v2o', VE2, 'offline-ve2');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'D23 owner_offline türü Owner olmayan hesapta geçersiz: %', r; END IF;
  UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE code_hash = pg_temp.rh(VE2, 'offline-ve2');
  -- Yeni Owner oturumları (sonraki bölümler): MFA'lı ve MFA kanıtı OLMAYAN.
  PERFORM pg_temp.sess(OWNER, 'o-mfa2', 'qr_device');
  PERFORM pg_temp.sess(OWNER, 'o-nomfa', NULL);

  -- ── E) E-posta değişikliği ───────────────────────────────────────────────
  -- E1: Owner panelinden (veya herhangi bir yoldan) adres değişirse doğrulama düşer, bekleyen kodlar geçersiz.
  INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state) VALUES (EXP, 'verify_email', 'synthetic', pg_temp.h('to'), 'sent');
  INSERT INTO public.auth_email_otps (user_id, purpose, code_hash, state, expires_at) VALUES (EXP, 'verify_email', pg_temp.h('c'), 'active', now() + interval '3 minutes');
  UPDATE public.users SET email = 'f2a-exp-yeni@test.local' WHERE id = EXP;
  IF (SELECT email_verified_at FROM public.users WHERE id = EXP) IS NOT NULL THEN RAISE EXCEPTION 'E1 adres değişince doğrulama sıfırlanmalı'; END IF;
  SELECT count(*) INTO n FROM public.auth_email_otps WHERE user_id = EXP AND state = 'active';
  IF n <> 0 THEN RAISE EXCEPTION 'E2 bekleyen e-posta kodları geçersizleşmeli'; END IF;
  IF (SELECT mfa_required FROM public.users WHERE id = EXP) IS NOT TRUE THEN RAISE EXCEPTION 'E3 MFA zorunluluğu değişmez'; END IF;
  UPDATE public.users SET full_name = 'Ad değişti' WHERE id = VE;  -- adres dışı güncelleme doğrulamayı etkilemez
  IF (SELECT email_verified_at FROM public.users WHERE id = VE) IS NULL THEN RAISE EXCEPTION 'E4 ad değişikliği doğrulamayı silmemeli'; END IF;
  UPDATE public.users SET email = upper(email) WHERE id = VE;      -- yalnız büyük/küçük harf → aynı adres
  IF (SELECT email_verified_at FROM public.users WHERE id = VE) IS NULL THEN RAISE EXCEPTION 'E5 harf büyüklüğü adres değişikliği sayılmaz'; END IF;
  UPDATE public.users SET email = lower(email) WHERE id = VE;
  -- E6: e-posta koduyla açılmış oturum adresi DEĞİŞTİREMEZ; QR / kurtarma koduyla açılmış oturum değiştirebilir.
  PERFORM pg_temp.sess(VE2, 've2-email', 'email_otp');
  r := public.auth_email_change_begin('ve2-email', 'yeni@test.local', pg_temp.h('code'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'strong_mfa_required' THEN RAISE EXCEPTION 'E6 e-posta oturumu adres değiştiremez: %', r; END IF;
  r := public.auth_email_change_begin('adm2-plain', 'yeni@test.local', pg_temp.h('code'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'strong_mfa_required' THEN RAISE EXCEPTION 'E7 MFA''sız oturum adres değiştiremez: %', r; END IF;
  r := public.auth_email_change_begin('ve-rec-1', 'F2D-VE@test.local', pg_temp.h('code'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'same_email' THEN RAISE EXCEPTION 'E8 aynı adres: %', r; END IF;
  r := public.auth_email_change_begin('ve-rec-1', 'f2d-ve2@test.local', pg_temp.h('code'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'email_unavailable' THEN RAISE EXCEPTION 'E9 başka hesabın adresi: %', r; END IF;
  r := public.auth_email_change_begin('ve-rec-1', 'gecersiz', pg_temp.h('code'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'E10 biçim: %', r; END IF;
  r := public.auth_email_change_begin('ve-rec-1', 'Ve-Yeni@Test.local', pg_temp.h('code-1'), pg_temp.h('to'), 'synthetic', 1000, 1000);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E11 başlat: %', r; END IF;
  v_req := (r->>'request_id')::uuid;
  r := public.auth_email_change_confirm('ve-rec-1', v_req, pg_temp.h('code-1'));
  IF r->>'code' <> 'not_sent' THEN RAISE EXCEPTION 'E12 gönderim sonucu gelmeden kod geçmez: %', r; END IF;
  PERFORM public.auth_email_delivery_result((SELECT delivery_id FROM public.auth_email_otps WHERE id = (SELECT otp_id FROM public.auth_email_change_requests WHERE id = v_req)), true, NULL, 'm');
  r := public.auth_email_change_confirm('ve2-email', v_req, pg_temp.h('code-1'));
  IF r->>'code' <> 'strong_mfa_required' THEN RAISE EXCEPTION 'E13 başka (zayıf) oturum onaylayamaz: %', r; END IF;
  PERFORM pg_temp.sess(VE2, 've2-qr', 'qr_device');
  r := public.auth_email_change_confirm('ve2-qr', v_req, pg_temp.h('code-1'));
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'E14 başka kullanıcının isteği: %', r; END IF;
  r := public.auth_email_change_confirm('ve-rec-1', v_req, pg_temp.h('yanlis'));
  IF r->>'code' <> 'wrong' OR (r->>'attempts_left')::int <> 4 THEN RAISE EXCEPTION 'E15 yanlış kod: %', r; END IF;
  r := public.auth_email_change_confirm('ve-rec-1', v_req, pg_temp.h('code-1'));
  IF NOT (r->>'ok')::boolean OR r->>'old_email' <> 'f2d-ve@test.local' THEN RAISE EXCEPTION 'E16 onay: %', r; END IF;
  IF (SELECT email || '|' || (email_verified_at IS NOT NULL)::text FROM public.users WHERE id = VE) <> 've-yeni@test.local|true' THEN
    RAISE EXCEPTION 'E17 yeni adres doğrulanmış yazılır';
  END IF;
  IF (SELECT tenant_id FROM public.users WHERE id = VE) <> '10000000-0000-0000-0000-000000000031' THEN RAISE EXCEPTION 'E18 tenant değişmez'; END IF;
  r := public.auth_email_change_confirm('ve-rec-1', v_req, pg_temp.h('code-1'));
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'E19 istek tek kullanımlık: %', r; END IF;
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = VE AND event_type = 'email_changed';
  IF n <> 1 THEN RAISE EXCEPTION 'E20 değişiklik security_events''e'; END IF;
  -- 5 yanlış → istek kilitli.
  PERFORM pg_temp.sess(VE2, 've2-rec', 'recovery_code');
  r := public.auth_email_change_begin('ve2-rec', 've2-yeni@test.local', pg_temp.h('code-2'), pg_temp.h('to2'), 'synthetic', 1000, 1000);
  v_req := (r->>'request_id')::uuid;
  PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, 'm');
  FOR i IN 1..5 LOOP r := public.auth_email_change_confirm('ve2-rec', v_req, pg_temp.h('y' || i)); END LOOP;
  IF r->>'code' <> 'locked' THEN RAISE EXCEPTION 'E21 5 yanlış kilit: %', r; END IF;
  r := public.auth_email_change_confirm('ve2-rec', v_req, pg_temp.h('code-2'));
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'E22 kilitli istek: %', r; END IF;
  IF (SELECT email FROM public.users WHERE id = VE2) <> 'f2d-ve2@test.local' THEN RAISE EXCEPTION 'E23 adres değişmemeli'; END IF;
  -- Bekleme: 60 sn.
  r := public.auth_email_change_begin('ve2-rec', 've2-yeni@test.local', pg_temp.h('code-3'), pg_temp.h('to2'), 'synthetic', 1000, 1000);
  IF r->>'code' <> 'cooldown' THEN RAISE EXCEPTION 'E24 60 sn bekleme: %', r; END IF;
  -- Yarış: istek açıkken adres başka hesapça alınırsa onay unique ihlalini GÜVENLE reddeder (yarım işlem yok).
  UPDATE public.auth_email_change_requests SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = VE2;
  r := public.auth_email_change_begin('ve2-rec', 'yaris@test.local', pg_temp.h('code-4'), pg_temp.h('to3'), 'synthetic', 1000, 1000);
  v_req := (r->>'request_id')::uuid;
  PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, 'm');
  UPDATE public.users SET email = 'yaris@test.local' WHERE id = FREE;
  r := public.auth_email_change_confirm('ve2-rec', v_req, pg_temp.h('code-4'));
  IF r->>'code' <> 'email_unavailable' THEN RAISE EXCEPTION 'E25 yarış: %', r; END IF;
  IF (SELECT email || '|' || (email_verified_at IS NOT NULL)::text FROM public.users WHERE id = VE2) <> 'f2d-ve2@test.local|true' THEN
    RAISE EXCEPTION 'E26 başarısız onay hesabı değiştirmez';
  END IF;
  UPDATE public.users SET email = 'free@test.local' WHERE id = FREE;

  -- ── F) Telefon değişimi ──────────────────────────────────────────────────
  d1 := pg_temp.dev(AND1, 'active', 'and1-old');
  PERFORM pg_temp.sess(AND1, 'and1-email', 'email_otp');
  r := public.auth_device_replace_begin('and1-email', d1);
  IF r->>'code' <> 'old_device_proof_required' THEN RAISE EXCEPTION 'F1 e-posta oturumu eski cihaz kanıtı değildir: %', r; END IF;
  ch := pg_temp.qrch(AND1, d1);
  PERFORM pg_temp.sess(AND1, 'and1-qr', 'qr_device', ch);
  d2 := pg_temp.dev(AND1, 'active', 'and1-other');
  r := public.auth_device_replace_begin('and1-qr', d2);
  IF r->>'code' <> 'old_device_proof_required' THEN RAISE EXCEPTION 'F2 kanıt yalnız onaylayan cihaz için: %', r; END IF;
  UPDATE public.auth_trusted_devices SET state = 'revoked', revoked_at = now() WHERE id = d2;
  r := public.auth_device_replace_begin('and1-qr', d1);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'F3 değişim: %', r; END IF;
  -- Owner bekleyen listesinde değişim bilgisi.
  d3 := pg_temp.dev(AND1, 'pending_owner', 'and1-new');
  r := public.auth_device_list('o-mfa2', 'pending', NULL);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'devices') e WHERE (e->>'id')::uuid = d3 AND e->'replaces' IS NOT NULL AND e->'replaces' <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'F4 Owner listesinde değişim bilgisi: %', r;
  END IF;
  -- Owner onayı ATLANMAZ: pending_owner cihaz aktifleştirilemez.
  r := public.auth_device_activate(d3, 'nonce-and1-new');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F5 Owner onayı olmadan aktivasyon yok: %', r; END IF;
  UPDATE public.auth_trusted_devices SET state = 'owner_approved', activation_nonce = 'nonce-and1-new', activation_expires_at = now() + interval '10 minutes',
         decided_at = now(), decided_by = OWNER WHERE id = d3;
  r := public.auth_device_activate(d3, 'nonce-and1-new');
  IF NOT (r->>'ok')::boolean OR NOT (r->>'replaced')::boolean THEN RAISE EXCEPTION 'F6 aktivasyon + değişim: %', r; END IF;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = d1) <> 'revoked' THEN RAISE EXCEPTION 'F7 eski cihaz iptal'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE session_token = 'and1-qr' AND is_active) THEN RAISE EXCEPTION 'F8 eski cihazın onayladığı oturum kapanır'; END IF;
  -- İptal edilmiş cihaz QR onayı veremez.
  ch := pg_temp.begin(AND1, 'qa1');
  r := public.auth_qr_decide(ch, 'x', d1, 'approve', '00');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F9 iptal cihaz onay veremez: %', r; END IF;
  r := public.auth_qr_fetch(ch, 'x', d1);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F10 iptal cihaz isteği okuyamaz: %', r; END IF;
  -- Süresi geçmiş değişim eski cihazı iptal etmez.
  d1 := pg_temp.dev(EXP, 'active', 'exp-old');
  ch := pg_temp.qrch(EXP, d1);
  PERFORM pg_temp.sess(EXP, 'exp-qr', 'qr_device', ch);
  r := public.auth_device_replace_begin('exp-qr', d1);
  UPDATE public.auth_device_replacements SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE user_id = EXP;
  d2 := pg_temp.dev(EXP, 'owner_approved', 'exp-new');
  r := public.auth_device_activate(d2, 'nonce-exp-new');
  IF NOT (r->>'ok')::boolean OR (r->>'replaced')::boolean THEN RAISE EXCEPTION 'F11 süresi geçmiş değişim: %', r; END IF;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = d1) <> 'active' THEN RAISE EXCEPTION 'F12 eski cihaz yerinde kalır'; END IF;

  -- ── G) Owner aracılı kurtarma (72 saat) ──────────────────────────────────
  r := public.auth_recovery_case_open('adm2-plain', VE2, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'G1 Owner olmayan açamaz: %', r; END IF;
  r := public.auth_recovery_case_open('o-nomfa', VE2, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'G2 MFA''sız Owner oturumu açamaz: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', OWNER, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'self_forbidden' THEN RAISE EXCEPTION 'G3 kendi hesabı: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', VE2, 'mesaj', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'G4 doğrulama yöntemi: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', VE2, 'telefon', 'kısa');
  IF r->>'code' <> 'note_required' THEN RAISE EXCEPTION 'G5 açıklama: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', FREE, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'mfa_not_required' THEN RAISE EXCEPTION 'G6 MFA''sız hesap: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', VE2, 'telefon', 'kayıtlı numaradan arandı, kimlik teyit');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'G7 aç: %', r; END IF;
  cid := (r->>'case_id')::uuid;
  IF (SELECT not_before - opened_at FROM public.auth_recovery_cases WHERE id = cid) <> interval '72 hours' THEN RAISE EXCEPTION 'G8 72 saat'; END IF;
  r := public.auth_recovery_case_open('o-mfa2', VE2, 'telefon', 'kayıtlı numaradan arandı, ikinci');
  IF r->>'code' <> 'case_exists' THEN RAISE EXCEPTION 'G9 tek açık talep: %', r; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'hesap_kurtarma' AND target_user_id = VE2 AND resolved_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'G10 Owner zilinde hesap_kurtarma'; END IF;
  -- 72 saat DB'de zorunlu: doğrudan satır bile kısaltamaz.
  BEGIN
    UPDATE public.auth_recovery_cases SET not_before = opened_at + interval '1 hour' WHERE id = cid;
    RAISE EXCEPTION 'G11 72 saat kısaltılamaz';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), true);
  IF r->>'code' <> 'too_early' THEN RAISE EXCEPTION 'G12 erken yürütme: %', r; END IF;
  -- Hesap sahibi (MFA'lı oturumla) iptal eder.
  r := public.auth_recovery_case_close('ve2-qr', cid, 'reject', 'deneme');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'G13 kullanıcı reddedemez (yalnız iptal): %', r; END IF;
  r := public.auth_recovery_case_close('ve-rec-1', cid, 'cancel', 'başkası');
  IF r->>'code' <> 'not_found' THEN RAISE EXCEPTION 'G14 başka kullanıcı iptal edemez: %', r; END IF;
  r := public.auth_recovery_case_close('ve2-qr', cid, 'cancel', 'ben istemedim');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'G15 sahibi iptal eder: %', r; END IF;
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), true);
  IF r->>'code' <> 'not_waiting' THEN RAISE EXCEPTION 'G16 iptal edilen yürütülemez: %', r; END IF;
  -- Yeni talep; kullanıcı açılıştan sonra MFA'lı giriş yaptıysa yürütme RED.
  r := public.auth_recovery_case_open('o-mfa2', VE2, 'yuz_yuze', 'yüz yüze kimlik kartıyla doğrulandı');
  cid := (r->>'case_id')::uuid;
  UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours',
         expires_at = expires_at - interval '73 hours' WHERE id = cid;
  -- Mevcut VE2 oturumları talepten ÖNCE açılmış sayılır.
  UPDATE public.user_sessions SET created_at = created_at - interval '74 hours' WHERE user_id = VE2;
  PERFORM pg_temp.sess(VE2, 've2-after-open', 'qr_device');
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), true);
  IF r->>'code' <> 'user_active_since_open' THEN RAISE EXCEPTION 'G17 kullanıcı erişimi varken yürütme yok: %', r; END IF;
  DELETE FROM public.user_sessions WHERE session_token = 've2-after-open';
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), false);
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'G18 yeniden teyit şart: %', r; END IF;
  r := public.auth_recovery_case_execute('o-nomfa', cid, pg_temp.rh(VE2, 'ticket'), true);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'G19 MFA''sız Owner yürütemez: %', r; END IF;
  -- Yürütme öncesi durum: cihaz + oturum + kod + açık challenge.
  d1 := pg_temp.dev(VE2, 'active', 've2-phone');
  r := public.auth_recovery_codes_generate('ve2-qr', pg_temp.hashes(VE2, 'v2'));
  ch := pg_temp.begin(VE2, 'v2open');
  -- J) Yarım işlem olmaz: yürütmenin SON adımında hata → hiçbir değişiklik kalmaz.
  CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'yapay hata'; END $f$;
  CREATE TRIGGER f2e_boom BEFORE UPDATE OF state ON public.auth_recovery_cases FOR EACH ROW
    WHEN (NEW.state = 'executed') EXECUTE FUNCTION pg_temp.boom();
  BEGIN
    r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), true);
    RAISE EXCEPTION 'J1 yapay hata yükselmeliydi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'yapay hata' THEN RAISE; END IF;
  END;
  DROP TRIGGER f2e_boom ON public.auth_recovery_cases;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = d1) <> 'active' THEN RAISE EXCEPTION 'J2 hata sonrası cihaz değişmemeli'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions WHERE session_token = 've2-qr' AND is_active) THEN RAISE EXCEPTION 'J3 hata sonrası oturum açık kalmalı'; END IF;
  IF (SELECT count(*) FROM public.auth_recovery_codes WHERE user_id = VE2 AND kind = 'user' AND state = 'active') <> 10 THEN RAISE EXCEPTION 'J4 kodlar değişmemeli'; END IF;
  IF (SELECT state FROM public.auth_recovery_cases WHERE id = cid) <> 'waiting' THEN RAISE EXCEPTION 'J5 talep beklemede kalmalı'; END IF;
  IF EXISTS (SELECT 1 FROM public.auth_recovery_codes WHERE user_id = VE2 AND kind = 'case_ticket') THEN RAISE EXCEPTION 'J6 bilet oluşmamalı'; END IF;
  -- Gerçek yürütme.
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(VE2, 'ticket'), true);
  IF NOT (r->>'ok')::boolean OR (r->>'devices_revoked')::int <> 1 OR (r->>'codes_revoked')::int <> 10 THEN RAISE EXCEPTION 'G20 yürütme: %', r; END IF;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = d1) <> 'revoked' THEN RAISE EXCEPTION 'G21 cihaz iptal'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = VE2 AND is_active;
  IF n <> 0 THEN RAISE EXCEPTION 'G22 bütün oturumlar kapalı (%)', n; END IF;
  IF (SELECT state || '/' || denied_reason FROM public.auth_mfa_challenges WHERE id = ch) <> 'denied/account_recovery' THEN RAISE EXCEPTION 'G23 açık challenge red'; END IF;
  IF (SELECT email_verified_at FROM public.users WHERE id = VE2) IS NOT NULL THEN RAISE EXCEPTION 'G24 e-posta doğrulaması düşer'; END IF;
  IF (SELECT mfa_required FROM public.users WHERE id = VE2) IS NOT TRUE THEN RAISE EXCEPTION 'G25 MFA zorunluluğu ASLA kapanmaz'; END IF;
  IF (SELECT state FROM public.auth_recovery_cases WHERE id = cid) <> 'executed' THEN RAISE EXCEPTION 'G26 talep executed'; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'hesap_kurtarma' AND target_user_id = VE2 AND resolution = 'kurtarma_tamamlandi';
  IF n <> 1 THEN RAISE EXCEPTION 'G27 zil kararı kapanır'; END IF;
  -- Bilet: yöntem olarak sunulur; YALNIZ parola sonrası challenge'da, tek kullanım; oturum recovery_code.
  r := public.auth_mfa_user_methods(VE2);
  IF (r->>'recovery_codes')::int <> 1 OR (r->>'has_device')::boolean OR (r->>'email_verified')::boolean THEN RAISE EXCEPTION 'G28 yürütme sonrası yöntemler: %', r; END IF;
  ch := pg_temp.begin(VE2, 'tk1');
  r := pg_temp.rv(ch, 'tk1', VE2, 'v20');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'G29 eski kodlar iptal: %', r; END IF;
  r := pg_temp.rv(ch, 'tk1', VE2, 'ticket');
  IF NOT (r->>'ok')::boolean OR r->>'kind' <> 'case_ticket' THEN RAISE EXCEPTION 'G30 bilet: %', r; END IF;
  r := pg_temp.fin(ch, 'tk1', 've2-ticket');
  IF NOT (r->>'ok')::boolean OR r->>'mfa_method' <> 'recovery_code' THEN RAISE EXCEPTION 'G31 bilet finalize: %', r; END IF;
  ch := pg_temp.begin(VE2, 'tk2');
  r := pg_temp.rv(ch, 'tk2', VE2, 'ticket');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'G32 bilet tek kullanımlık: %', r; END IF;
  -- Süresi geçen bilet geçersiz.
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash, expires_at, created_at)
  VALUES (VE2, 'case_ticket', gen_random_uuid(), pg_temp.rh(VE2, 'eski-bilet'), now() - interval '1 minute', now() - interval '25 hours');
  r := pg_temp.rv(ch, 'tk2', VE2, 'eski-bilet');
  IF r->>'reason' <> 'wrong' THEN RAISE EXCEPTION 'G33 süresi geçen bilet: %', r; END IF;
  -- Ret ve süre dolumu.
  r := public.auth_recovery_case_open('o-mfa2', EXP, 'kimlik_belgesi', 'kimlik belgesi görüldü ama şüpheli');
  cid := (r->>'case_id')::uuid;
  r := public.auth_recovery_case_close('o-mfa2', cid, 'reject', 'Kimlik doğrulanamadı');
  IF NOT (r->>'ok')::boolean OR (SELECT state FROM public.auth_recovery_cases WHERE id = cid) <> 'rejected' THEN RAISE EXCEPTION 'G34 ret: %', r; END IF;
  r := public.auth_recovery_case_open('o-mfa2', EXP, 'telefon', 'kayıtlı numaradan arandı tekrar');
  cid := (r->>'case_id')::uuid;
  UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '11 days', not_before = not_before - interval '11 days',
         expires_at = expires_at - interval '11 days' WHERE id = cid;
  r := public.auth_recovery_case_execute('o-mfa2', cid, pg_temp.rh(EXP, 'ticket'), true);
  IF r->>'code' <> 'expired' THEN RAISE EXCEPTION 'G35 7 günlük pencere: %', r; END IF;
  r := public.auth_recovery_case_list('o-mfa2');
  IF NOT (r->>'ok')::boolean OR jsonb_array_length(r->'cases') < 4 THEN RAISE EXCEPTION 'G36 liste: %', r; END IF;
  IF r::text ~ '[0-9a-f]{64}' THEN RAISE EXCEPTION 'G37 listede özet / bilet yok'; END IF;
  r := public.auth_recovery_case_list('o-nomfa');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'G38 liste yalnız MFA''lı Owner: %', r; END IF;

  -- ── H) Tenant / hesap yalıtımı ───────────────────────────────────────────
  -- Kurtarma işlemleri yalnız hesabın kendi satırlarını değiştirir: başka kullanıcıların oturum / cihaz / kodları sabit.
  IF NOT EXISTS (SELECT 1 FROM public.user_sessions WHERE session_token = 've-rec-1' AND is_active) THEN RAISE EXCEPTION 'H1 VE oturumu etkilenmemeli'; END IF;
  IF (SELECT count(*) FROM public.auth_recovery_codes WHERE user_id = VE AND state = 'active') <> 8 THEN RAISE EXCEPTION 'H2 VE kodları etkilenmemeli'; END IF;
  SELECT count(DISTINCT tenant_id) INTO n FROM public.users WHERE id IN (VE, VE2, EXP, AND1);
  IF n <> 4 THEN RAISE EXCEPTION 'H3 tenantlar değişmemeli'; END IF;
  -- auth_recovery_status / replace_status başka kullanıcı verisi döndürmez (yalnız token sahibi).
  r := public.auth_recovery_status('ve-rec-1');
  IF (r->>'codes_active')::int <> 8 OR r ? 'user_id' THEN RAISE EXCEPTION 'H4 durum yalnız kendi: %', r; END IF;

  RAISE NOTICE 'session-f2e-assert: TÜM KONTROLLER GEÇTİ';
END $$;
