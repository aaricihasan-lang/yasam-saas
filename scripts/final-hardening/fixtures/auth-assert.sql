-- PAKET AUTH migration davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
DO $$
DECLARE
  n int; t text;
BEGIN
  -- ── 0100 (a) backfill: hash yazıldı (btrim), düz metin NULL'LANMADI ─────────
  SELECT count(*) INTO n FROM public.users
   WHERE email = 'plain@test.com' AND password = '  duz-parola-9  '
     AND password_hash = extensions.crypt('duz-parola-9', password_hash);
  IF n <> 1 THEN RAISE EXCEPTION 'A1 backfill/plaintext korunumu başarısız (%)', n; END IF;
  SELECT count(*) INTO n FROM public.users WHERE email LIKE 'Uzman%' AND password = 'eskiduz';
  IF n <> 1 THEN RAISE EXCEPTION 'A2 hash sahibi kullanıcının düz metni değişmemeli'; END IF;

  -- ── 0100 (b) login_user hash-only ─────────────────────────────────────────
  SELECT count(*) INTO n FROM public.login_user(' UZMAN@test.com', 'dogru-parola-1');
  IF n <> 1 THEN RAISE EXCEPTION 'B1 login_user doğru hash girişi başarısız'; END IF;
  SELECT count(*) INTO n FROM public.login_user('uzman@test.com', 'eskiduz');
  IF n <> 0 THEN RAISE EXCEPTION 'B2 login_user düz metin (hash varken) kabul etmemeli'; END IF;
  INSERT INTO public.users (id, email, role, active, password, password_hash)
  VALUES ('00000000-0000-0000-0000-0000000000aa', 'nohash@test.com', 'expert', true, 'duz', NULL);
  SELECT count(*) INTO n FROM public.login_user('nohash@test.com', 'duz');
  IF n <> 0 THEN RAISE EXCEPTION 'B3 login_user düz metin fallback KALDIRILMALI'; END IF;

  -- ── (c) EXECUTE grant'ları ────────────────────────────────────────────────
  FOREACH t IN ARRAY ARRAY['public.login_user(text,text)','public.verify_admin_login(text,text)',
    'public.hash_password(text)','public.dogaltas_normalize_name(text)','public.hacamat_rules_identity_guard()',
    'public.auth_login_guarded(text,text,text)','public.auth_login_throttle_bump(text,text,timestamptz)',
    'public.touch_active_session(text,integer,integer,boolean,integer,integer)'] LOOP
    IF has_function_privilege('anon', t, 'EXECUTE') OR has_function_privilege('authenticated', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'C1 anon/authenticated EXECUTE açık: %', t;
    END IF;
    IF NOT has_function_privilege('service_role', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'C2 service_role EXECUTE yok: %', t;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.auth_login_throttle', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_login_throttle', 'INSERT') THEN
    RAISE EXCEPTION 'C3 auth_login_throttle anon/auth erişimi açık';
  END IF;
  SELECT count(*) INTO n FROM pg_class WHERE oid = 'public.auth_login_throttle'::regclass AND relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'C4 auth_login_throttle RLS kapalı'; END IF;
END $$;

-- Trigger fonksiyonu EXECUTE revoke sonrası authenticated rolüyle hâlâ ateşlenir.
SET ROLE authenticated;
UPDATE public.hacamat_rules SET title = 'Kural 2';
DO $$ BEGIN
  BEGIN
    UPDATE public.hacamat_rules SET tenant_id = '10000000-0000-0000-0000-000000000009';
    RAISE EXCEPTION 'C5 identity guard çalışmadı';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
-- SECURITY DEFINER RPC içinden dogaltas_normalize_name (owner yetkisi) anon çağrısında çalışır.
SET ROLE anon;
DO $$ BEGIN
  IF public.fixture_definer_uses_normalize('  İSTANBUL  Taşı ') <> 'istanbul tasi' THEN
    RAISE EXCEPTION 'C6 SECURITY DEFINER üzerinden normalize çalışmadı';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  r jsonb; n int; i int;
BEGIN
  -- ── 0000 auth_login_guarded ────────────────────────────────────────────────
  r := public.auth_login_guarded(' Uzman@Test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'ok' OR r->'user'->>'id' <> '00000000-0000-0000-0000-000000000001'
     OR (r->'user') ? 'password_hash' OR (r->'user'->>'approval_status') <> 'approved'
     OR (r->'user'->>'tenant_id') <> '10000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'D1 doğru giriş ok/gating satırı hatalı: %', r;
  END IF;
  r := public.auth_login_guarded('plain@test.com', 'duz-parola-9', 'iphash-1');
  IF r->>'status' <> 'ok' OR (r->'user'->>'approval_status') <> 'pending' THEN
    RAISE EXCEPTION 'D2 pending kullanıcı satır dönmeli (filtre YOK): %', r;
  END IF;
  r := public.auth_login_guarded('nohash@test.com', 'duz', 'iphash-1');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'D3 hash yoksa düz metin reddedilmeli: %', r; END IF;

  FOR i IN 1..4 LOOP
    r := public.auth_login_guarded('uzman@test.com', 'yanlis', 'iphash-1');
    IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'D4 % hata invalid olmalı: %', i, r; END IF;
  END LOOP;
  r := public.auth_login_guarded('uzman@test.com', 'yanlis', 'iphash-1');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'D5 5. hata invalid dönmeli: %', r; END IF;
  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'locked' OR (r->>'retry_after')::int NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'D6 kilitliyken DOĞRU parola reddedilmeli (locked ~60sn): %', r;
  END IF;
  SELECT count(*) INTO n FROM public.security_events WHERE event_type = 'login_locked'
    AND user_id = '00000000-0000-0000-0000-000000000001';
  IF n < 1 THEN RAISE EXCEPTION 'D7 login_locked güvenlik olayı yazılmadı'; END IF;

  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-2');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'D8 farklı IP doğru giriş ok olmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_login_throttle
   WHERE key = 'e:' || encode(extensions.digest('uzman@test.com', 'sha256'), 'hex');
  IF n <> 0 THEN RAISE EXCEPTION 'D9 başarı email sayacını sıfırlamalı'; END IF;
  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'D10 ip1 email_ip kilidi sürmeli: %', r; END IF;

  FOR i IN 6..10 LOOP
    UPDATE public.auth_login_throttle SET locked_until = NULL WHERE scope = 'email_ip';
    r := public.auth_login_guarded('uzman@test.com', 'yanlis', 'iphash-1');
  END LOOP;
  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'locked' OR (r->>'retry_after')::int NOT BETWEEN 800 AND 900 THEN
    RAISE EXCEPTION 'D11 10. hata → 15 dk kilit bekleniyordu: %', r;
  END IF;
  FOR i IN 11..20 LOOP
    UPDATE public.auth_login_throttle SET locked_until = NULL WHERE scope = 'email_ip';
    r := public.auth_login_guarded('uzman@test.com', 'yanlis', 'iphash-1');
  END LOOP;
  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'locked' OR (r->>'retry_after')::int NOT BETWEEN 3500 AND 3600 THEN
    RAISE EXCEPTION 'D12 20. hata → 60 dk kilit bekleniyordu: %', r;
  END IF;

  FOR i IN 1..29 LOOP
    r := public.auth_login_guarded('yok@test.com', 'x', 'iphash-' || (100 + i));
    IF r->>'status' <> 'invalid' OR r ? 'user' THEN RAISE EXCEPTION 'D13 yok e-posta invalid olmalı: %', r; END IF;
  END LOOP;
  r := public.auth_login_guarded('yok@test.com', 'x', 'iphash-200');
  r := public.auth_login_guarded('yok@test.com', 'x', 'iphash-201');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'D14 yok e-posta 30 hata → kilit: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_login_throttle WHERE key LIKE '%@%' OR key LIKE '%yok%';
  IF n <> 0 THEN RAISE EXCEPTION 'D15 sayaç anahtarlarında ham e-posta var'; END IF;

  FOR i IN 1..50 LOOP
    r := public.auth_login_guarded('rastgele' || i || '@test.com', 'x', 'iphash-bot');
  END LOOP;
  r := public.auth_login_guarded('three@test.com', 'y', 'iphash-bot');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'D16 IP kilidi bekleniyordu: %', r; END IF;
  r := public.auth_login_guarded('three@test.com', 'y', 'iphash-temiz');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'D17 temiz IP ok olmalı: %', r; END IF;

  UPDATE public.auth_login_throttle SET window_start = now() - interval '2 hours', locked_until = NULL, fail_count = 19
   WHERE scope = 'email_ip' AND key LIKE 'ei:%iphash-1';
  r := public.auth_login_guarded('uzman@test.com', 'yanlis', 'iphash-1');
  SELECT fail_count INTO n FROM public.auth_login_throttle WHERE scope = 'email_ip' AND key LIKE 'ei:%iphash-1';
  IF n <> 1 THEN RAISE EXCEPTION 'D18 pencere sıfırlama başarısız (fail_count=%)', n; END IF;

  r := public.auth_login_guarded('', 'x', 'iphash-1');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'D19 boş e-posta invalid'; END IF;
END $$;

DO $$
DECLARE
  v uuid; n int; ts timestamptz; reason text;
BEGIN
  -- ── 0200 backfill ─────────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM public.user_sessions
   WHERE is_active AND (expires_at IS NULL OR expires_at < now() + interval '13 days' OR last_seen_at < now() - interval '1 minute');
  IF n <> 0 THEN RAISE EXCEPTION 'E1 aktif oturum backfill başarısız (%)', n; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE NOT is_active AND expires_at IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'E2 pasif oturumlara dokunulmamalı'; END IF;
  INSERT INTO public.user_sessions (user_id, session_token) VALUES ('00000000-0000-0000-0000-000000000005', 'tok-new');
  SELECT expires_at INTO ts FROM public.user_sessions WHERE session_token = 'tok-new';
  IF ts IS NULL OR ts < now() + interval '29 days' THEN RAISE EXCEPTION 'E3 yeni oturum varsayılan expires_at +30g değil'; END IF;

  SELECT count(*) INTO n FROM public.users WHERE allowed_locations IS NULL OR allowed_locations = 1;
  IF n <> 0 THEN RAISE EXCEPTION 'E4 NULL/1 → 2 yapılmadı'; END IF;
  SELECT count(*) INTO n FROM public.users WHERE (email = 'zero@test.com' AND allowed_locations = 0)
    OR (email = 'three@test.com' AND allowed_locations = 3) OR (email = 'admin@test.com' AND allowed_locations = 999);
  IF n <> 3 THEN RAISE EXCEPTION 'E5 0/3/999 korunmalı (%)', n; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'users' AND column_name = 'allowed_locations' AND column_default = '2';
  IF n <> 1 THEN RAISE EXCEPTION 'E6 allowed_locations default 2 değil'; END IF;

  -- ── touch_active_session ──────────────────────────────────────────────────
  v := public.touch_active_session('tok-expert-ended', 90, 604800, false);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'T1 pasif token null dönmeli'; END IF;
  v := public.touch_active_session('yok', 90, 604800, false);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'T2 bilinmeyen token null'; END IF;

  UPDATE public.user_sessions SET last_seen_at = now() - interval '30 seconds' WHERE session_token = 'tok-expert-active';
  v := public.touch_active_session('tok-expert-active', 90, 604800, false);
  SELECT last_seen_at INTO ts FROM public.user_sessions WHERE session_token = 'tok-expert-active';
  IF v IS DISTINCT FROM '00000000-0000-0000-0000-000000000001' OR ts <> now() - interval '30 seconds' THEN
    RAISE EXCEPTION 'T3 throttle penceresinde yazılmamalı';
  END IF;

  UPDATE public.user_sessions SET last_seen_at = now() - interval '10 days', expires_at = now() - interval '1 day'
   WHERE session_token = 'tok-expert-active';
  v := public.touch_active_session('tok-expert-active', 90, 604800, false);
  SELECT last_seen_at INTO ts FROM public.user_sessions WHERE session_token = 'tok-expert-active' AND is_active;
  IF v IS NULL OR ts <> now() THEN RAISE EXCEPTION 'T4 R1 enforce kapalı: sonlandırmamalı + touch etmeli'; END IF;

  v := public.touch_active_session('tok-expert-active', 90, 604800, true);
  SELECT end_reason INTO reason FROM public.user_sessions WHERE session_token = 'tok-expert-active' AND NOT is_active;
  IF v IS NOT NULL OR reason IS DISTINCT FROM 'expired_absolute' THEN RAISE EXCEPTION 'T5 expired_absolute bekleniyordu (%)', reason; END IF;

  INSERT INTO public.user_sessions (user_id, session_token, last_seen_at)
  VALUES ('00000000-0000-0000-0000-000000000005', 'tok-idle', now() - interval '8 days');
  v := public.touch_active_session('tok-idle', 90, 604800, true, 7200, 86400);
  SELECT end_reason INTO reason FROM public.user_sessions WHERE session_token = 'tok-idle';
  IF v IS NOT NULL OR reason IS DISTINCT FROM 'expired_idle' THEN RAISE EXCEPTION 'T6 expired_idle bekleniyordu (%)', reason; END IF;

  v := public.touch_active_session('tok-admin-active', 90, 604800, true, 7200, 86400);
  SELECT end_reason INTO reason FROM public.user_sessions WHERE session_token = 'tok-admin-active';
  IF v IS NOT NULL OR reason IS DISTINCT FROM 'expired_absolute' THEN RAISE EXCEPTION 'T7 admin 24s mutlak bekleniyordu (%)', reason; END IF;

  v := public.touch_active_session('tok-new', 90, 604800, true, 7200, 86400);
  IF v IS DISTINCT FROM '00000000-0000-0000-0000-000000000005' THEN RAISE EXCEPTION 'T8 geçerli oturum user_id dönmeli'; END IF;
END $$;
