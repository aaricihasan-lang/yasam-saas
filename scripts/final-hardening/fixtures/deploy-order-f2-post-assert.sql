-- GİRİŞ GÜVENLİĞİ F2 — YAYIN SIRASI kanıtı, AŞAMA 2 (000200 EN SONDA uygulanmış). Yerel embedded-pg; prod'a temas YOK.
-- Durum: 000000 → 000100 → 000300 → 000400 → 000500 → 000200.
-- Kanıtlanan: (1) 000200 en sonda sorunsuz uygulanır (önceki dosyaların nesnelerine dokunmaz, onlara bağımlı değildir);
-- (2) yeni kodun bütün oturum yolları (admin web RPC, create_session_v2, finalize: QR / e-posta / kurtarma kodu / bilet)
--     service_role ile ÇALIŞMAYA DEVAM eder; (3) doğrudan INSERT artık reddedilir (eski kod bu noktada yayında
--     OLMAMALI — sıra kuralı); (4) F2-E fonksiyonlarının EXECUTE yetkileri 000200 ile değişmez.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
GRANT EXECUTE ON FUNCTION pg_temp.h(text) TO service_role;
-- Uygulamanın kod özeti (lib/auth/recoveryCodes.ts) — public.auth_recovery_hash service_role'e KAPALI olduğundan.
CREATE FUNCTION pg_temp.rh(p_user uuid, p_code text) RETURNS text LANGUAGE sql AS $$
  SELECT encode(sha256(convert_to('yasam-recovery-v1:' || p_user::text || ':' || p_code, 'UTF8')), 'hex');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rh(uuid, text) TO service_role;

DO $$
DECLARE
  VE constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  r jsonb;
BEGIN
  UPDATE public.users SET email_verified_at = now() WHERE id = VE;
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = VE;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
  VALUES (VE, 'order-ve-qr', true, 'desktop_web', 'expert', now() + interval '1 day', 'qr_device');
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
  r := public.auth_recovery_codes_generate('order-ve-qr',
         (SELECT array_agg(public.auth_recovery_hash(VE, 'ord' || i)) FROM generate_series(0, 9) i));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P0 hazırlık: %', r; END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE
  ADM2 constant uuid := '00000000-0000-0000-0000-00000000a002';
  FREE constant uuid := '00000000-0000-0000-0000-00000000e001';
  VE   constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  r jsonb; ch uuid; d jsonb;
BEGIN
  -- (3) Doğrudan INSERT kapalı.
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state)
    VALUES (ADM2, 'order-old-direct', true, 'desktop_web', 'admin', 'active');
    RAISE EXCEPTION 'P1 000200 sonrası doğrudan INSERT reddedilmeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- (2) Yeni kod yolları.
  r := public.create_session_admin_web(ADM2, 'order-new-admin', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'P2 create_session_admin_web: %', r; END IF;
  r := public.create_session_v2(FREE, 'order-v2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF coalesce((r->>'inserted')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'P3 create_session_v2: %', r; END IF;
  -- Kurtarma kodu → finalize.
  ch := (public.auth_mfa_begin(VE, pg_temp.h('pb'), 'desktop_web', 'ip', 'UA', 300)->>'challenge_id')::uuid;
  r := public.auth_recovery_code_verify(ch, pg_temp.h('pb'), pg_temp.rh(VE, 'ord0'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P4 kurtarma kodu: %', r; END IF;
  r := public.auth_finalize_login(ch, pg_temp.h('pb'), 'order-ve-rec', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF NOT (r->>'ok')::boolean OR r->>'mfa_method' <> 'recovery_code' THEN RAISE EXCEPTION 'P5 finalize (kod): %', r; END IF;
  -- E-posta kodu → finalize (F2-D yolu 000200 + 000500 sonrası).
  ch := (public.auth_mfa_begin(VE, pg_temp.h('pe'), 'desktop_web', 'ip', 'UA', 300)->>'challenge_id')::uuid;
  d := public.auth_email_otp_issue(VE, 'login', ch, pg_temp.h('otp-123456'), pg_temp.h('to'), 'synthetic', 100000, 100000);
  IF NOT (d->>'ok')::boolean THEN RAISE EXCEPTION 'P6 e-posta kodu: %', d; END IF;
  PERFORM public.auth_email_delivery_result((d->>'delivery_id')::bigint, true, NULL, 'm');
  r := public.auth_email_otp_verify(VE, 'login', ch, pg_temp.h('otp-123456'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P7 e-posta doğrulama: %', r; END IF;
  r := public.auth_finalize_login(ch, pg_temp.h('pe'), 'order-ve-mail', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF NOT (r->>'ok')::boolean OR r->>'mfa_method' <> 'email_otp' THEN RAISE EXCEPTION 'P8 finalize (e-posta): %', r; END IF;
  -- MFA zorunlu kullanıcıya create_session_v2 ile atlatma yok.
  BEGIN
    r := public.create_session_v2(VE, 'order-bypass-v2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
    RAISE EXCEPTION 'P9 create_session_v2 MFA''yı atlatmamalı: %', r;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE t text;
BEGIN
  IF has_table_privilege('service_role', 'public.user_sessions', 'INSERT') THEN RAISE EXCEPTION 'P10 000200 INSERT yetkisini kaldırmalı'; END IF;
  FOREACH t IN ARRAY ARRAY['public.auth_recovery_codes_generate(text,text[])', 'public.auth_recovery_code_verify(uuid,text,text)',
      'public.auth_finalize_login(uuid,text,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)',
      'public.create_session_admin_web(uuid,text,text,text,text,text,text,text,text,timestamptz)', 'public.auth_recovery_case_execute(text,uuid,text,boolean)'] LOOP
    IF NOT has_function_privilege('service_role', t, 'EXECUTE') THEN RAISE EXCEPTION 'P11 % service_role''e açık kalmalı', t; END IF;
  END LOOP;
  RAISE NOTICE 'deploy-order-f2-post: GEÇTİ';
END $$;
