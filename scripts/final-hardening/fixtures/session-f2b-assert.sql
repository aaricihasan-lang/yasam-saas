-- GİRİŞ GÜVENLİĞİ F2-B davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
-- Zincir (fixture): session-model + session-f2a + session-f2b fixture'ları → 20270129000200 → 20271003200000 →
--   20271003200100 → 20280103000000 (F2-A) ; migration: 20280103000100 + 20280103000200 (iki kez).

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;

CREATE FUNCTION pg_temp.fin(p_ch uuid, p_hash text, p_tok text, p_channel text DEFAULT 'desktop_web', p_platform text DEFAULT 'desktop')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_finalize_login(p_ch, p_hash, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    p_platform, p_channel, NULL, now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
$$;

CREATE FUNCTION pg_temp.begin(p_user uuid, p_bind text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_mfa_begin(p_user, pg_temp.h(p_bind), 'desktop_web', 'iphash', 'UA-test', 300);
$$;

CREATE FUNCTION pg_temp.v2(p_user uuid, p_tok text, p_channel text DEFAULT 'desktop_web', p_platform text DEFAULT 'desktop')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_session_v2(p_user, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    p_platform, p_channel, NULL, now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  FREE  constant uuid := '00000000-0000-0000-0000-00000000e001';
  LIM   constant uuid := '00000000-0000-0000-0000-00000000e0b1';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  r jsonb; n int; t text; ch uuid; ch2 uuid; b boolean; before_n int;
BEGIN
  -- ── A) Varsayılanlar: kimse zorunlu değil; doğrudan değişiklik YASAK ────────
  SELECT count(*) INTO n FROM public.users WHERE mfa_required;
  IF n <> 0 THEN RAISE EXCEPTION 'A1 migration hiçbir kullanıcıyı MFA zorunlu yapmamalı (%)', n; END IF;
  SELECT count(*) INTO n FROM public.auth_mfa_challenges;
  IF n <> 0 THEN RAISE EXCEPTION 'A2 migration challenge satırı üretmemeli'; END IF;
  BEGIN
    UPDATE public.users SET mfa_required = true WHERE id = FREE;
    RAISE EXCEPTION 'A3 doğrudan mfa_required UPDATE reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Başka kolon güncellemesi (mfa_required aynı) serbest — mevcut admin araçları bozulmaz.
  UPDATE public.users SET approval_status = 'approved' WHERE id = FREE;

  -- ── B) auth_mfa_set_required: yalnız Owner, gerekçe zorunlu, kendi kapatma YASAK ─
  r := public.auth_mfa_set_required(ADM2, EXP, true, 'test');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'B1 Owner olmayan admin reddedilmeli: %', r; END IF;
  r := public.auth_mfa_set_required(OWNER, EXP, true, ' ');
  IF r->>'code' <> 'reason_required' THEN RAISE EXCEPTION 'B2 gerekçe zorunlu: %', r; END IF;
  r := public.auth_mfa_set_required(OWNER, EXP, true, 'F2-B test hesabı');
  IF NOT (r->>'ok')::boolean OR NOT (r->>'changed')::boolean THEN RAISE EXCEPTION 'B3 Owner açabilmeli: %', r; END IF;
  SELECT count(*) INTO n FROM public.security_events WHERE user_id = EXP AND event_type = 'mfa_policy_changed';
  IF n <> 1 THEN RAISE EXCEPTION 'B4 değişiklik security_events''e yazılmalı (%)', n; END IF;
  r := public.auth_mfa_set_required(OWNER, OWNER, true, 'Owner kendi hesabı');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B5 Owner kendi zorunluluğunu açabilir: %', r; END IF;
  r := public.auth_mfa_set_required(OWNER, OWNER, false, 'kapat');
  IF r->>'code' <> 'self_disable_forbidden' THEN RAISE EXCEPTION 'B6 Owner kendi MFA''sını kapatamaz: %', r; END IF;
  PERFORM public.auth_mfa_set_required(OWNER, AND1, true, 'Android test');
  PERFORM public.auth_mfa_set_required(OWNER, LIM, true, 'Limit test');

  -- ── C) MFA zorunlu kullanıcı için HİÇBİR alternatif yol oturum açamaz ────────
  before_n := (SELECT count(*) FROM public.user_sessions WHERE user_id IN (EXP, OWNER));
  BEGIN
    PERFORM pg_temp.v2(EXP, 'f2b-bypass-v2');
    RAISE EXCEPTION 'C1 create_session_v2 doğrudan çağrısı MFA''yı atlayamamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.create_session_admin_web(OWNER, 'f2b-bypass-admin', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
    RAISE EXCEPTION 'C2 admin web RPC''si MFA''yı atlayamamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active) VALUES (EXP, 'f2b-bypass-raw', true);
    RAISE EXCEPTION 'C3 doğrudan INSERT (superuser bile) MFA''yı atlayamamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM set_config('yasam.session_create', 'on', true);
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel) VALUES (EXP, 'f2b-bypass-flag', true, 'android_app');
    RAISE EXCEPTION 'C4 oturum bayrağı (session_create) MFA kapısını açmamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('yasam.session_create', 'off', true);
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, mfa_method) VALUES (FREE, 'f2b-fake-evidence', true, 'qr_device');
    RAISE EXCEPTION 'C5 MFA kanıt alanı finalize dışında yazılamamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id IN (EXP, OWNER);
  IF n <> before_n THEN RAISE EXCEPTION 'C6 atlatma denemeleri oturum üretmemeli'; END IF;
  -- MFA zorunlu OLMAYAN kullanıcıda mevcut akış AYNEN çalışır (hazırlıksız kesinti yok).
  r := pg_temp.v2(FREE, 'f2b-free-web');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'C7 zorunlu olmayan kullanıcı eskisi gibi giriş yapabilmeli: %', r; END IF;
  r := public.create_session_admin_web(ADM2, 'f2b-adm2-web', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  IF NOT (r->>'inserted')::boolean OR r->>'state' <> 'active' THEN RAISE EXCEPTION 'C8 admin web RPC (MFA''sız admin) aktif oturum açmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-adm2-web' AND session_role = 'admin' AND is_active
     AND client_channel = 'desktop_web' AND expires_at IS NOT NULL AND token_hash IS NOT NULL AND mfa_method IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'C9 admin web oturum satırı eski doğrudan INSERT ile aynı alanlarda olmalı'; END IF;
  r := public.create_session_admin_web(ADM2, 'f2b-adm2-web-2', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', 'f2b-adm2-web', now() + interval '1 day');
  SELECT end_reason INTO t FROM public.user_sessions WHERE session_token = 'f2b-adm2-web';
  IF t IS DISTINCT FROM 'replaced_same_device' THEN RAISE EXCEPTION 'C10 aynı cihaz eski admin token''ı kapanmalı (%)', t; END IF;
  r := public.create_session_admin_web(EXP, 'f2b-exp-as-admin', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL, now());
  IF (r->>'inserted')::boolean OR r->>'reason' <> 'no_role' THEN RAISE EXCEPTION 'C11 admin RPC uzman için oturum açmamalı: %', r; END IF;

  -- ── D) Challenge başlatma ────────────────────────────────────────────────
  r := pg_temp.begin(FREE, 'b-free');
  IF r->>'reason' <> 'not_required' THEN RAISE EXCEPTION 'D1 zorunlu olmayan kullanıcıya challenge açılmamalı: %', r; END IF;
  r := public.auth_mfa_begin(EXP, 'not-a-hash', 'desktop_web', 'x', 'UA', 300);
  IF r->>'reason' <> 'bad_request' THEN RAISE EXCEPTION 'D2 bozuk bağlama özeti reddedilmeli: %', r; END IF;
  r := pg_temp.begin(EXP, 'b-exp-1');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D3 challenge açılmalı: %', r; END IF;
  ch := (r->>'challenge_id')::uuid;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = EXP;
  IF n <> 0 THEN RAISE EXCEPTION 'D4 challenge oturum OLUŞTURMAMALI'; END IF;
  SELECT count(*) INTO n FROM public.auth_mfa_challenges WHERE id = ch AND browser_secret_hash = pg_temp.h('b-exp-1') AND state = 'pending'
     AND expires_at BETWEEN now() + interval '290 seconds' AND now() + interval '310 seconds';
  IF n <> 1 THEN RAISE EXCEPTION 'D5 challenge yalnız özetle, pending, ~5 dk saklanmalı'; END IF;
  -- Açık challenge sınırı (5).
  FOR i IN 2..5 LOOP PERFORM pg_temp.begin(EXP, 'b-exp-' || i); END LOOP;
  r := pg_temp.begin(EXP, 'b-exp-6');
  IF r->>'reason' <> 'too_many_open' THEN RAISE EXCEPTION 'D6 6. açık challenge reddedilmeli: %', r; END IF;
  UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = EXP AND id <> ch;

  -- ── E) Tamamlama: doğrulanmadan / yanlış bağlamayla / tekrar / süresi dolmuş ─
  r := pg_temp.fin(ch, pg_temp.h('b-exp-1'), 'f2b-exp-tok-0');
  IF r->>'reason' <> 'not_verified' THEN RAISE EXCEPTION 'E1 doğrulanmamış challenge oturum açmamalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-exp-tok-0';
  IF n <> 0 THEN RAISE EXCEPTION 'E2 reddedilen tamamlama satır üretmemeli'; END IF;
  IF public.auth_mfa_mark_verified(ch, 'sms') THEN RAISE EXCEPTION 'E3 bilinmeyen yöntem kabul edilmemeli'; END IF;
  IF NOT public.auth_mfa_mark_verified(ch, 'qr_device') THEN RAISE EXCEPTION 'E4 doğrulama işareti'; END IF;
  IF public.auth_mfa_mark_verified(ch, 'qr_device') THEN RAISE EXCEPTION 'E5 doğrulama iki kez işaretlenmemeli'; END IF;
  r := pg_temp.fin(ch, pg_temp.h('baska-tarayici'), 'f2b-exp-tok-x');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E6 başka tarayıcı (yanlış bağlama) tamamlayamamalı: %', r; END IF;
  r := public.auth_mfa_challenge_status(ch, pg_temp.h('baska-tarayici'));
  IF r->>'state' <> 'invalid' OR r ? 'user_id' THEN RAISE EXCEPTION 'E7 yanlış bağlamayla durum/kimlik sızmamalı: %', r; END IF;
  r := public.auth_mfa_challenge_status(ch, pg_temp.h('b-exp-1'));
  IF r->>'state' <> 'verified' OR (r->>'user_id')::uuid IS DISTINCT FROM EXP THEN RAISE EXCEPTION 'E8 doğru bağlama: %', r; END IF;
  r := pg_temp.fin(ch, pg_temp.h('b-exp-1'), 'f2b-exp-tok-1');
  IF NOT (r->>'ok')::boolean OR NOT (r->>'inserted')::boolean OR (r->>'user_id')::uuid IS DISTINCT FROM EXP THEN
    RAISE EXCEPTION 'E9 doğrulanmış challenge tek oturum açmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-exp-tok-1' AND is_active
     AND mfa_method = 'qr_device' AND mfa_challenge_id = ch AND session_state = 'active';
  IF n <> 1 THEN RAISE EXCEPTION 'E10 oturumda MFA kanıtı (yöntem + challenge) olmalı'; END IF;
  SELECT count(*) INTO n FROM public.auth_mfa_challenges WHERE id = ch AND state = 'consumed' AND session_id IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'E11 challenge tüketilmeli'; END IF;
  r := pg_temp.fin(ch, pg_temp.h('b-exp-1'), 'f2b-exp-tok-2');
  IF r->>'reason' <> 'consumed' THEN RAISE EXCEPTION 'E12 aynı challenge ikinci kez kullanılamamalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-exp-tok-2';
  IF n <> 0 THEN RAISE EXCEPTION 'E13 tekrar kullanım satır üretmemeli'; END IF;
  IF public.touch_active_session('f2b-exp-tok-1', 90, 604800, true, 7200, 86400) IS DISTINCT FROM EXP THEN
    RAISE EXCEPTION 'E14 MFA''lı oturum normal doğrulamadan geçmeli'; END IF;
  -- Kanıt alanları sonradan değiştirilemez.
  BEGIN
    UPDATE public.user_sessions SET mfa_method = NULL WHERE session_token = 'f2b-exp-tok-1';
    RAISE EXCEPTION 'E15 MFA kanıtı silinememeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Çıkış (is_active=false) serbest.
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'user_logout' WHERE session_token = 'f2b-exp-tok-1';

  -- Süresi dolmuş (doğrulanmış) challenge.
  r := pg_temp.begin(EXP, 'b-exp-exp');
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_mfa_mark_verified(ch2, 'email_otp');
  UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = ch2;
  r := pg_temp.fin(ch2, pg_temp.h('b-exp-exp'), 'f2b-exp-tok-3');
  IF r->>'reason' <> 'expired' THEN RAISE EXCEPTION 'E16 süresi dolmuş challenge reddedilmeli: %', r; END IF;
  IF public.auth_mfa_mark_verified(ch2, 'email_otp') THEN RAISE EXCEPTION 'E17 süresi dolmuşa doğrulama işareti konamamalı'; END IF;

  -- Başka kullanıcının challenge'ı kendi bağlamamla: invalid.
  r := pg_temp.begin(AND1, 'b-and');
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_mfa_mark_verified(ch2, 'qr_device');
  r := pg_temp.fin(ch2, pg_temp.h('b-exp-1'), 'f2b-steal');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E18 başka kullanıcının challenge''ı çalınamamalı: %', r; END IF;
  -- Android kanalı: create_session_v2 yolu (süreli android) + MFA kanıtı.
  r := pg_temp.fin(ch2, pg_temp.h('b-and'), 'f2b-and-tok', 'android_app', 'mobile');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'E19 android MFA tamamlama: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-and-tok' AND client_channel = 'android_app'
     AND expires_at IS NOT NULL AND mfa_method = 'qr_device';
  IF n <> 1 THEN RAISE EXCEPTION 'E20 android MFA oturumu süreli + kanıtlı olmalı'; END IF;

  -- Pasifleşen kullanıcı doğrulamadan sonra tamamlayamaz.
  r := pg_temp.begin(EXP, 'b-exp-inact');
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_mfa_mark_verified(ch2, 'qr_device');
  UPDATE public.users SET active = false WHERE id = EXP;
  r := pg_temp.fin(ch2, pg_temp.h('b-exp-inact'), 'f2b-exp-tok-4');
  IF r->>'reason' <> 'inactive' THEN RAISE EXCEPTION 'E21 pasif kullanıcı tamamlayamamalı: %', r; END IF;
  UPDATE public.users SET active = true WHERE id = EXP;

  -- Owner (admin web) MFA'lı tamamlama: admin web yolu, aktif, kanıtlı.
  r := pg_temp.begin(OWNER, 'b-owner');
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_mfa_mark_verified(ch2, 'qr_device');
  r := pg_temp.fin(ch2, pg_temp.h('b-owner'), 'f2b-owner-tok');
  IF NOT (r->>'inserted')::boolean OR r->>'state' <> 'active' THEN RAISE EXCEPTION 'E22 Owner MFA''lı web girişi: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2b-owner-tok' AND session_role = 'admin' AND mfa_method = 'qr_device';
  IF n <> 1 THEN RAISE EXCEPTION 'E23 Owner oturumu kanıtlı olmalı'; END IF;

  -- Limit reddi challenge'ı TÜKETMEZ (kullanıcı oturum kapatıp tekrar deneyebilir).
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, platform, client_channel) VALUES (LIM, 'f2b-lim-existing', true, 'desktop', 'desktop_web');
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
  r := pg_temp.begin(LIM, 'b-lim');
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_mfa_mark_verified(ch2, 'qr_device');
  r := pg_temp.fin(ch2, pg_temp.h('b-lim'), 'f2b-lim-tok');
  IF (r->>'inserted')::boolean OR r->>'reason' <> 'total_limit' THEN RAISE EXCEPTION 'E24 limit reddi: %', r; END IF;
  SELECT state INTO t FROM public.auth_mfa_challenges WHERE id = ch2;
  IF t <> 'verified' THEN RAISE EXCEPTION 'E25 limit reddinde challenge tüketilmemeli (%)', t; END IF;

  -- ── G) Yetkiler ───────────────────────────────────────────────────────────
  IF has_function_privilege('service_role', 'public.auth_mfa_mark_verified(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G1 service_role challenge''ı doğrulanmış işaretleyememeli'; END IF;
  IF NOT has_function_privilege('service_role', 'public.auth_finalize_login(uuid,text,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.auth_finalize_login(uuid,text,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_mfa_begin(uuid,text,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.auth_mfa_set_required(uuid,uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_session_admin_web(uuid,text,text,text,text,text,text,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G2 MFA RPC yetkileri yalnız service_role'; END IF;
  IF has_table_privilege('service_role', 'public.auth_mfa_challenges', 'SELECT')
     OR has_table_privilege('service_role', 'public.auth_mfa_test_accounts', 'SELECT')
     OR has_table_privilege('anon', 'public.auth_mfa_challenges', 'SELECT') THEN
    RAISE EXCEPTION 'G3 MFA tablolarına doğrudan erişim olmamalı'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('auth_mfa_begin','auth_mfa_challenge_status','auth_mfa_mark_verified','auth_finalize_login',
         'auth_mfa_set_required','auth_mfa_is_test_account','create_session_admin_web','user_sessions_mfa_guard')
     AND NOT (p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%');
  IF n <> 0 THEN RAISE EXCEPTION 'G4 SECURITY DEFINER + search_path zorunlu (% eksik)', n; END IF;
  -- Test hesabı izin listesi: satır yok → false; satır (süreli) → true.
  IF public.auth_mfa_is_test_account(EXP) THEN RAISE EXCEPTION 'G5 izin listesi boşken false'; END IF;
  INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, expires_at) VALUES (EXP, 'F2-B test', OWNER, now() + interval '1 day');
  IF NOT public.auth_mfa_is_test_account(EXP) THEN RAISE EXCEPTION 'G6 izin listesindeki hesap true'; END IF;
  BEGIN
    INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, expires_at) VALUES (FREE, 'uzun', OWNER, now() + interval '200 days');
    RAISE EXCEPTION 'G7 izin listesi süresi 90 günle sınırlı olmalı';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── H) Migration B: service_role doğrudan INSERT YAPAMAZ (fonksiyonlar çalışır) ─
  IF has_table_privilege('service_role', 'public.user_sessions', 'INSERT') THEN
    RAISE EXCEPTION 'H1 service_role user_sessions INSERT yetkisi kaldırılmalı'; END IF;
  IF NOT has_table_privilege('service_role', 'public.user_sessions', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.user_sessions', 'SELECT') THEN
    RAISE EXCEPTION 'H2 UPDATE/SELECT korunmalı (çıkış/iptal/admin araçları)'; END IF;
  EXECUTE 'SET ROLE service_role';
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active) VALUES (FREE, 'f2b-sr-raw', true);
    RAISE EXCEPTION 'H3 service_role doğrudan INSERT reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  r := pg_temp.v2(FREE, 'f2b-sr-v2');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'H4 service_role → create_session_v2 (definer) çalışmalı: %', r; END IF;
  r := public.create_session_admin_web(ADM2, 'f2b-sr-admin', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'H5 service_role → admin web RPC çalışmalı: %', r; END IF;
  BEGIN
    PERFORM public.auth_mfa_mark_verified(gen_random_uuid(), 'qr_device');
    RAISE EXCEPTION 'H6 service_role doğrulama işareti fonksiyonunu çağıramamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'user_logout' WHERE session_token = 'f2b-sr-v2';
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'session-f2b assert: PASS';
END $$;
