-- GİRİŞ GÜVENLİĞİ F2 — GERİ DÖNÜŞ (rollback) kanıtı. Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar.
-- Durum: bütün F2 migration'ları (000000…000700) + 000200 EN SONDA uygulanmış; ardından "ESKİ koda dönüş" taklit edilir.
-- Kanıtlanan: geri dönüş YALNIZ "erişimi geri getiriyor mu" diye değerlendirilemez:
--   R1) Kod eski sürüme dönerse ve 000200 yerindeyse: eski kodun admin web girişi (doğrudan INSERT) REDDEDİLİR → erişim kaybı.
--   R2) INSERT yetkisi geri verilirse (geri dönüş adımı): MFA'sız hesap eski yolla girer; MFA ZORUNLU hesap için doğrudan
--       INSERT / create_session_v2 / bekleyen oturum onayı yine REDDEDİLİR → MFA atlatma YOK, ama bu hesaplar eski kodla
--       giriş YAPAMAZ (erişim kaybı) → geri dönüşten önce Owner'ın bu hesaplarda kararı gerekir.
--   R3) Var olan MFA'lı oturumlar geri dönüşte geçerli kalır (habersiz çıkış yok); pasif hesabın oturumu yine geçersiz.
--   R4) Eski oturum yolları (create_session_within_limits / login_user) varsa service_role'e kapalı kalır.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
GRANT EXECUTE ON FUNCTION pg_temp.h(text) TO service_role;

DO $$
DECLARE
  VE constant uuid := '00000000-0000-0000-0000-00000000e0d1';
BEGIN
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id = VE;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method, session_state)
  VALUES (VE, 'rb-ve-existing', true, 'desktop_web', 'expert', now() + interval '1 day', 'qr_device', 'active');
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
END $$;

-- R1: 000200 yerinde + eski kod.
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state)
    VALUES ('00000000-0000-0000-0000-00000000a002', 'rb-old-admin', true, 'desktop_web', 'admin', 'active');
    RAISE EXCEPTION 'R1 000200 yerindeyken eski kodun doğrudan INSERT''i reddedilmeli (erişim kaybı riski belgelenmeli)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- R2: geri dönüş adımı (INSERT yetkisi geri verilir).
GRANT INSERT ON public.user_sessions TO service_role;
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state, expires_at)
  VALUES ('00000000-0000-0000-0000-00000000a002', 'rb-old-admin', true, 'desktop_web', 'admin', 'active', now() + interval '1 day');
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state)
    VALUES ('00000000-0000-0000-0000-00000000e0d1', 'rb-bypass', true, 'desktop_web', 'expert', 'active');
    RAISE EXCEPTION 'R2a geri dönüşte bile MFA zorunlu hesaba doğrudan oturum AÇILAMAZ';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    r := public.create_session_v2('00000000-0000-0000-0000-00000000e0d1', 'rb-bypass-v2', '1.1.1.1', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
                                  now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
    RAISE EXCEPTION 'R2b create_session_v2 MFA''yı atlatamaz: %', r;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state, mfa_method)
    VALUES ('00000000-0000-0000-0000-00000000e001', 'rb-fake-mfa', true, 'desktop_web', 'expert', 'active', 'recovery_code');
    RAISE EXCEPTION 'R2c MFA kanıtı doğrudan yazılamaz';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  VE constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  sid uuid;
BEGIN
  -- R2d: MFA öncesi oluşmuş BEKLEYEN oturum, onayla MFA'sız aktifleşemez (F2-B tetikleyicisi geri dönüşte de çalışır).
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = false WHERE id = VE;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, session_state)
  VALUES (VE, 'rb-pending', false, 'desktop_web', 'expert', 'pending_approval') RETURNING id INTO sid;
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id = VE;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  BEGIN
    UPDATE public.user_sessions SET is_active = true, session_state = 'active' WHERE id = sid;
    RAISE EXCEPTION 'R2d bekleyen oturum MFA''sız aktifleşemez';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- R3: var olan MFA'lı oturum geçerli; pasif hesabın oturumu geçersiz.
  IF public.touch_active_session('rb-ve-existing', 60, 604800, true) IS NULL THEN RAISE EXCEPTION 'R3a var olan MFA''lı oturum geri dönüşte geçerli kalmalı'; END IF;
  UPDATE public.users SET active = false WHERE id = VE;
  IF public.touch_active_session('rb-ve-existing', 60, 604800, true) IS NOT NULL THEN RAISE EXCEPTION 'R3b pasif hesabın oturumu geçersiz'; END IF;
  UPDATE public.users SET active = true WHERE id = VE;
  -- R4: eski yollar kapalı (varsa).
  IF to_regprocedure('public.login_user(text,text)') IS NOT NULL AND has_function_privilege('service_role', 'public.login_user(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'R4 login_user service_role''e kapalı kalmalı';
  END IF;
  RAISE NOTICE 'deploy-order-f2-rollback: GEÇTİ';
END $$;
