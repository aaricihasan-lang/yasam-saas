-- OTURUM MODELİ v2 davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
CREATE FUNCTION pg_temp.cs(p_user uuid, p_tok text, p_channel text, p_platform text,
                           p_replace text DEFAULT NULL, p_high boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_session_v2(p_user, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    p_platform, p_channel, p_replace, now() + interval '30 days', p_high, true,
    604800, 7200, 86400, 900, 2, 600);
$$;

CREATE FUNCTION pg_temp.touch(p_tok text) RETURNS uuid LANGUAGE sql AS $$
  SELECT public.touch_active_session(p_tok, 90, 604800, true, 7200, 86400);
$$;

DO $$
DECLARE
  ADM constant uuid := '00000000-0000-0000-0000-00000000a001';
  FREE constant uuid := '00000000-0000-0000-0000-00000000e001';
  MOB1 constant uuid := '00000000-0000-0000-0000-00000000e002';
  EXC constant uuid := '00000000-0000-0000-0000-00000000e003';
  EXLIM constant uuid := '00000000-0000-0000-0000-00000000e004';
  MOB2 constant uuid := '00000000-0000-0000-0000-00000000e005';
  OFF constant uuid := '00000000-0000-0000-0000-00000000e006';
  r jsonb; n int; t text; ok boolean; v_id uuid; v_pid uuid;
BEGIN
  -- ── A) Kolonlar + mevcut satırlar ─────────────────────────────────────────
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_state <> 'active';
  IF n <> 0 THEN RAISE EXCEPTION 'A1 mevcut oturumlar active kalmalı (%)', n; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token LIKE 'legacy-%' AND is_active;
  IF n <> 3 THEN RAISE EXCEPTION 'A2 migration mevcut oturumları kapatmamalı (%)', n; END IF;

  -- ── B) Admin Android: tek oturum, ikinci RED, mevcut KORUNUR, süresiz ─────
  r := pg_temp.cs(ADM, 'adm-and-1', 'android_app', 'tablet');
  IF NOT (r->>'inserted')::boolean OR r->>'state' <> 'active' OR r->>'platform' <> 'mobile' THEN
    RAISE EXCEPTION 'B1 ilk admin android aktif olmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-and-1'
     AND expires_at IS NULL AND session_role = 'admin' AND client_channel = 'android_app';
  IF n <> 1 THEN RAISE EXCEPTION 'B2 android expires_at NULL + rol/kanal sabit olmalı'; END IF;
  r := pg_temp.cs(ADM, 'adm-and-2', 'android_app', 'mobile');
  IF (r->>'inserted')::boolean OR r->>'reason' <> 'admin_mobile_active' THEN
    RAISE EXCEPTION 'B3 ikinci admin android REDDEDİLMELİ: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-and-2';
  IF n <> 0 THEN RAISE EXCEPTION 'B4 reddedilen giriş satır üretmemeli'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-and-1' AND is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 mevcut admin android KORUNMALI'; END IF;
  -- Süre muafiyeti: 400 gün önce açılmış + 400 gün boşta → hâlâ geçerli.
  UPDATE public.user_sessions SET created_at = now() - interval '400 days', last_seen_at = now() - interval '400 days'
   WHERE session_token = 'adm-and-1';
  IF pg_temp.touch('adm-and-1') IS DISTINCT FROM ADM THEN RAISE EXCEPTION 'B6 admin android süreden muaf olmalı'; END IF;
  -- Fiziksel garanti: fonksiyon dışı ikinci aktif admin android → unique ihlali.
  BEGIN
    PERFORM set_config('yasam.session_create', 'on', true);
    INSERT INTO public.user_sessions (user_id, session_token, client_channel, session_role, is_active)
    VALUES (ADM, 'adm-and-x', 'android_app', 'admin', true);
    RAISE EXCEPTION 'B7 unique index ikinci aktif admin android satırını ENGELLEMELİ';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM set_config('yasam.session_create', 'off', true);

  -- ── C) Admin web: ilk aktif, ikinci pending, üçüncü RED ───────────────────
  r := pg_temp.cs(ADM, 'adm-web-1', 'desktop_web', 'desktop');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'C1 ilk admin web aktif olmalı: %', r; END IF;
  r := pg_temp.cs(ADM, 'adm-web-2', 'desktop_web', 'desktop');
  IF r->>'state' <> 'pending_approval' THEN RAISE EXCEPTION 'C2 ikinci admin web pending olmalı: %', r; END IF;
  v_pid := (r->>'session_id')::uuid;
  SELECT count(*) INTO n FROM public.user_sessions WHERE id = v_pid AND is_active = false
     AND pending_expires_at BETWEEN now() + interval '9 minutes' AND now() + interval '11 minutes';
  IF n <> 1 THEN RAISE EXCEPTION 'C3 pending kapalı + 10 dk süreli olmalı'; END IF;
  IF pg_temp.touch('adm-web-2') IS NOT NULL THEN RAISE EXCEPTION 'C4 pending token erişim ALAMAMALI'; END IF;
  IF (public.session_pending_status('adm-web-2'))->>'state' <> 'pending' THEN RAISE EXCEPTION 'C5 status pending'; END IF;
  r := pg_temp.cs(ADM, 'adm-web-3', 'mobile_web', 'mobile');
  IF r->>'reason' <> 'admin_web_limit' THEN RAISE EXCEPTION 'C6 1 aktif + 1 pending iken 3. web RED (mobil Chrome dahil): %', r; END IF;

  -- ── D) Onay (Android admin oturumu onaylayabilir) → 2 web aktif ────────────
  r := public.admin_decide_pending_session('adm-and-1', v_pid, 'approve', 2);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D1 android admin onaylayabilmeli: %', r; END IF;
  IF pg_temp.touch('adm-web-2') IS DISTINCT FROM ADM THEN RAISE EXCEPTION 'D2 onaylanan web erişebilmeli'; END IF;
  IF pg_temp.touch('adm-web-1') IS DISTINCT FROM ADM THEN RAISE EXCEPTION 'D3 ilk web açık kalmalı'; END IF;
  IF (public.session_pending_status('adm-web-2'))->>'state' <> 'approved' THEN RAISE EXCEPTION 'D4 status approved'; END IF;
  r := pg_temp.cs(ADM, 'adm-web-4', 'tablet_web', 'tablet');
  IF r->>'reason' <> 'admin_web_limit' THEN RAISE EXCEPTION 'D5 2 onaylı web varken 3. web RED (tablet dahil): %', r; END IF;
  r := public.admin_decide_pending_session('adm-web-2', v_pid, 'approve', 2);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'D6 aynı pending iki kez onaylanamaz'; END IF;

  -- ── E) Ret: pending kapanır, mevcut korunur ───────────────────────────────
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'user_logout'
   WHERE session_token = 'adm-web-2';
  r := pg_temp.cs(ADM, 'adm-web-5', 'desktop_web', 'desktop');
  IF r->>'state' <> 'pending_approval' THEN RAISE EXCEPTION 'E1 pending beklenir: %', r; END IF;
  v_pid := (r->>'session_id')::uuid;
  r := public.admin_decide_pending_session('adm-web-1', v_pid, 'deny', 2);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E2 ret başarısız: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE id = v_pid AND end_reason = 'owner_denied' AND NOT is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'E3 reddedilen pending kapanmalı'; END IF;
  IF (public.session_pending_status('adm-web-5'))->>'state' <> 'denied' THEN RAISE EXCEPTION 'E4 status denied'; END IF;
  IF pg_temp.touch('adm-web-1') IS DISTINCT FROM ADM THEN RAISE EXCEPTION 'E5 mevcut web korunmalı'; END IF;

  -- ── F) Pending süre dolumu ────────────────────────────────────────────────
  r := pg_temp.cs(ADM, 'adm-web-6', 'desktop_web', 'desktop');
  v_pid := (r->>'session_id')::uuid;
  UPDATE public.user_sessions SET pending_expires_at = now() - interval '1 second' WHERE id = v_pid;
  IF (public.session_pending_status('adm-web-6'))->>'state' <> 'expired' THEN RAISE EXCEPTION 'F1 status expired'; END IF;
  r := public.admin_decide_pending_session('adm-web-1', v_pid, 'approve', 2);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'F2 süresi dolan pending onaylanamaz'; END IF;

  -- ── G) Aynı tarayıcı yeniden giriş (replace) → onaysız aktif ───────────────
  r := pg_temp.cs(ADM, 'adm-web-7', 'desktop_web', 'desktop', 'adm-web-1');
  IF r->>'state' <> 'active' OR (r->>'replaced')::int <> 1 THEN RAISE EXCEPTION 'G1 replace onaysız aktif olmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-web-1' AND end_reason = 'replaced_same_device';
  IF n <> 1 THEN RAISE EXCEPTION 'G2 eski token kapanmalı'; END IF;

  -- ── H) Süresi geçmiş web sayılmaz (idle 2 sa) → yeni giriş aktif ───────────
  UPDATE public.user_sessions SET last_seen_at = now() - interval '3 hours' WHERE session_token = 'adm-web-7';
  r := pg_temp.cs(ADM, 'adm-web-8', 'desktop_web', 'desktop');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'H1 süresi geçmiş web onay tetiklememeli: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-web-7' AND end_reason = 'expired_idle';
  IF n <> 1 THEN RAISE EXCEPTION 'H2 idle web expired_idle kapanmalı'; END IF;
  -- Admin web 2 sa idle / 24 sa mutlak AYNEN.
  UPDATE public.user_sessions SET last_seen_at = now() - interval '2 hours 1 minute' WHERE session_token = 'adm-web-8';
  IF pg_temp.touch('adm-web-8') IS NOT NULL THEN RAISE EXCEPTION 'H3 admin web idle 2 sa korunmalı'; END IF;

  -- ── I) Yüksek risk: aktif web yokken de pending ────────────────────────────
  r := pg_temp.cs(ADM, 'adm-web-9', 'desktop_web', 'desktop', NULL, true);
  IF r->>'state' <> 'pending_approval' THEN RAISE EXCEPTION 'I1 riskli web pending olmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'adm-and-1' AND is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'I2 riskli giriş mevcut oturumu KAPATMAMALI'; END IF;

  -- ── J) Kendi oturumunu kapatma (kayıp telefon) → yeni android girebilir ────
  r := public.admin_decide_pending_session('adm-and-1', (SELECT id FROM public.user_sessions WHERE session_token='adm-web-9'), 'approve', 2);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'J0 onay: %', r; END IF;
  SELECT id INTO v_id FROM public.user_sessions WHERE session_token = 'adm-and-1';
  r := public.revoke_own_session('adm-web-9', v_id);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'J1 kendi android oturumunu kapatabilmeli: %', r; END IF;
  IF pg_temp.touch('adm-and-1') IS NOT NULL THEN RAISE EXCEPTION 'J2 kapatılan android erişememeli'; END IF;
  r := pg_temp.cs(ADM, 'adm-and-3', 'android_app', 'mobile');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'J3 yeni telefon girebilmeli: %', r; END IF;
  SELECT id INTO v_id FROM public.user_sessions WHERE session_token = 'legacy-web-1';
  r := public.revoke_own_session('adm-web-9', v_id);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'J4 başkasının oturumu kapatılamamalı'; END IF;

  -- ── K) Uzman mobil=1: Android (tablet dahil) mobil sayılır; eski KORUNUR ─────
  r := pg_temp.cs(MOB1, 'm1-and-1', 'android_app', 'tablet');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'K1 uzman android aktif: %', r; END IF;
  r := pg_temp.cs(MOB1, 'm1-and-2', 'android_app', 'mobile');
  IF r->>'reason' <> 'device_limit' THEN RAISE EXCEPTION 'K2 mobil limit=1 ikinci android RED: %', r; END IF;
  r := pg_temp.cs(MOB1, 'm1-mweb-1', 'mobile_web', 'mobile');
  IF r->>'reason' <> 'device_limit' THEN RAISE EXCEPTION 'K3 mobil Chrome da mobil limitine sayılır: %', r; END IF;
  UPDATE public.user_sessions SET last_seen_at = now() - interval '9 days' WHERE session_token = 'm1-and-1';
  r := pg_temp.cs(MOB1, 'm1-web-1', 'desktop_web', 'desktop');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'K4 masaüstü aktif: %', r; END IF;
  IF pg_temp.touch('m1-and-1') IS DISTINCT FROM MOB1 THEN RAISE EXCEPTION 'K5 uzman android 9 gün boşta GEÇERLİ (stale/idle yok)'; END IF;
  -- Uzman web 15 dk stale (yalnız yeni girişte) + 7 gün idle aynen.
  UPDATE public.user_sessions SET last_seen_at = now() - interval '20 minutes' WHERE session_token = 'm1-web-1';
  r := pg_temp.cs(MOB1, 'm1-web-2', 'desktop_web', 'desktop');
  IF (r->>'stale_closed')::int <> 1 THEN RAISE EXCEPTION 'K6 uzman web stale temizliği korunmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'm1-and-1' AND is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'K7 stale android oturumuna DOKUNMAMALI'; END IF;
  UPDATE public.user_sessions SET last_seen_at = now() - interval '7 days 1 minute' WHERE session_token = 'm1-web-2';
  IF pg_temp.touch('m1-web-2') IS NOT NULL THEN RAISE EXCEPTION 'K8 uzman web idle 7 gün korunmalı'; END IF;

  -- ── L) Uzman mobil=2: iki android, üçüncü RED ─────────────────────────────
  r := pg_temp.cs(MOB2, 'm2-and-1', 'android_app', 'mobile');
  r := pg_temp.cs(MOB2, 'm2-and-2', 'android_app', 'tablet');
  IF r->>'state' <> 'active' THEN RAISE EXCEPTION 'L1 ikinci android (limit 2) aktif: %', r; END IF;
  r := pg_temp.cs(MOB2, 'm2-and-3', 'android_app', 'mobile');
  IF r->>'reason' <> 'device_limit' THEN RAISE EXCEPTION 'L2 üçüncü android RED: %', r; END IF;

  -- ── M) security_exempt limitleri ATLAMAZ ──────────────────────────────────
  r := pg_temp.cs(EXLIM, 'exlim-web-1', 'desktop_web', 'desktop');
  IF r->>'reason' <> 'device_forbidden' THEN RAISE EXCEPTION 'M1 exempt limit atlamamalı: %', r; END IF;

  -- ── N) TEMPORARY TEST ACCOUNT EXCEPTION ───────────────────────────────────
  r := pg_temp.cs(EXC, 'exc-web-0', 'desktop_web', 'desktop');
  IF r->>'reason' <> 'device_forbidden' THEN RAISE EXCEPTION 'N0 istisnasız 1/0/0/0/0 kilitlenir: %', r; END IF;
  INSERT INTO public.session_limit_exceptions (user_id, reason, expires_at, created_by)
  VALUES (EXC, 'satış öncesi test hesabı', '2026-12-31T23:59:59+03:00', 'harness');
  UPDATE public.user_sessions SET last_seen_at = now() - interval '1 hour' WHERE session_token LIKE 'legacy-exc-%';
  r := pg_temp.cs(EXC, 'exc-web-1', 'desktop_web', 'desktop');
  IF r->>'state' <> 'active' OR NOT (r->>'exception_used')::boolean THEN RAISE EXCEPTION 'N1 istisna kilitlenmeyi önlemeli: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token LIKE 'legacy-exc-%' AND is_active;
  IF n <> 2 THEN RAISE EXCEPTION 'N2 istisna hesabın mevcut oturumları (stale) kapanmamalı (%)', n; END IF;
  UPDATE public.users SET active = false WHERE id = EXC;
  r := pg_temp.cs(EXC, 'exc-web-2', 'desktop_web', 'desktop');
  IF r->>'reason' <> 'inactive' THEN RAISE EXCEPTION 'N3 istisna active kontrolünü ATLAMAMALI: %', r; END IF;
  UPDATE public.users SET active = true WHERE id = EXC;
  UPDATE public.session_limit_exceptions SET expires_at = now() - interval '1 second' WHERE user_id = EXC;
  r := pg_temp.cs(EXC, 'exc-web-3', 'desktop_web', 'desktop');
  IF r->>'reason' <> 'device_forbidden' THEN RAISE EXCEPTION 'N4 süresi dolan istisna uygulanmamalı: %', r; END IF;
  BEGIN
    UPDATE public.session_limit_exceptions SET expires_at = '2027-01-01T00:00:00+03:00' WHERE user_id = EXC;
    RAISE EXCEPTION 'N5 2026-12-31 sonrası istisna CHECK ile reddedilmeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Hesap silinirse istisna CASCADE.
  DELETE FROM public.users WHERE id = EXC;
  SELECT count(*) INTO n FROM public.session_limit_exceptions WHERE user_id = EXC;
  IF n <> 0 THEN RAISE EXCEPTION 'N6 ON DELETE CASCADE'; END IF;

  -- ── O) Pasif kullanıcı ────────────────────────────────────────────────────
  r := pg_temp.cs(OFF, 'off-1', 'desktop_web', 'desktop');
  IF r->>'reason' <> 'inactive' THEN RAISE EXCEPTION 'O1 pasif kullanıcı RED: %', r; END IF;

  -- ── P) Değişmezlik ────────────────────────────────────────────────────────
  BEGIN
    UPDATE public.user_sessions SET client_channel = 'android_app' WHERE session_token = 'adm-web-9';
    RAISE EXCEPTION 'P1 web → android_app yükseltme ENGELLENMELİ';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_sessions SET client_channel = 'android_app' WHERE session_token = 'legacy-web-1';
    RAISE EXCEPTION 'P2 NULL → android_app ENGELLENMELİ';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.user_sessions SET client_channel = 'desktop_web' WHERE session_token = 'legacy-web-1';  -- eski kod uyumu
  BEGIN
    UPDATE public.user_sessions SET client_channel = 'mobile_web' WHERE session_token = 'legacy-web-1';
    RAISE EXCEPTION 'P3 kanal bir kez yazıldıktan sonra değişmemeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_sessions SET session_role = 'expert' WHERE session_token = 'adm-web-9';
    RAISE EXCEPTION 'P4 session_role değişmemeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_sessions SET is_active = true WHERE session_token = 'adm-web-1';
    RAISE EXCEPTION 'P5 kapalı oturum yeniden açılmamalı';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, client_channel) VALUES (FREE, 'direct-and', 'android_app');
    RAISE EXCEPTION 'P6 fonksiyon dışı android_app INSERT ENGELLENMELİ';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  r := pg_temp.cs(ADM, 'adm-web-10', 'desktop_web', 'desktop');
  IF r->>'state' <> 'pending_approval' THEN RAISE EXCEPTION 'P7 setup pending: %', r; END IF;
  BEGIN
    UPDATE public.user_sessions SET is_active = true, session_state = 'active' WHERE session_token = 'adm-web-10';
    RAISE EXCEPTION 'P8 pending doğrudan aktifleştirilememeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_sessions SET expires_at = now() + interval '1 day' WHERE session_token = 'adm-and-3';
    RAISE EXCEPTION 'P9 android expires_at değişmemeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── Q) Yetkiler ───────────────────────────────────────────────────────────
  FOREACH t IN ARRAY ARRAY[
    'public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)',
    'public.admin_decide_pending_session(text,uuid,text,integer)',
    'public.session_pending_status(text)',
    'public.revoke_own_session(text,uuid)',
    'public.touch_active_session(text,integer,integer,boolean,integer,integer)'] LOOP
    IF has_function_privilege('anon', t, 'EXECUTE') OR has_function_privilege('authenticated', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'Q1 anon/authenticated EXECUTE açık: %', t;
    END IF;
    IF NOT has_function_privilege('service_role', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'Q2 service_role EXECUTE yok: %', t;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.session_limit_exceptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.session_limit_exceptions', 'INSERT') THEN
    RAISE EXCEPTION 'Q3 istisna tablosu anon/auth erişimi açık';
  END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('create_session_v2','admin_decide_pending_session','session_pending_status','revoke_own_session','touch_active_session')
     AND p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=""%';
  IF n <> 5 THEN RAISE EXCEPTION 'Q4 SECURITY DEFINER + search_path='''' (5) — bulunan %', n; END IF;

  -- ── R) Audit action CHECK süperseti ───────────────────────────────────────
  INSERT INTO public.admin_audit_log (actor_admin_id, action) VALUES (ADM, 'admin_web_login_pending');
  INSERT INTO public.admin_audit_log (actor_admin_id, action) VALUES (ADM, 'own_session_terminated');
  INSERT INTO public.admin_audit_log (actor_admin_id, action) VALUES (ADM, 'user_created');
  BEGIN
    INSERT INTO public.admin_audit_log (actor_admin_id, action) VALUES (ADM, 'bogus_action');
    RAISE EXCEPTION 'R1 bilinmeyen action reddedilmeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
