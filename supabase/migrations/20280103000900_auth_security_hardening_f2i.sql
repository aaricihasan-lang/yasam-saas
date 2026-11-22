-- =============================================================================
-- 20280103000900_auth_security_hardening_f2i.sql
--
-- GİRİŞ GÜVENLİĞİ F2-I — 17.11.2026 bağımsız güvenlik denetiminin bulgularının kapatılması.
-- BAĞIMLILIK: 000000 … 000800 (F2-A…F2-H). EKLEYİCİ: hiçbir kaydı silmez; tablo yapısı değişmez (yalnız
-- fonksiyon gövdeleri, tetikleyiciler ve bir CHECK kısıtı).
--
--   I1 (BLOCKER) Owner'ın işleme özel kanıtı e-postayla YALNIZ oturum açılmadan ÖNCE doğrulanmış adrese gider.
--      Çalınmış taze Owner oturumu Owner e-postasını değiştirip yeniden doğrulasa da kanıt alamaz (tetikleyici +
--      step-up başlatma yanıtı).
--   I2 Telefon (QR) yöntemi olan kullanıcı, yalnız e-posta koduyla açılmış oturumda kurtarma kodu üretemez.
--   I3 MFA zorunlu yapılınca MFA'sız açık / bekleyen oturumlar sona erer ('mfa_enforced').
--   I4 Parola değişince veya hesap pasifleşince açık giriş / kanıt istekleri reddedilir ('credentials_changed').
--   I5 Oturum satırının kullanıcısı değiştirilemez.
--   I6 Başkasının güvenilir cihazını iptal (Owner) son 30 dk'da ikinci doğrulamayla açılmış oturum ister.
--   I7 QR isteği telefona amacını bildirir ('purpose', 'action') — giriş ile kritik işlem ayırt edilir.
--   I8 Parola sıfırlama için işleme özel kanıt: auth_owner_step_up_take(…, 'password_reset', hedef). MFA kullanmayan
--      (zorunluluğu kapalı ve oturumu MFA'sız) Owner için davranış DEĞİŞMEZ (daha güçlü yöntem yok).
--   I9 Yasal saklama: kişinin cihazına ait kararlar ve ayrıntı / metadata'da geçen kimlik de korunur.
--   I10 Anonimleştirmede zaman damgası güne yuvarlanır (aynı anlı başka tablolarla eşleştirmeyle kimlik bulunamaz).
--       Yürütme, yasal saklama tablosunu SHARE kipinde kilitler (eşzamanlı saklama ile yarış yok).
--   I11 auth_retention_table_uuid yalnız sunucu rolüne açık.
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; yeni iç yardımcılar API rollerine kapalı.
-- İDEMPOTENT: CREATE OR REPLACE / DROP ... IF EXISTS.
-- ROLLBACK: önceki gövdeler 000300 / 000600 / 000800'dedir (aynı imzalarla yeniden yüklenir); yeni tetikleyiciler
--           DROP TRIGGER ile kaldırılır. Geri alınırsa yukarıdaki açıklar yeniden açılır.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 900;
  v_known   constant integer := 1200;
  v_reg     integer;
  v_fp      integer := -1;
  v_missing text;
  r         record;
BEGIN
  -- 1) Kayıt (her doğrusal F2 migration'ı COMMIT'ten önce yazar).
  IF to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL THEN
    EXECUTE 'SELECT public.auth_f2_schema_level()' INTO v_reg;
  END IF;
  -- 2) Katalog parmak izleri (kayıttan bağımsız ikinci kaynak).
  FOR r IN SELECT * FROM (VALUES
      (0, to_regprocedure('public.auth_is_owner_admin(uuid)') IS NOT NULL),
      (100, to_regclass('public.auth_mfa_challenges') IS NOT NULL),
      (300, to_regclass('public.auth_trusted_devices') IS NOT NULL),
      (400, to_regclass('public.auth_email_otps') IS NOT NULL),
      (500, to_regclass('public.auth_recovery_codes') IS NOT NULL),
      (600, EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_owner_session_stale')),
      (700, to_regclass('public.auth_audit_retention_policy') IS NOT NULL),
      (800, to_regclass('public.auth_retention_holds') IS NOT NULL),
      (900, to_regprocedure('public.user_sessions_user_id_immutable()') IS NOT NULL),
      (1000, to_regclass('public.auth_session_device_proofs') IS NOT NULL),
      (1100, to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL),
      (1200, to_regprocedure('public.auth_email_provider_allowed(text)') IS NOT NULL)
    ) AS t(lvl, present) ORDER BY lvl LOOP
    IF r.present THEN
      v_fp := greatest(v_fp, r.lvl);
    ELSIF r.lvl < v_me THEN
      v_missing := concat_ws(',', v_missing, lpad(r.lvl::text, 6, '0'));
    END IF;
  END LOOP;
  IF coalesce(v_reg, -1) > v_me OR v_fp > v_me THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: % daha yeni bir F2 aşamasının üzerine YENİDEN UYGULANAMAZ (kayıt=%, katalog=%). Owner korumalı fonksiyonlar eski gövdeye dönerdi; hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0')
      USING ERRCODE = 'YF201';
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: SIRA HATASI — % uygulanmadan önce eksik aşama(lar): %. Hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), v_missing USING ERRCODE = 'YF202';
  END IF;
  IF (v_reg IS NULL AND v_fp >= 0) OR (v_reg IS NOT NULL AND v_reg <= v_known AND v_reg <> v_fp) THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: ŞEMA SAPMASI — kayıt (%) ile katalog parmak izi (%) çelişiyor; insan incelemesi gerekli. Hiçbir değişiklik yapılmadı.',
      coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0') USING ERRCODE = 'YF203';
  END IF;
END $f2guard$;
-- <<< F2 MİGRATION KORUMASI

-- ── I8) Step-up işlem listesi: + password_reset ─────────────────────────────
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_step_up_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_step_up_chk
  CHECK ((purpose = 'step_up') = (step_action IS NOT NULL AND step_target IS NOT NULL AND step_session_id IS NOT NULL)
     AND (step_action IS NULL OR step_action IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy', 'retention_execute', 'password_reset')));

-- I4) Red nedeni listesi: + credentials_changed (000500 listesi aynen korunur).
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_match_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_match_chk
  CHECK ((match_code IS NULL OR match_code ~ '^[0-9]{2}$')
     AND (qr_nonce_hash IS NULL OR qr_nonce_hash ~ '^[0-9a-f]{64}$')
     AND (denied_reason IS NULL OR denied_reason IN ('user_denied', 'wrong_match', 'device_revoked', 'otp_locked',
                                                      'recovery_locked', 'account_recovery', 'credentials_changed')));

-- Step-up başlatma: gövde 000800 ile AYNI; işlem listesi + e-posta yöntemi koşulu (I1).
CREATE OR REPLACE FUNCTION public.auth_owner_step_up_begin(p_actor_token text, p_action text, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_s     record;
  v_open  integer;
  v_id    uuid;
  v_nonce text;
  v_codes text[] := ARRAY[]::text[];
  v_c     text;
  v_match text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR v_s.mfa_method IS NULL OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy', 'retention_execute', 'password_reset') OR p_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mfa:' || v_s.user_id::text, 0));
  UPDATE public.auth_mfa_challenges SET state = 'expired'
   WHERE user_id = v_s.user_id AND state IN ('pending', 'verified') AND expires_at <= v_now;
  SELECT count(*) INTO v_open FROM public.auth_mfa_challenges
   WHERE user_id = v_s.user_id AND purpose = 'step_up' AND state IN ('pending', 'verified');
  IF v_open >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many_open');
  END IF;
  -- QR nonce (192 bit) + 3 farklı 2 haneli kod (1 doğru) — auth_mfa_begin (F2-C) ile aynı üretim.
  v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  WHILE coalesce(array_length(v_codes, 1), 0) < 3 LOOP
    v_c := lpad(((get_byte(extensions.gen_random_bytes(1), 0) * 100) / 256)::text, 2, '0');
    IF NOT (v_c = ANY (v_codes)) THEN
      v_codes := v_codes || v_c;
    END IF;
  END LOOP;
  v_match := v_codes[1 + (get_byte(extensions.gen_random_bytes(1), 0) % 3)];
  INSERT INTO public.auth_mfa_challenges (user_id, purpose, browser_secret_hash, client_channel, created_at, expires_at,
                                          qr_nonce_hash, match_code, match_options, step_action, step_target, step_session_id)
  VALUES (v_s.user_id, 'step_up', encode(sha256(extensions.gen_random_bytes(32)), 'hex'), 'desktop_web', v_now, v_now + interval '5 minutes',
          encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex'), v_match, v_codes, p_action, p_target, v_s.session_id)
  RETURNING id INTO v_id;
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'step_up_requested',
                                   jsonb_build_object('challenge_id', v_id, 'action', p_action, 'target', p_target));
  RETURN jsonb_build_object('ok', true, 'challenge_id', v_id, 'expires_at', v_now + interval '5 minutes',
    'qr_nonce', v_nonce, 'match_code', v_match,
    'has_device', EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = v_s.user_id AND d.state = 'active'),
    -- F2-I: e-posta yalnız BU oturum açılmadan ÖNCE doğrulanmışsa kanıt yöntemidir (oturum içinde adres değiştirilip
    -- yeniden doğrulanırsa çalınmış oturum kendi kutusuna kanıt alamaz).
    'email_verified', coalesce((SELECT u.email_verified_at IS NOT NULL AND u.email_verified_at <= v_s.created_at
                                  FROM public.users u WHERE u.id = v_s.user_id), false));
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_step_up_begin(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_step_up_begin(text, text, uuid) TO service_role;


-- ── I1) Kanıt e-postası: yalnız oturumdan ÖNCE doğrulanmış adrese (kesin engel) ──
CREATE OR REPLACE FUNCTION public.auth_email_otp_step_up_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.challenge_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT CASE WHEN c.purpose <> 'step_up' THEN true
              ELSE coalesce(u.email_verified_at IS NOT NULL AND u.email_verified_at <= s.created_at, false) END
    INTO v_ok
    FROM public.auth_mfa_challenges c
    JOIN public.users u ON u.id = c.user_id
    LEFT JOIN public.user_sessions s ON s.id = c.step_session_id
   WHERE c.id = NEW.challenge_id;
  IF v_ok IS DISTINCT FROM true AND v_ok IS NOT NULL THEN
    RAISE EXCEPTION 'step_up_email_unverified' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.auth_email_otp_step_up_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_auth_email_otp_step_up_guard ON public.auth_email_otps;
CREATE TRIGGER trg_auth_email_otp_step_up_guard BEFORE INSERT ON public.auth_email_otps
  FOR EACH ROW EXECUTE FUNCTION public.auth_email_otp_step_up_guard();

-- ── I2) Kurtarma kodu üretimi (gövde 000600 ile AYNI + güçlü oturum koşulu) ──
CREATE OR REPLACE FUNCTION public.auth_recovery_codes_generate(p_actor_token text, p_code_hashes text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := public.auth_session_actor(p_actor_token, true);
  v_user    public.users%ROWTYPE;
  v_n       integer;
  v_revoked integer;
  v_batch   uuid := gen_random_uuid();
  v_method  text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  -- F2-I: telefon (QR) yöntemi olan kullanıcı, yalnız e-posta koduyla açılmış oturumda kod üretemez (parola + e-posta
  -- kutusu → kurtarma kodu → e-posta değişikliği zinciri). Tek yöntemi e-posta olan kullanıcı için davranış aynı.
  SELECT s.mfa_method INTO v_method FROM public.auth_session_mfa(p_actor_token) s;
  IF v_method = 'email_otp' AND EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = v_actor AND d.state = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'strong_mfa_required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || v_actor::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v_actor;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_code_hashes IS NULL OR cardinality(p_code_hashes) <> 10
     OR (SELECT count(DISTINCT h) FROM unnest(p_code_hashes) h WHERE h ~ '^[0-9a-f]{64}$') <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_recovery_events
   WHERE subject_user_id = v_actor AND event = 'codes_generated' AND created_at > now() - interval '24 hours';
  IF v_n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 3600);
  END IF;

  UPDATE public.auth_recovery_codes
     SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated'
   WHERE user_id = v_actor AND kind = 'user' AND state = 'active';
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
  SELECT v_actor, 'user', v_batch, h FROM unnest(p_code_hashes) h;

  PERFORM public.auth_recovery_log(v_actor, v_actor, 'codes_generated', jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_actor, 'recovery_codes_generated', 'high',
          CASE WHEN v_revoked > 0 THEN 'Kurtarma kodları yenilendi (eski kodlar geçersiz)' ELSE 'Kurtarma kodları oluşturuldu' END,
          jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'count', 10, 'revoked', v_revoked);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_codes_generate(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_codes_generate(text, text[]) TO service_role;


-- ── I3) MFA zorunlu olunca MFA'sız açık / bekleyen oturumlar sona erer ──
CREATE OR REPLACE FUNCTION public.auth_mfa_required_end_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.user_sessions
     SET is_active = false, ended_at = now(), end_reason = 'mfa_enforced'
   WHERE user_id = NEW.id AND mfa_method IS NULL AND ended_at IS NULL;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.auth_mfa_required_end_sessions() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_auth_mfa_required_end_sessions ON public.users;
CREATE TRIGGER trg_auth_mfa_required_end_sessions AFTER UPDATE OF mfa_required ON public.users
  FOR EACH ROW WHEN (NEW.mfa_required IS TRUE AND OLD.mfa_required IS DISTINCT FROM true)
  EXECUTE FUNCTION public.auth_mfa_required_end_sessions();

-- ── I4) Parola değişince / hesap pasifleşince açık giriş ve kanıt istekleri reddedilir ──
CREATE OR REPLACE FUNCTION public.auth_credentials_changed_deny_challenges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.auth_mfa_challenges
     SET state = 'denied', denied_reason = 'credentials_changed'
   WHERE user_id = NEW.id AND state IN ('pending', 'verified');
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.auth_credentials_changed_deny_challenges() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_auth_credentials_changed_deny_challenges ON public.users;
CREATE TRIGGER trg_auth_credentials_changed_deny_challenges AFTER UPDATE OF password_hash, active ON public.users
  FOR EACH ROW WHEN (NEW.password_hash IS DISTINCT FROM OLD.password_hash OR (OLD.active IS TRUE AND NEW.active IS DISTINCT FROM true))
  EXECUTE FUNCTION public.auth_credentials_changed_deny_challenges();

-- ── I5) Oturum satırı başka kullanıcıya taşınamaz (kullanıcı silinirken FK'nin NULL yapması hariç) ──
CREATE OR REPLACE FUNCTION public.user_sessions_user_id_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'user_sessions.user_id değiştirilemez' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.user_sessions_user_id_immutable() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_user_sessions_user_id_immutable ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_user_id_immutable BEFORE UPDATE OF user_id ON public.user_sessions
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
  EXECUTE FUNCTION public.user_sessions_user_id_immutable();

-- ── I6) Cihaz iptali (gövde 000300 ile AYNI + başkasının cihazı için taze MFA) ──
CREATE OR REPLACE FUNCTION public.auth_device_revoke(p_actor_token text, p_device_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v public.auth_trusted_devices%ROWTYPE;
  v_sessions integer := 0;
BEGIN
  v_actor := public.auth_session_actor(p_actor_token, false);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR (v.user_id <> v_actor AND NOT public.auth_is_owner_admin(v_actor)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  -- F2-I: başkasının cihazını iptal (Owner) son 30 dk'da ikinci doğrulamayla açılmış oturum ister (eski / çalınmış
  -- çerezle toplu kilitleme yok). Kendi cihazını iptal aynen serbest (kayıp telefon).
  IF v.user_id <> v_actor AND public.auth_session_fresh_mfa(p_actor_token, 30) IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  IF v.state IN ('revoked', 'rejected', 'expired') THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'state', v.state);
  END IF;
  UPDATE public.auth_trusted_devices
     SET state = 'revoked', revoked_at = now(), revoked_by = v_actor, activation_nonce = NULL,
         revoke_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
   WHERE id = v.id;
  UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'device_revoked'
   WHERE approved_device_id = v.id AND state = 'verified';
  UPDATE public.user_sessions s
     SET is_active = false, ended_at = now(), end_reason = 'device_revoked'
   WHERE s.is_active = true
     AND s.mfa_challenge_id IN (SELECT c.id FROM public.auth_mfa_challenges c WHERE c.approved_device_id = v.id);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, note)
  VALUES (v.id, v_actor, 'revoke', CASE WHEN v_actor = v.user_id THEN 'kullanici' END, left(nullif(btrim(coalesce(p_reason, '')), ''), 500));
  PERFORM public.auth_device_notify(v.id, v.user_id, 'cihaz_iptal');
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, 'device_revoked', 'high', 'Güvenilir cihaz iptal edildi',
          jsonb_build_object('device_id', v.id, 'actor_id', v_actor, 'sessions_closed', v_sessions));
  RETURN jsonb_build_object('ok', true, 'changed', true, 'sessions_closed', v_sessions);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_revoke(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_revoke(text, uuid, text) TO service_role;


-- ── I7) QR isteği okuma (gövde 000300 ile AYNI + amaç) ──
CREATE OR REPLACE FUNCTION public.auth_qr_fetch(p_challenge_id uuid, p_qr_nonce text, p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ch public.auth_mfa_challenges%ROWTYPE;
  v_dev public.auth_trusted_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_dev FROM public.auth_trusted_devices WHERE id = p_device_id AND state = 'active';
  SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id;
  -- Ayrım YOK: yanlış kullanıcı / iptal cihaz / süresi dolmuş / kullanılmış → 'invalid' (bilgi sızmaz).
  IF v_dev.id IS NULL OR v_ch.id IS NULL OR v_ch.user_id <> v_dev.user_id OR v_ch.state <> 'pending'
     OR v_ch.expires_at <= now() OR v_ch.qr_nonce_hash IS NULL OR p_qr_nonce IS NULL
     OR v_ch.qr_nonce_hash <> encode(sha256(convert_to(p_qr_nonce, 'UTF8')), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  UPDATE public.auth_trusted_devices SET last_used_at = now() WHERE id = v_dev.id;
  RETURN jsonb_build_object('ok', true, 'options', to_jsonb(v_ch.match_options), 'user_agent', v_ch.user_agent,
                            'client_channel', v_ch.client_channel, 'created_at', v_ch.created_at, 'expires_at', v_ch.expires_at,
                            -- F2-I: telefon isteğin amacını gösterir (giriş mi, Owner'ın kritik işlemi mi).
                            'purpose', v_ch.purpose, 'action', v_ch.step_action);
END $$;
REVOKE ALL ON FUNCTION public.auth_qr_fetch(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_qr_fetch(uuid, text, uuid) TO service_role;


-- ── I8) Rota tarafındaki Owner işlemleri için kanıt tüketimi (şimdilik: password_reset) ──
CREATE OR REPLACE FUNCTION public.auth_owner_step_up_take(p_actor_token text, p_action text, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s     record;
  v_req   boolean;
  v_proof uuid;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('password_reset') OR p_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT u.mfa_required IS TRUE INTO v_req FROM public.users u WHERE u.id = v_s.user_id;
  -- MFA kullanmayan Owner (zorunluluk kapalı + oturum MFA'sız): daha güçlü yöntem yok → davranış değişmez.
  IF v_req IS NOT TRUE AND v_s.mfa_method IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'step_up', false);
  END IF;
  IF public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  v_proof := public.auth_step_up_lock(p_actor_token, p_action, p_target);
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', p_action, 'target', p_target);
  END IF;
  PERFORM public.auth_step_up_consume(v_proof);
  RETURN jsonb_build_object('ok', true, 'step_up', true);
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_step_up_take(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_step_up_take(text, text, uuid) TO service_role;

-- ── I9) Yasal saklama kapsamı: tek yerde tanımlı (sayım ve yürütme AYNI koşulu kullanır) ──
CREATE OR REPLACE FUNCTION public.auth_retention_held_rec(p_subject uuid, p_actor uuid, p_detail jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x
                  WHERE x.released_at IS NULL
                    AND ((x.hold_type = 'subject_user' AND (x.subject_id = p_subject OR x.subject_id = p_actor))
                      OR (jsonb_typeof(p_detail) = 'object' AND x.subject_id::text IN (SELECT v.value FROM jsonb_each_text(p_detail) v))));
$$;
CREATE OR REPLACE FUNCTION public.auth_retention_held_dec(p_device uuid, p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x
                  WHERE x.released_at IS NULL
                    AND ((x.hold_type = 'device' AND x.subject_id = p_device)
                      OR (x.hold_type = 'subject_user' AND (x.subject_id = p_actor
                            OR x.subject_id = (SELECT td.user_id FROM public.auth_trusted_devices td WHERE td.id = p_device)))));
$$;
CREATE OR REPLACE FUNCTION public.auth_retention_held_sec(p_user uuid, p_meta jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_retention_holds x
                  WHERE x.released_at IS NULL
                    AND ((x.hold_type = 'subject_user' AND x.subject_id = p_user)
                      OR (jsonb_typeof(p_meta) = 'object' AND x.subject_id::text IN (SELECT v.value FROM jsonb_each_text(p_meta) v))));
$$;
REVOKE ALL ON FUNCTION public.auth_retention_held_rec(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_retention_held_dec(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_retention_held_sec(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Sayım (gövde 000800 ile AYNI; saklama koşulu yardımcıdan).
CREATE OR REPLACE FUNCTION public.auth_retention_count(p_table text, p_cutoff timestamptz, OUT candidates bigint, OUT held bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_table = 'auth_recovery_events' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT public.auth_retention_held_rec(e.subject_user_id, e.actor_id, e.detail) AS h
        FROM public.auth_recovery_events e
       WHERE e.created_at < p_cutoff AND e.subject_user_id <> public.auth_retention_zero_uuid()) s;
  ELSIF p_table = 'auth_device_decisions' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT public.auth_retention_held_dec(d.device_id, d.actor_id) AS h
        FROM public.auth_device_decisions d
       WHERE d.created_at < p_cutoff AND d.device_id <> public.auth_retention_zero_uuid()) s;
  ELSIF p_table = 'security_events' THEN
    SELECT count(*) FILTER (WHERE NOT h), count(*) FILTER (WHERE h) INTO candidates, held FROM (
      SELECT public.auth_retention_held_sec(s0.user_id, s0.metadata) AS h
        FROM public.security_events s0 WHERE s0.created_at < p_cutoff) s;
  ELSE
    RAISE EXCEPTION 'auth_retention_count: bilinmeyen tablo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_count(text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;


-- ── I10) Değiştirilemez denetim tetikleyicileri: anonimleştirmede zaman damgası güne yuvarlanır ──
CREATE OR REPLACE FUNCTION public.auth_recovery_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.auth_retention_active_run();
  IF r.table_name = 'auth_recovery_events' AND OLD.created_at < r.cutoff THEN
    IF TG_OP = 'DELETE' AND r.disposal_method = 'silme' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND r.disposal_method = 'anonimlestirme'
       AND NEW.id = OLD.id AND NEW.event = OLD.event AND NEW.created_at = date_trunc('day', OLD.created_at)
       AND NEW.subject_user_id = public.auth_retention_zero_uuid() AND NEW.actor_id IS NULL AND NEW.detail = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'auth_recovery_events yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_events_append_only() FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.auth_device_decisions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.auth_retention_active_run();
  IF r.table_name = 'auth_device_decisions' AND OLD.created_at < r.cutoff THEN
    IF TG_OP = 'DELETE' AND r.disposal_method = 'silme' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND r.disposal_method = 'anonimlestirme'
       AND NEW.id = OLD.id AND NEW.decision = OLD.decision AND NEW.created_at = date_trunc('day', OLD.created_at)
       AND NEW.verification_method IS NOT DISTINCT FROM OLD.verification_method
       AND NEW.fingerprint_confirmed = OLD.fingerprint_confirmed
       AND NEW.device_id = public.auth_retention_zero_uuid() AND NEW.actor_id = public.auth_retention_zero_uuid() AND NEW.note IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'auth_device_decisions yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_device_decisions_append_only() FROM PUBLIC, anon, authenticated, service_role;


-- Yürütme (gövde 000800 ile AYNI; saklama koşulu yardımcıdan + saklama kilidi + güne yuvarlama).
CREATE OR REPLACE FUNCTION public.auth_retention_execute(p_actor_token text, p_run_id uuid, p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_retention_owner(p_actor_token);
  v_run public.auth_retention_runs%ROWTYPE;
  p public.auth_audit_retention_policy%ROWTYPE;
  v_proof uuid;
  v_c record;
  v_n bigint := 0;
  v_err text;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  -- F2-I: yasal saklama ile yarış yok. Kilit sırası hold_set ile AYNI (önce saklama tablosu, sonra çalıştırma satırı):
  -- yürüyen bir saklama ekleme / kaldırma önce tamamlanır (ve açık önizlemeyi iptal eder) ya da bu yürütme bitene
  -- kadar bekler. Karşılıklı kilitlenme oluşmaz.
  LOCK TABLE public.auth_retention_holds IN SHARE MODE;
  SELECT * INTO v_run FROM public.auth_retention_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.state <> 'previewed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_previewed');
  END IF;
  IF v_run.expires_at <= now() THEN
    UPDATE public.auth_retention_runs SET state = 'expired' WHERE id = v_run.id;
    INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id) VALUES (v_run.id, v_run.table_name, 'expire', v_actor);
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF p_confirm IS DISTINCT FROM (v_run.table_name || ' ' || v_run.disposal_method || ' ' || v_run.candidate_count) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'confirm_mismatch');
  END IF;
  v_proof := public.auth_step_up_lock(p_actor_token, 'retention_execute', v_run.id);
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'retention_execute', 'target', v_run.id);
  END IF;
  SELECT * INTO p FROM public.auth_audit_retention_policy WHERE table_name = v_run.table_name FOR UPDATE;

  BEGIN
    IF public.auth_retention_policy_fp(v_run.table_name) IS DISTINCT FROM v_run.policy_fingerprint
       OR p.disposal_method IS DISTINCT FROM v_run.disposal_method OR p.retention_days IS NULL THEN
      RAISE EXCEPTION 'policy_changed' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_c FROM public.auth_retention_count(v_run.table_name, v_run.cutoff);
    IF v_c.candidates <> v_run.candidate_count THEN
      RAISE EXCEPTION 'count_mismatch' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.auth_retention_context (txid, run_id) VALUES (txid_current(), v_run.id);

    IF v_run.table_name = 'auth_recovery_events' THEN
      IF v_run.disposal_method = 'silme' THEN
        DELETE FROM public.auth_recovery_events e
         WHERE e.created_at < v_run.cutoff AND e.subject_user_id <> zero
           AND NOT public.auth_retention_held_rec(e.subject_user_id, e.actor_id, e.detail);
      ELSE
        UPDATE public.auth_recovery_events e SET subject_user_id = zero, actor_id = NULL, detail = '{}'::jsonb, created_at = date_trunc('day', e.created_at)
         WHERE e.created_at < v_run.cutoff AND e.subject_user_id <> zero
           AND NOT public.auth_retention_held_rec(e.subject_user_id, e.actor_id, e.detail);
      END IF;
    ELSIF v_run.table_name = 'auth_device_decisions' THEN
      IF v_run.disposal_method = 'silme' THEN
        DELETE FROM public.auth_device_decisions d
         WHERE d.created_at < v_run.cutoff AND d.device_id <> zero
           AND NOT public.auth_retention_held_dec(d.device_id, d.actor_id);
      ELSE
        UPDATE public.auth_device_decisions d SET device_id = zero, actor_id = zero, note = NULL, created_at = date_trunc('day', d.created_at)
         WHERE d.created_at < v_run.cutoff AND d.device_id <> zero
           AND NOT public.auth_retention_held_dec(d.device_id, d.actor_id);
      END IF;
    ELSE
      DELETE FROM public.security_events s0
       WHERE s0.created_at < v_run.cutoff
         AND NOT public.auth_retention_held_sec(s0.user_id, s0.metadata);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> v_run.candidate_count THEN
      RAISE EXCEPTION 'affected_mismatch' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.auth_retention_context WHERE txid = txid_current();
  EXCEPTION WHEN OTHERS THEN
    -- Alt işlem geri alındı: HİÇBİR satır değişmedi (kısmi imha yok). Bağlam satırı da geri alındı.
    v_err := CASE WHEN SQLERRM IN ('policy_changed', 'count_mismatch', 'affected_mismatch') THEN SQLERRM ELSE 'sql_' || lower(SQLSTATE) END;
    UPDATE public.auth_retention_runs SET state = 'failed', error_code = v_err, executed_by = v_actor, executed_at = now() WHERE id = v_run.id;
    -- Çalıştırma kalıcı olarak 'failed' → bu çalıştırmaya bağlı kanıt artık kullanılamaz; açık bırakılmaz.
    PERFORM public.auth_step_up_consume(v_proof);
    INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id, detail)
    VALUES (v_run.id, v_run.table_name, 'execute_failed', v_actor, jsonb_build_object('error', v_err));
    RETURN jsonb_build_object('ok', false, 'code', 'failed', 'error', v_err);
  END;

  UPDATE public.auth_retention_runs SET state = 'completed', executed_by = v_actor, executed_at = now(), affected_count = v_n WHERE id = v_run.id;
  PERFORM public.auth_step_up_consume(v_proof);
  INSERT INTO public.auth_retention_log (run_id, table_name, action, actor_id, detail)
  VALUES (v_run.id, v_run.table_name, 'execute', v_actor,
          jsonb_build_object('method', v_run.disposal_method, 'affected', v_n, 'held', v_c.held, 'cutoff', v_run.cutoff));
  RETURN jsonb_build_object('ok', true, 'affected', v_n, 'held', v_c.held, 'method', v_run.disposal_method);
END $$;
REVOKE ALL ON FUNCTION public.auth_retention_execute(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_execute(text, uuid, text) TO service_role;


-- ── I11) Tablo kimliği yardımcısı yalnız sunucu rolüne ──
REVOKE ALL ON FUNCTION public.auth_retention_table_uuid(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_retention_table_uuid(text) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 900 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
