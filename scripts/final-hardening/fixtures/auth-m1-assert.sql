-- M1 (20271001000000) parola + oturum sertleştirme davranış doğrulaması (hata → FAIL).
-- Yerel embedded-pg; prod'a temas YOK. Fixture: auth-fixture.sql + 20270129000000/0100/0200 + M1 (2×).
DO $$
DECLARE
  n int; h text; h2 text; r jsonb;
BEGIN
  -- ── (1) hash_password cost 10 ───────────────────────────────────────────────
  h := public.hash_password('yeni-parola-10');
  IF h NOT LIKE '$2a$10$%' THEN RAISE EXCEPTION 'M1-1 hash_password cost 10 değil (%)', left(h, 7); END IF;
  IF extensions.crypt('yeni-parola-10', h) <> h THEN RAISE EXCEPTION 'M1-1b hash doğrulanamadı'; END IF;

  -- ── (2) progressive rehash (fixture hash cost 4) ─────────────────────────────
  SELECT password_hash INTO h FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001';
  IF h NOT LIKE '$2a$04$%' THEN RAISE EXCEPTION 'M1-2 ön koşul: fixture hash cost 4 olmalı'; END IF;
  -- yanlış parola → invalid + hash DEĞİŞMEZ
  r := public.auth_login_guarded('uzman@test.com', 'yanlis-parola', 'iphash-1');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'M1-2a yanlış parola invalid değil: %', r->>'status'; END IF;
  SELECT password_hash INTO h2 FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001';
  IF h2 <> h THEN RAISE EXCEPTION 'M1-2b yanlış parolada hash değişti'; END IF;
  -- doğru parola → ok + cost 10'a yükseldi + aynı parola hâlâ doğrular
  r := public.auth_login_guarded(' UZMAN@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'M1-2c doğru parola ok değil: %', r->>'status'; END IF;
  SELECT password_hash INTO h2 FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001';
  IF h2 NOT LIKE '$2a$10$%' THEN RAISE EXCEPTION 'M1-2d rehash yapılmadı (%)', left(h2, 7); END IF;
  IF extensions.crypt('dogru-parola-1', h2) <> h2 THEN RAISE EXCEPTION 'M1-2e rehash sonrası parola doğrulanmıyor'; END IF;
  -- ikinci giriş: ok, hash tekrar DEĞİŞMEZ (cost zaten 10)
  r := public.auth_login_guarded('uzman@test.com', 'dogru-parola-1', 'iphash-1');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'M1-2f ikinci giriş ok değil'; END IF;
  SELECT password_hash INTO h FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001';
  IF h <> h2 THEN RAISE EXCEPTION 'M1-2g cost 10 hash gereksiz yeniden yazıldı'; END IF;
  -- yanıt hash/parola taşımaz
  IF r::text ILIKE '%password%' OR r::text LIKE '%$2a$%' THEN RAISE EXCEPTION 'M1-2h yanıt hash/parola alanı içeriyor'; END IF;

  -- ── (3) verify_admin_login hash-only ─────────────────────────────────────────
  IF NOT public.verify_admin_login('admin@test.com', 'admin-parola-1') THEN RAISE EXCEPTION 'M1-3a admin doğru parola false'; END IF;
  IF public.verify_admin_login('admin@test.com', 'yanlis') THEN RAISE EXCEPTION 'M1-3b admin yanlış parola true'; END IF;
  INSERT INTO public.users (id, email, role, active, password, password_hash)
  VALUES ('00000000-0000-0000-0000-0000000000bb', 'nohash-admin@test.com', 'admin', true, NULL, NULL);
  IF public.verify_admin_login('nohash-admin@test.com', '') THEN RAISE EXCEPTION 'M1-3c hash yokken true döndü'; END IF;
  IF public.verify_admin_login('uzman@test.com', 'dogru-parola-1') THEN RAISE EXCEPTION 'M1-3d admin olmayan için true'; END IF;
  DELETE FROM public.users WHERE id = '00000000-0000-0000-0000-0000000000bb';

  -- ── (4) users.password NULL + CHECK ──────────────────────────────────────────
  SELECT count(*) INTO n FROM public.users WHERE password IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'M1-4a düz metin kalan satır: %', n; END IF;
  -- düz-metin-only kullanıcı (fixture plain@test.com) kilitlenmedi: hash ile doğrulanıyor
  SELECT count(*) INTO n FROM public.users
   WHERE email = 'plain@test.com' AND password_hash = extensions.crypt('duz-parola-9', password_hash);
  IF n <> 1 THEN RAISE EXCEPTION 'M1-4b düz-metin-only kullanıcı hash ile doğrulanamıyor'; END IF;
  BEGIN
    UPDATE public.users SET password = 'geri-yaz' WHERE id = '00000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'M1-4c CHECK düz metni engellemedi';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── (5) oturum politikası temizliği ─────────────────────────────────────────
  -- admin oturumu 2 gün önce oluşturuldu → mutlak 24 sa aşıldı → kapatıldı (DELETE yok)
  SELECT count(*) INTO n FROM public.user_sessions
   WHERE session_token = 'tok-admin-active' AND is_active = false AND end_reason = 'expired_policy_cleanup' AND ended_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'M1-5a politika dışı admin oturumu kapatılmadı'; END IF;
  -- uzman oturumu (boşta < 7 gün, expires_at gelecekte) AKTİF kalmalı
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'tok-expert-active' AND is_active = true;
  IF n <> 1 THEN RAISE EXCEPTION 'M1-5b politika içi uzman oturumu kapatılmamalıydı'; END IF;
  -- önceden bitmiş oturum dokunulmadı
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'tok-expert-ended' AND end_reason IS DISTINCT FROM 'expired_policy_cleanup';
  IF n <> 1 THEN RAISE EXCEPTION 'M1-5c zaten bitmiş oturum yeniden işaretlendi'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions;
  IF n <> 3 THEN RAISE EXCEPTION 'M1-5d oturum satırı silindi (%)', n; END IF;

  -- touch_active_session enforce: kapatılan token geçersiz, aktif uzman geçerli
  IF public.touch_active_session('tok-admin-active', 90, 604800, true, 7200, 86400) IS NOT NULL THEN
    RAISE EXCEPTION 'M1-5e kapatılmış admin token hâlâ geçerli';
  END IF;
  IF public.touch_active_session('tok-expert-active', 90, 604800, true, 7200, 86400) IS NULL THEN
    RAISE EXCEPTION 'M1-5f geçerli uzman token reddedildi';
  END IF;

  -- ── (6) EXECUTE grant'ları ───────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.hash_password(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.verify_admin_login(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.auth_login_guarded(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'M1-6 anon/authenticated EXECUTE açık';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.auth_login_guarded(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'M1-6b service_role EXECUTE yok';
  END IF;

  RAISE NOTICE 'M1 assert PASS';
END $$;
