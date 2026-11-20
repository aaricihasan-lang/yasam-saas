-- GİRİŞ GÜVENLİĞİ F2-A davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
-- Zincir (fixture): session-model-fixture + session-f2a-fixture → 20270129000200 → 20271003200000 →
--         20271003200100 → session-f2a-legacy-seed (ESKİ RPC) ; migration: 20280103000000 (iki kez).

-- Yeni kod çağrısı: android dahil her kanal için çağıranın verdiği expires_at.
CREATE FUNCTION pg_temp.cs_exp(p_user uuid, p_tok text, p_channel text, p_platform text, p_expires timestamptz)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_session_v2(p_user, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    p_platform, p_channel, NULL, p_expires, false, true,
    604800, 7200, 86400, 900, 2, 600);
$$;

CREATE FUNCTION pg_temp.touch(p_tok text) RETURNS uuid LANGUAGE sql AS $$
  SELECT public.touch_active_session(p_tok, 90, 604800, true, 7200, 86400);
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  SAEXP constant uuid := '00000000-0000-0000-0000-00000000e0f1';
  ADMOFF constant uuid := '00000000-0000-0000-0000-00000000a003';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  FREE  constant uuid := '00000000-0000-0000-0000-00000000e001';
  r jsonb; n int; t text; v_exp timestamptz; v_hash text;
BEGIN
  -- ── A) token_hash (D-02 aşama 1) ──────────────────────────────────────────
  SELECT count(*) INTO n FROM public.user_sessions
   WHERE token_hash IS DISTINCT FROM encode(sha256(convert_to(session_token, 'UTF8')), 'hex');
  IF n <> 0 THEN RAISE EXCEPTION 'A1 mevcut tüm satırlarda token_hash = sha256(session_token) olmalı (% hatalı)', n; END IF;
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_user_sessions_token_hash'
     AND indexdef ILIKE '%UNIQUE%';
  IF n <> 1 THEN RAISE EXCEPTION 'A2 token_hash UNIQUE index olmalı'; END IF;
  r := pg_temp.cs_exp(FREE, 'f2a-web-1', 'desktop_web', 'desktop', now() + interval '30 days');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'A3 uzman web oturumu açılmalı: %', r; END IF;
  SELECT token_hash INTO v_hash FROM public.user_sessions WHERE session_token = 'f2a-web-1';
  IF v_hash IS DISTINCT FROM encode(sha256(convert_to('f2a-web-1', 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'A4 yeni oturumda token_hash trigger ile dolmalı'; END IF;
  IF v_hash = 'f2a-web-1' OR length(v_hash) <> 64 THEN RAISE EXCEPTION 'A5 token_hash düz token olmamalı (64 hex)'; END IF;

  -- ── B) Yeni model android oturumu süreli (D-01) ───────────────────────────
  r := pg_temp.cs_exp(EXP, 'f2a-and-new', 'android_app', 'mobile', now() + interval '30 days');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'B1 uzman android açılmalı: %', r; END IF;
  SELECT expires_at INTO v_exp FROM public.user_sessions WHERE session_token = 'f2a-and-new';
  IF v_exp IS NULL OR v_exp < now() + interval '29 days' OR v_exp > now() + interval '31 days' THEN
    RAISE EXCEPTION 'B2 yeni android expires_at ≈ 30 gün olmalı (%)', v_exp; END IF;
  IF pg_temp.touch('f2a-and-new') IS DISTINCT FROM EXP THEN RAISE EXCEPTION 'B3 taze android geçerli olmalı'; END IF;
  -- Boşta 8 gün (uzman idle 7 gün) → kapanır (admin web 2 sa kuralı DEĞİL).
  UPDATE public.user_sessions SET last_seen_at = now() - interval '8 days' WHERE session_token = 'f2a-and-new';
  IF pg_temp.touch('f2a-and-new') IS NOT NULL THEN RAISE EXCEPTION 'B4 7 günden uzun boşta android → NULL'; END IF;
  SELECT end_reason INTO t FROM public.user_sessions WHERE session_token = 'f2a-and-new' AND NOT is_active;
  IF t IS DISTINCT FROM 'expired_idle' THEN RAISE EXCEPTION 'B5 end_reason expired_idle olmalı (%)', t; END IF;
  -- Mutlak süre: expires_at geçmiş → kapanır.
  r := pg_temp.cs_exp(EXP, 'f2a-and-abs', 'android_app', 'mobile', now() - interval '1 minute');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'B6 android açılmalı: %', r; END IF;
  IF pg_temp.touch('f2a-and-abs') IS NOT NULL THEN RAISE EXCEPTION 'B7 expires_at geçmiş android → NULL'; END IF;
  SELECT end_reason INTO t FROM public.user_sessions WHERE session_token = 'f2a-and-abs';
  IF t IS DISTINCT FROM 'expired_absolute' THEN RAISE EXCEPTION 'B8 end_reason expired_absolute olmalı (%)', t; END IF;

  -- ── C) Eski süresiz android oturumu DOKUNULMADAN geçerli (habersiz çıkış YOK) ─
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2a-legacy-android'
     AND is_active AND expires_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'C1 migration eski android oturumunu kapatmamalı / süre yazmamalı'; END IF;
  IF pg_temp.touch('f2a-legacy-android') IS DISTINCT FROM EXP THEN
    RAISE EXCEPTION 'C2 eski süresiz android (400 gün boşta) hâlâ geçerli olmalı'; END IF;
  -- Eski kod (android için p_expires_at NULL) → davranış eskisiyle aynı: süresiz.
  r := pg_temp.cs_exp(OWNER, 'f2a-oldcode-adm-and', 'android_app', 'mobile', NULL);
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'C3 eski kod çağrısı (NULL) çalışmalı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2a-oldcode-adm-and' AND expires_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'C4 eski kod çağrısında expires_at NULL kalmalı (geriye uyum)'; END IF;
  -- android expires_at'i sonradan değiştirmek hâlâ YASAK (trigger korunuyor).
  BEGIN
    UPDATE public.user_sessions SET expires_at = now() + interval '1 day' WHERE session_token = 'f2a-oldcode-adm-and';
    RAISE EXCEPTION 'C5 android expires_at UPDATE reddedilmeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Owner android oturumunu sonraki adım için kapat (fonksiyon dışı kapatma serbest).
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'test_close'
   WHERE session_token = 'f2a-oldcode-adm-and';

  -- ── D) Süresi dolmuş admin android oturumu tek yuvayı KİLİTLEMEZ ─────────
  r := pg_temp.cs_exp(OWNER, 'f2a-adm-and-old', 'android_app', 'mobile', now() - interval '1 minute');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'D1 admin android açılmalı: %', r; END IF;
  r := pg_temp.cs_exp(OWNER, 'f2a-adm-and-new', 'android_app', 'mobile', now() + interval '30 days');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'D2 süresi dolmuş android temizlenip yeni giriş kabul edilmeli: %', r; END IF;
  SELECT end_reason INTO t FROM public.user_sessions WHERE session_token = 'f2a-adm-and-old';
  IF t IS DISTINCT FROM 'expired_absolute' THEN RAISE EXCEPTION 'D3 eski admin android expired_absolute olmalı (%)', t; END IF;
  -- Geçerli admin android varken ikinci RED kuralı korunur.
  r := pg_temp.cs_exp(OWNER, 'f2a-adm-and-3', 'android_app', 'mobile', now() + interval '30 days');
  IF (r->>'inserted')::boolean OR r->>'reason' <> 'admin_mobile_active' THEN
    RAISE EXCEPTION 'D4 geçerli admin android varken ikinci REDDEDİLMELİ: %', r; END IF;
  -- Admin android'e admin WEB 24 sa / 2 sa kuralı uygulanmaz (3 saat boşta, 2 gün önce açılmış).
  UPDATE public.user_sessions SET last_seen_at = now() - interval '3 hours', created_at = now() - interval '2 days'
   WHERE session_token = 'f2a-adm-and-new';
  IF pg_temp.touch('f2a-adm-and-new') IS DISTINCT FROM OWNER THEN
    RAISE EXCEPTION 'D5 admin android: admin web 2 sa/24 sa kuralı uygulanmamalı'; END IF;

  -- ── E) Admin web kuralları DEĞİŞMEDİ ──────────────────────────────────────
  r := pg_temp.cs_exp(ADM2, 'f2a-adm2-web', 'desktop_web', 'desktop', now() + interval '1 day');
  IF NOT (r->>'inserted')::boolean OR r->>'state' <> 'active' THEN RAISE EXCEPTION 'E1 admin2 web aktif: %', r; END IF;
  UPDATE public.user_sessions SET last_seen_at = now() - interval '3 hours' WHERE session_token = 'f2a-adm2-web';
  IF pg_temp.touch('f2a-adm2-web') IS NOT NULL THEN RAISE EXCEPTION 'E2 admin web 2 sa idle kuralı korunmalı'; END IF;

  -- ── F) Pasif kullanıcının oturumu geçersiz (D-06) ─────────────────────────
  r := pg_temp.cs_exp(SAEXP, 'f2a-inactive', 'desktop_web', 'desktop', now() + interval '30 days');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'F1 oturum açılmalı: %', r; END IF;
  IF pg_temp.touch('f2a-inactive') IS DISTINCT FROM SAEXP THEN RAISE EXCEPTION 'F2 aktif kullanıcı geçerli'; END IF;
  UPDATE public.users SET active = false WHERE id = SAEXP;
  IF pg_temp.touch('f2a-inactive') IS NOT NULL THEN RAISE EXCEPTION 'F3 pasif kullanıcı oturumu NULL olmalı'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2a-inactive' AND is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'F4 touch pasif kullanıcı için oturum satırını DEĞİŞTİRMEMELİ'; END IF;
  UPDATE public.users SET active = true WHERE id = SAEXP;

  -- ── G) auth_is_owner_admin (D-10) ─────────────────────────────────────────
  IF public.auth_is_owner_admin(OWNER) IS NOT TRUE THEN RAISE EXCEPTION 'G1 Owner true olmalı'; END IF;
  IF public.auth_is_owner_admin(ADM2) IS NOT FALSE THEN RAISE EXCEPTION 'G2 Owner olmayan admin false'; END IF;
  IF public.auth_is_owner_admin(SAEXP) IS NOT FALSE THEN RAISE EXCEPTION 'G3 bayraklı ama uzman false'; END IF;
  IF public.auth_is_owner_admin(ADMOFF) IS NOT FALSE THEN RAISE EXCEPTION 'G4 pasif Owner adayı false'; END IF;
  IF public.auth_is_owner_admin(NULL) IS NOT FALSE THEN RAISE EXCEPTION 'G5 NULL false'; END IF;
  IF public.auth_is_owner_admin('00000000-0000-0000-0000-0000000000ff') IS NOT FALSE THEN RAISE EXCEPTION 'G6 yok false'; END IF;

  -- ── H) Yetkiler ───────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.auth_is_owner_admin(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_is_owner_admin(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.auth_is_owner_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H1 auth_is_owner_admin yalnız service_role'; END IF;
  IF has_function_privilege('anon', 'public.touch_active_session(text,integer,integer,boolean,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.touch_active_session(text,integer,integer,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H2 touch_active_session yalnız service_role'; END IF;
  IF has_function_privilege('anon', 'public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H3 create_session_v2 yalnız service_role'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('touch_active_session', 'create_session_v2', 'auth_is_owner_admin')
     AND NOT (p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%');
  IF n <> 0 THEN RAISE EXCEPTION 'H4 SECURITY DEFINER + search_path zorunlu (% eksik)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('touch_active_session', 'create_session_v2');
  IF n <> 2 THEN RAISE EXCEPTION 'H5 imza değişmemeli (tek overload) — % tanım', n; END IF;

  RAISE NOTICE 'session-f2a assert: PASS';
END $$;
