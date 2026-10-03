-- SETTINGS-AUDIT (2026-10-03): /api/settings/change-password akışının GERÇEK SQL kanıtı
-- (yerel embedded-pg; prod'a temas YOK). auth-fixture.sql + 20270129000000/0100/0200 üzerine koşar.
--
-- Route adımları birebir: auth_login_guarded (mevcut parola) → hash_password → users.password_hash
-- UPDATE → user_sessions "mevcut token HARİÇ" pasifleme (end_reason='password_changed').
-- Kanıtlanan: B/C cihazlarının ESKİ token'ı sunucu tarafında (touch_active_session) REDDEDİLİR,
-- mevcut cihaz (A) çalışmaya devam eder, başka kullanıcının oturumu etkilenmez, eski parola
-- artık geçmez, yeni parola geçer. Yanlış mevcut parola hiçbir şeyi değiştirmez.

DO $$
DECLARE
  u5 constant uuid := '00000000-0000-0000-0000-000000000005';
  u1 constant uuid := '00000000-0000-0000-0000-000000000001';
  r jsonb; h text; old_hash text; v uuid; n int;
BEGIN
  INSERT INTO public.user_sessions (user_id, session_token, is_active, created_at, last_seen_at) VALUES
    (u5, 'set-tok-A', true, now(), now()),
    (u5, 'set-tok-B', true, now(), now()),
    (u5, 'set-tok-C', true, now(), now()),
    (u1, 'set-tok-other-user', true, now(), now());
  SELECT password_hash INTO old_hash FROM public.users WHERE id = u5;

  -- 1) Yanlış mevcut parola → invalid; parola ve oturumlar DEĞİŞMEZ.
  r := public.auth_login_guarded('three@test.com', 'yanlis-parola', 'set-ip');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'S1 yanlış mevcut parola invalid olmalı: %', r; END IF;
  IF (SELECT password_hash FROM public.users WHERE id = u5) <> old_hash THEN RAISE EXCEPTION 'S1b parola değişmemeli'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = u5 AND is_active;
  IF n <> 3 THEN RAISE EXCEPTION 'S1c oturumlar etkilenmemeli (aktif=%)', n; END IF;

  -- 2) Doğru mevcut parola → ok + doğru kullanıcı (route: verified.row.id === userId bağlaması).
  r := public.auth_login_guarded('three@test.com', 'y', 'set-ip');
  IF r->>'status' <> 'ok' OR (r->'user'->>'id')::uuid <> u5 THEN RAISE EXCEPTION 'S2 doğru parola ok/u5 olmalı: %', r; END IF;

  -- 3) Yeni hash + UPDATE (Türkçe karakter + boşluk içeren parola).
  h := public.hash_password('Yeni Parola ğüşİ 2026');
  UPDATE public.users SET password_hash = h WHERE id = u5;

  -- 4) Diğer oturumları kapat — route'taki sorgunun SQL karşılığı (A = mevcut token).
  UPDATE public.user_sessions
     SET is_active = false, ended_at = now(), end_reason = 'password_changed'
   WHERE user_id = u5 AND is_active = true AND session_token <> 'set-tok-A';

  -- 5) Eski token'lar sunucuda reddedilir; mevcut cihaz çalışır (enforce=true, prod politikası).
  v := public.touch_active_session('set-tok-B', 60, 604800, true, 7200, 86400);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'S5 B cihazının eski token''ı REDDEDİLMELİ'; END IF;
  v := public.touch_active_session('set-tok-C', 60, 604800, true, 7200, 86400);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'S5b C cihazının eski token''ı REDDEDİLMELİ'; END IF;
  v := public.touch_active_session('set-tok-B', 60, 604800, false, NULL, NULL);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'S5c enforce kapalıyken de pasif token reddedilmeli'; END IF;
  v := public.touch_active_session('set-tok-A', 60, 604800, true, 7200, 86400);
  IF v IS DISTINCT FROM u5 THEN RAISE EXCEPTION 'S5d mevcut cihaz (A) çalışmaya devam etmeli: %', v; END IF;
  v := public.touch_active_session('set-tok-other-user', 60, 604800, true, 7200, 86400);
  IF v IS DISTINCT FROM u1 THEN RAISE EXCEPTION 'S5e başka kullanıcının oturumu etkilenmemeli: %', v; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = u5 AND end_reason = 'password_changed' AND NOT is_active;
  IF n <> 2 THEN RAISE EXCEPTION 'S5f iki oturum password_changed ile kapanmalı (%)', n; END IF;

  -- 6) Eski parola geçmez, yeni parola geçer.
  r := public.auth_login_guarded('three@test.com', 'y', 'set-ip-2');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'S6 eski parola artık geçmemeli: %', r; END IF;
  r := public.auth_login_guarded('three@test.com', 'Yeni Parola ğüşİ 2026', 'set-ip-2');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'S6b yeni parola geçmeli: %', r; END IF;

  RAISE NOTICE 'settings-password-revoke: PASS';
END $$;
