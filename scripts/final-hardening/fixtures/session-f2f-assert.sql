-- GİRİŞ GÜVENLİĞİ F2-F davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar.
-- Zincir: session-model + f2a…f2d fixture'ları → F2-A…F2-E migration'ları → session-f2f-seed ; migration: 20280103000600 (iki kez).
-- Test kısayolu: MFA'lı / bayat oturumlar postgres rolüyle doğrudan kurulur (üretimde yalnız auth_finalize_login).

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
CREATE FUNCTION pg_temp.sess(p_user uuid, p_token text, p_method text, p_age interval DEFAULT interval '0') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method, created_at)
  VALUES (p_user, p_token, true, 'desktop_web',
          CASE WHEN p_user IN ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002') THEN 'admin' ELSE 'expert' END,
          now() + interval '1 day', p_method, now() - p_age);
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
END $$;
CREATE FUNCTION pg_temp.dev(p_user uuid, p_fp text, p_state text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state, activated_at)
  VALUES (p_user, repeat('D', 120), pg_temp.h(p_fp), 'ABCD-EFGH', 'Pixel', p_state, CASE WHEN p_state = 'active' THEN now() END) RETURNING id;
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  VE2   constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  r jsonb; n int; d uuid; cid uuid; t text;
BEGIN
  -- ── A) Denetim tablosu taşınması: veri kaybı yok, değiştirilemezlik aynen ─────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_recovery_events' AND column_name = 'user_id') THEN
    RAISE EXCEPTION 'A1 eski user_id kolonu kalmamalı';
  END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE subject_user_id = VE AND detail->>'seed' = 'true';
  IF n <> 2 THEN RAISE EXCEPTION 'A2 migration öncesi 2 olay taşınmalı (%)', n; END IF;
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'auth_recovery_events' AND column_name = 'subject_user_id') <> 'NO' THEN
    RAISE EXCEPTION 'A3 subject_user_id NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auth_recovery_events_append_only_trg' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'A4 değiştirilemezlik tetikleyicisi YENİDEN etkin olmalı';
  END IF;
  BEGIN
    UPDATE public.auth_recovery_events SET event = 'code_used';
    RAISE EXCEPTION 'A5 UPDATE reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.auth_device_decisions'::regclass AND contype = 'f') THEN
    RAISE EXCEPTION 'A6 karar kaydında cihaz FK''si kalmamalı';
  END IF;
  DELETE FROM public.auth_trusted_devices WHERE key_fingerprint = pg_temp.h('f2f-seed-dev');
  SELECT count(*) INTO n FROM public.auth_device_decisions WHERE decision = 'approve' AND verification_method = 'telefon';
  IF n < 1 THEN RAISE EXCEPTION 'A7 cihaz silinince karar kaydı korunmalı'; END IF;
  BEGIN
    DELETE FROM public.auth_device_decisions;
    RAISE EXCEPTION 'A8 karar kaydı silinememeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Kurulum: Owner taze / bayat / MFA'sız oturumlar; ikinci yönetici; MFA zorunlu uzmanlar.
  PERFORM pg_temp.sess(OWNER, 'o-fresh', 'qr_device');
  PERFORM pg_temp.sess(OWNER, 'o-stale', 'qr_device', interval '31 minutes');
  PERFORM pg_temp.sess(OWNER, 'o-plain', NULL);
  PERFORM pg_temp.sess(ADM2, 'a2-fresh', 'qr_device');
  UPDATE public.users SET email_verified_at = now() WHERE id IN (VE, VE2, EXP, OWNER);
  r := public.auth_mfa_set_required('o-stale', VE2, true, 'açmak taze oturum istemez');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B1 zorunluluğu AÇMAK bayat oturumla da serbest: %', r; END IF;
  r := public.auth_mfa_set_required('o-fresh', EXP, true, 'f2f');
  r := public.auth_mfa_set_required('o-fresh', OWNER, true, 'f2f');

  -- ── B) Başka kullanıcının MFA'sını KAPATMAK: taze MFA'lı Owner oturumu ─────────────────────────────────
  r := public.auth_mfa_set_required('o-stale', VE2, false, 'kapat');
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'B2 bayat MFA oturumu kapatamaz: %', r; END IF;
  r := public.auth_mfa_set_required('o-plain', VE2, false, 'kapat');
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'B3 MFA''sız Owner oturumu kapatamaz: %', r; END IF;
  r := public.auth_mfa_set_required('a2-fresh', VE2, false, 'kapat');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'B4 Owner olmayan yönetici (eski kod korunur): %', r; END IF;
  r := public.auth_mfa_set_required('o-stale', OWNER, false, 'kendimi kapat');
  IF r->>'code' <> 'self_disable_forbidden' THEN RAISE EXCEPTION 'B5 Owner kendini kapatamaz (eski kod korunur): %', r; END IF;
  IF (SELECT mfa_required FROM public.users WHERE id = VE2) IS NOT TRUE THEN RAISE EXCEPTION 'B6 hiçbir red zorunluluğu değiştirmez'; END IF;
  r := public.auth_mfa_set_required('o-fresh', VE2, false, 'Owner taze oturumla kapattı');
  IF NOT (r->>'ok')::boolean OR (SELECT mfa_required FROM public.users WHERE id = VE2) THEN RAISE EXCEPTION 'B7 taze Owner oturumu kapatabilir: %', r; END IF;
  r := public.auth_mfa_set_required('o-fresh', VE2, true, 'geri aç');

  -- ── C) Cihaz onayı ──────────────────────────────────────────────────────────────────────────────────
  d := pg_temp.dev(EXP, 'f2f-exp-new', 'pending_owner');
  r := public.auth_device_owner_decide('o-stale', d, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'C1 bayat oturum onaylayamaz: %', r; END IF;
  r := public.auth_device_owner_decide('o-plain', d, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'C2 MFA''sız oturum (eski kod korunur): %', r; END IF;
  r := public.auth_device_owner_decide('a2-fresh', d, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'C3 Owner olmayan (eski kod korunur): %', r; END IF;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = d) <> 'pending_owner' THEN RAISE EXCEPTION 'C4 reddedilen denemeler durumu değiştirmez'; END IF;
  r := public.auth_device_owner_decide('o-fresh', d, 'approve', false, 'telefon', NULL);
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'C5 bağımsız kimlik teyidi kuralı korunur: %', r; END IF;
  r := public.auth_device_owner_decide('o-fresh', d, 'approve', true, 'telefon', 'kayıtlı numaradan arandı');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'C6 taze oturum onaylar: %', r; END IF;
  d := pg_temp.dev(VE, 'f2f-ve-new', 'pending_owner');
  r := public.auth_device_owner_decide('o-stale', d, 'reject', false, NULL, 'şüpheli');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'C7 RET bayat oturumla da serbest (yalnız yetki azaltır): %', r; END IF;
  d := pg_temp.dev(OWNER, 'f2f-owner-new', 'pending_owner');
  r := public.auth_device_owner_decide('o-fresh', d, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'self_approval_forbidden' THEN RAISE EXCEPTION 'C8 Owner kendi cihazını onaylayamaz: %', r; END IF;

  -- ── D) Kurtarma talebi aç / yürüt ───────────────────────────────────────────────────────────────────
  r := public.auth_recovery_case_open('o-stale', VE2, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'D1 bayat oturum talep açamaz: %', r; END IF;
  r := public.auth_recovery_case_open('o-plain', VE2, 'telefon', 'kayıtlı numaradan arandı');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'D2 MFA''sız (eski kod): %', r; END IF;
  r := public.auth_recovery_case_open('o-fresh', VE2, 'telefon', 'kayıtlı numaradan arandı');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D3 taze oturum açar: %', r; END IF;
  cid := (r->>'case_id')::uuid;
  UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours',
         expires_at = expires_at - interval '73 hours' WHERE id = cid;
  r := public.auth_recovery_case_execute('o-stale', cid, pg_temp.h('ticket'), true);
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'D4 bayat oturum yürütemez: %', r; END IF;
  IF (SELECT state FROM public.auth_recovery_cases WHERE id = cid) <> 'waiting' THEN RAISE EXCEPTION 'D5 talep bekler'; END IF;
  r := public.auth_recovery_case_execute('o-fresh', cid, pg_temp.h('ticket'), true);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D6 taze oturum yürütür: %', r; END IF;
  IF (SELECT mfa_required FROM public.users WHERE id = VE2) IS NOT TRUE THEN RAISE EXCEPTION 'D7 MFA zorunluluğu kapanmaz'; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE subject_user_id = VE2 AND event IN ('case_opened', 'case_executed');
  IF n <> 2 THEN RAISE EXCEPTION 'D8 olaylar yeni kolonla yazılır (%)', n; END IF;

  -- ── E) F2-E fonksiyonları yeni kolonla aynen çalışır ────────────────────────────────────────────────
  PERFORM pg_temp.sess(EXP, 'exp-qr', 'qr_device');
  FOR i IN 1..3 LOOP
    r := public.auth_recovery_codes_generate('exp-qr', (SELECT array_agg(pg_temp.h('f2f' || i || '-' || j)) FROM generate_series(0, 9) j));
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E1 üretim %: %', i, r; END IF;
  END LOOP;
  r := public.auth_recovery_codes_generate('exp-qr', (SELECT array_agg(pg_temp.h('f2f4-' || j)) FROM generate_series(0, 9) j));
  IF r->>'code' <> 'rate_limited' THEN RAISE EXCEPTION 'E2 24 saatte 3 üretim sınırı yeni kolonla sayılır: %', r; END IF;
  r := public.auth_recovery_status('exp-qr');
  IF NOT (r->>'ok')::boolean OR (r->>'codes_active')::int <> 10 THEN RAISE EXCEPTION 'E3 durum: %', r; END IF;

  -- ── F) Yetkiler: çekirdekler service_role'e KAPALI, sarmalayıcılar açık ───────────────────────────────
  FOREACH t IN ARRAY ARRAY['public.auth_device_owner_decide_core(text,uuid,text,boolean,text,text)', 'public.auth_mfa_set_required_core(text,uuid,boolean,text)',
      'public.auth_recovery_case_open_core(text,uuid,text,text)', 'public.auth_recovery_case_execute_core(text,uuid,text,boolean)',
      'public.auth_session_fresh_mfa(text,integer)', 'public.auth_owner_session_stale(text)'] LOOP
    IF has_function_privilege('service_role', t, 'EXECUTE') OR has_function_privilege('anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'F1 % kapalı olmalı', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.auth_device_owner_decide(text,uuid,text,boolean,text,text)', 'public.auth_mfa_set_required(text,uuid,boolean,text)',
      'public.auth_recovery_case_open(text,uuid,text,text)', 'public.auth_recovery_case_execute(text,uuid,text,boolean)'] LOOP
    IF NOT has_function_privilege('service_role', t, 'EXECUTE') OR has_function_privilege('anon', t, 'EXECUTE') THEN RAISE EXCEPTION 'F2 % yalnız service_role', t; END IF;
  END LOOP;
  RAISE NOTICE 'session-f2f-assert: GEÇTİ';
END $$;
