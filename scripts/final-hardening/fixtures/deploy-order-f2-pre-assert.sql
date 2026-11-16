-- GİRİŞ GÜVENLİĞİ F2 — YAYIN SIRASI kanıtı, AŞAMA 1 (000200 HENÜZ YOK). Yerel embedded-pg; prod'a temas YOK.
-- Durum: 000000 → 000100 → 000300 → 000400 → 000500 uygulanmış; 000200 (service_role INSERT kilidi) UYGULANMAMIŞ.
-- Kanıtlanan: (1) ESKİ kod (doğrudan INSERT / create_session_v2) bu ara durumda çalışmaya devam eder → giriş kesilmez;
-- (2) YENİ kod yolları (create_session_admin_web, MFA challenge → kurtarma kodu / e-posta → finalize) çalışır;
-- (3) MFA zorunlu kullanıcıya 000200 olmadan da doğrudan oturum AÇILAMAZ (000100 tetikleyicisi) → atlatma penceresi yok;
-- (4) 000300/000400/000500 nesneleri 000200'e bağımlı değildir.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
GRANT EXECUTE ON FUNCTION pg_temp.h(text) TO service_role;
-- Uygulamanın kod özeti (lib/auth/recoveryCodes.ts) — public.auth_recovery_hash service_role'e KAPALI olduğundan.
CREATE FUNCTION pg_temp.rh(p_user uuid, p_code text) RETURNS text LANGUAGE sql AS $$
  SELECT encode(sha256(convert_to('yasam-recovery-v1:' || p_user::text || ':' || p_code, 'UTF8')), 'hex');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rh(uuid, text) TO service_role;

-- Hazırlık (postgres): MFA zorunlu uzman + MFA'lı oturumu (yalnız test kısayolu) + 10 kurtarma kodu.
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
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'O0 hazırlık: %', r; END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE
  ADM2 constant uuid := '00000000-0000-0000-0000-00000000a002';
  FREE constant uuid := '00000000-0000-0000-0000-00000000e001';
  VE   constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  r jsonb; ch uuid;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'O1 rol service_role olmalı'; END IF;
  -- (1) ESKİ kod: admin web oturumu doğrudan INSERT (F2-B öncesi uygulama kodu) — 000200 yokken ÇALIŞIR.
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state, expires_at)
  VALUES (ADM2, 'order-old-direct', true, 'desktop_web', 'admin', 'active', now() + interval '1 day');
  -- ESKİ kod: uzman oturumu create_session_v2 (imza F2-A'da değişmedi).
  r := public.create_session_v2(FREE, 'order-old-v2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF coalesce((r->>'inserted')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'O2 eski create_session_v2: %', r; END IF;
  -- (2) YENİ kod: admin web RPC + MFA kurtarma kodu akışı.
  r := public.create_session_admin_web(ADM2, 'order-new-admin', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'O3 create_session_admin_web: %', r; END IF;
  ch := (public.auth_mfa_begin(VE, pg_temp.h('ob'), 'desktop_web', 'ip', 'UA', 300)->>'challenge_id')::uuid;
  r := public.auth_recovery_code_verify(ch, pg_temp.h('ob'), pg_temp.rh(VE, 'ord0'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'O4 kurtarma kodu: %', r; END IF;
  r := public.auth_finalize_login(ch, pg_temp.h('ob'), 'order-ve-rec', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF NOT (r->>'ok')::boolean OR r->>'mfa_method' <> 'recovery_code' THEN RAISE EXCEPTION 'O5 finalize: %', r; END IF;
  -- (3) MFA zorunlu kullanıcıya doğrudan oturum: 000200 olmadan da RED (000100 tetikleyicisi).
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state)
    VALUES (VE, 'order-bypass', true, 'desktop_web', 'expert', 'active');
    RAISE EXCEPTION 'O6 MFA zorunlu kullanıcıya doğrudan oturum açılmamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    r := public.create_session_v2(VE, 'order-bypass-v2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
    RAISE EXCEPTION 'O7 create_session_v2 MFA''yı atlatmamalı: %', r;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  -- (4) 000200'ün kaldırdığı yetki henüz yerinde (ara durum doğru tanımlandı).
  IF NOT has_table_privilege('service_role', 'public.user_sessions', 'INSERT') THEN
    RAISE EXCEPTION 'O8 000200 uygulanmadan service_role INSERT yetkisi beklenir';
  END IF;
  RAISE NOTICE 'deploy-order-f2-pre: GEÇTİ';
END $$;
