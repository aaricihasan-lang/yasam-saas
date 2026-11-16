-- GİRİŞ GÜVENLİĞİ F2-I — 17.11.2026 bağımsız güvenlik denetiminin bulguları (hata → FAIL). Yerel embedded-pg; prod'a
-- temas YOK; sentetik kullanıcılar; SENTETİK saklama süreleri / gerekçeler (gerçek hukuki karar DEĞİLDİR).
-- Zincir: session-model + f2a…f2d fixture'ları → F2-A…F2-H migration'ları ; migration: 20280103000900 (iki kez).
-- Her madde ayrı kaydedilir; sonda bulunan BÜTÜN ihlaller tek hata olarak raporlanır (hangi kusurların yeniden
-- üretildiği tek koşuda görülsün diye).

CREATE TEMP TABLE f2i_fail (id serial, msg text);
CREATE FUNCTION pg_temp.fail(p text) RETURNS void LANGUAGE sql AS $$ INSERT INTO f2i_fail (msg) VALUES (p); $$;
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
CREATE FUNCTION pg_temp.proof(p_token text, p_action text, p_target uuid, p_dev uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.auth_owner_step_up_begin(p_token, p_action, p_target);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'proof begin: %', r; END IF;
  PERFORM public.auth_qr_decide((r->>'challenge_id')::uuid, r->>'qr_nonce', p_dev, 'approve', r->>'match_code');
  RETURN (r->>'challenge_id')::uuid;
END $$;
-- E-posta kodu: üret + "gönderildi" işaretle + doğrula (sağlayıcı yok; yalnız DB adımları).
CREATE FUNCTION pg_temp.otp(p_user uuid, p_purpose text, p_ch uuid, p_code text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  BEGIN
    r := public.auth_email_otp_issue(p_user, p_purpose, p_ch, pg_temp.h(p_code), pg_temp.h('to'), 'synthetic', 1800, 1500);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'stage', 'issue', 'sqlstate', SQLSTATE);
  END;
  IF NOT coalesce((r->>'ok')::boolean, false) THEN RETURN r || jsonb_build_object('stage', 'issue'); END IF;
  PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, NULL);
  RETURN public.auth_email_otp_verify(p_user, p_purpose, p_ch, pg_temp.h(p_code)) || jsonb_build_object('stage', 'verify');
END $$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  VE2   constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  OLD_T constant timestamptz := now() - interval '400 days' + interval '3 hours 17 minutes 5.123456 seconds';
  r jsonb; n bigint; odev uuid; vedev uuid; ch uuid; run uuid; hashes text[]; v_ok boolean;
BEGIN
  UPDATE public.users SET email_verified_at = now() - interval '2 days' WHERE id IN (OWNER, VE, VE2);
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id = OWNER;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (OWNER, repeat('O', 120), pg_temp.h('owner-phone'), 'ABCD-EFGH', 'active', now()) RETURNING id INTO odev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (VE, repeat('V', 120), pg_temp.h('ve-phone'), 'VVVV-EEEE', 'active', now()) RETURNING id INTO vedev;
  PERFORM pg_temp.sess(OWNER, 'o', 'qr_device', interval '10 minutes');   -- oturum, aşağıdaki e-posta işlemlerinden ÖNCE açıldı
  SELECT array_agg(pg_temp.h('rc-' || g)) INTO hashes FROM generate_series(1, 10) g;

  -- ── I1 (BLOCKER) Çalınmış taze Owner oturumu: Owner e-postası değiştirilip YENİDEN doğrulanır → e-posta ile
  --    işleme özel kanıt alınamamalı (aksi halde mfa_disable / device_approve / imha kanıtı saldırganın kutusuna gider).
  UPDATE public.users SET email = 'zz.saldirgan@example.test' WHERE id = OWNER;      -- admin düzenleme rotasının yaptığı
  IF (SELECT email_verified_at FROM public.users WHERE id = OWNER) IS NOT NULL THEN PERFORM pg_temp.fail('I1-ön e-posta değişince doğrulama sıfırlanmalı'); END IF;
  r := pg_temp.otp(OWNER, 'verify_email', NULL, '111111');                             -- /api/me/email-verification
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I1-ön kendi adresini doğrulama akışı çalışmalı: ' || r::text); END IF;
  r := public.auth_owner_step_up_begin('o', 'mfa_disable', VE2);
  ch := (r->>'challenge_id')::uuid;
  IF coalesce((r->>'email_verified')::boolean, false) THEN
    PERFORM pg_temp.fail('I1a oturum açıldıktan SONRA doğrulanan e-posta işleme özel kanıt yöntemi olarak sunulmamalı');
  END IF;
  r := pg_temp.otp(OWNER, 'login', ch, '222222');
  IF coalesce((r->>'ok')::boolean, false) THEN
    PERFORM pg_temp.fail('I1b BLOCKER: oturum içinde yeniden doğrulanan e-postayla işleme özel kanıt alındı (' || (r->>'stage') || ')');
  END IF;
  r := public.auth_mfa_set_required('o', VE2, false, 'saldırı');
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I1c BLOCKER: başkasının MFA zorunluluğu kapatıldı'); END IF;
  -- Meşru yol bozulmadı: oturumdan ÖNCE doğrulanmış e-posta ile kanıt alınabilir.
  UPDATE public.users SET email_verified_at = now() - interval '1 hour' WHERE id = OWNER;
  r := public.auth_owner_step_up_begin('o', 'mfa_disable', VE2);
  IF NOT coalesce((r->>'email_verified')::boolean, false) THEN PERFORM pg_temp.fail('I1d oturumdan önce doğrulanmış e-posta kanıt yöntemi olarak sunulmalı'); END IF;
  r := pg_temp.otp(OWNER, 'login', (r->>'challenge_id')::uuid, '333333');
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I1e meşru e-posta kanıtı çalışmalı: ' || r::text); END IF;
  UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = OWNER AND purpose = 'step_up';

  -- ── I2 (HIGH) QR cihazı olan kullanıcı, e-posta koduyla açılmış oturumda kurtarma kodu üretememeli (aksi halde
  --    parola + e-posta kutusu → kurtarma kodu → e-posta değişikliği → kalıcı devralma).
  PERFORM pg_temp.sess(VE, 've-email', 'email_otp');
  r := public.auth_recovery_codes_generate('ve-email', hashes);
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I2a HIGH: QR cihazlı kullanıcı e-posta oturumunda kurtarma kodu üretti'); END IF;
  PERFORM pg_temp.sess(VE, 've-qr', 'qr_device');
  r := public.auth_recovery_codes_generate('ve-qr', (SELECT array_agg(pg_temp.h('rcq-' || g)) FROM generate_series(1, 10) g));
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I2b QR oturumunda üretim çalışmalı: ' || r::text); END IF;
  PERFORM pg_temp.sess(VE2, 've2-email', 'email_otp');                                -- cihazı yok: tek yöntemi e-posta
  r := public.auth_recovery_codes_generate('ve2-email', (SELECT array_agg(pg_temp.h('rc2-' || g)) FROM generate_series(1, 10) g));
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I2c cihazı olmayan kullanıcı e-posta oturumunda üretebilmeli: ' || r::text); END IF;

  -- ── I3 (HIGH) MFA zorunlu yapılınca parola-yalnız (MFA'sız) açık oturumlar sona ermeli.
  PERFORM pg_temp.sess(AND1, 'and1-pw', NULL);
  UPDATE public.users SET email_verified_at = now() - interval '1 day' WHERE id = AND1;
  r := public.auth_mfa_set_required('o', AND1, true, 'test');
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I3-ön zorunluluk açılmalı: ' || r::text); END IF;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE session_token = 'and1-pw' AND is_active) THEN
    PERFORM pg_temp.fail('I3 HIGH: MFA zorunlu yapıldıktan sonra MFA''sız eski oturum açık kaldı');
  END IF;

  -- ── I4 Parola değişince açık (bekleyen / doğrulanmış) giriş isteği tamamlanamamalı.
  INSERT INTO public.auth_mfa_challenges (user_id, browser_secret_hash, created_at, expires_at)
  VALUES (VE2, pg_temp.h('b'), now(), now() + interval '5 minutes') RETURNING id INTO ch;
  UPDATE public.users SET password_hash = 'x' WHERE id = VE2;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) IN ('pending', 'verified') THEN
    PERFORM pg_temp.fail('I4 parola değişince açık giriş isteği reddedilmeli');
  END IF;
  INSERT INTO public.auth_mfa_challenges (user_id, browser_secret_hash, created_at, expires_at)
  VALUES (VE2, pg_temp.h('b2'), now(), now() + interval '5 minutes') RETURNING id INTO ch;
  UPDATE public.users SET active = false WHERE id = VE2;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) IN ('pending', 'verified') THEN
    PERFORM pg_temp.fail('I4b hesap pasifleşince açık giriş isteği reddedilmeli');
  END IF;
  UPDATE public.users SET active = true WHERE id = VE2;

  -- ── I5 Oturum satırı başka kullanıcıya taşınamamalı.
  BEGIN
    UPDATE public.user_sessions SET user_id = VE WHERE session_token = 've2-email';
    PERFORM pg_temp.fail('I5 oturumun kullanıcısı değiştirilebildi');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── I6 Başkasının cihazını iptal (Owner) taze MFA ister; kendi cihazını iptal serbest.
  PERFORM pg_temp.sess(OWNER, 'o-stale', 'qr_device', interval '2 hours');
  r := public.auth_device_revoke('o-stale', vedev, 'test');
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I6a eski Owner oturumu başkasının cihazını iptal etti'); END IF;
  r := public.auth_device_revoke('o', vedev, 'test');
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I6b taze Owner oturumu iptal edebilmeli: ' || r::text); END IF;

  -- ── I7 QR isteği telefona amacını bildirir (giriş mi, kritik işlem mi).
  r := public.auth_owner_step_up_begin('o', 'device_approve', VE);
  r := public.auth_qr_fetch((r->>'challenge_id')::uuid, r->>'qr_nonce', odev);
  IF r->>'purpose' IS DISTINCT FROM 'step_up' OR r->>'action' IS DISTINCT FROM 'device_approve' THEN
    PERFORM pg_temp.fail('I7 QR isteği amacı (step_up / işlem) telefona iletilmeli: ' || r::text);
  END IF;
  UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = OWNER AND purpose = 'step_up';

  -- ── I8 Parola sıfırlama için işleme özel kanıt (MFA kullanan Owner).
  BEGIN
  r := public.auth_owner_step_up_take('o', 'password_reset', VE);
  IF r->>'code' IS DISTINCT FROM 'step_up_required' THEN PERFORM pg_temp.fail('I8a kanıtsız parola sıfırlama reddedilmeli: ' || coalesce(r::text, 'null')); END IF;
  PERFORM pg_temp.proof('o', 'password_reset', VE, odev);
  r := public.auth_owner_step_up_take('o', 'password_reset', VE2);
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I8b başka hedefin kanıtı kullanılamamalı'); END IF;
  r := public.auth_owner_step_up_take('o', 'password_reset', VE);
  IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I8c kanıtla parola sıfırlama: ' || r::text); END IF;
  r := public.auth_owner_step_up_take('o', 'password_reset', VE);
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I8d kanıt tek kullanımlık olmalı'); END IF;
  r := public.auth_owner_step_up_take('o-stale', 'password_reset', VE);
  IF coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I8e eski Owner oturumu kanıtsız geçememeli'); END IF;
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.fail('I8 parola sıfırlama kanıt fonksiyonu yok / hata: ' || SQLERRM);
  END;

  -- ── I9 Yasal saklama: kişinin CİHAZINA ait kararlar ve ayrıntıda geçen kişi kimliği de korunur.
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed, created_at)
  VALUES (vedev, OWNER, 'approve', 'telefon', true, OLD_T);
  INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, detail, created_at)
  VALUES (OWNER, OWNER, 'step_up_requested', jsonb_build_object('target', VE), OLD_T);
  PERFORM public.auth_retention_hold_set('o', 'subject_user', VE, 'Sentetik test — dava');
  SELECT held INTO n FROM public.auth_retention_count('auth_device_decisions', now() - interval '300 days');
  IF n < 1 THEN PERFORM pg_temp.fail('I9a kişi saklamadayken kişinin cihazına ait karar imha adayı sayıldı'); END IF;
  SELECT held INTO n FROM public.auth_retention_count('auth_recovery_events', now() - interval '300 days');
  IF n < 1 THEN PERFORM pg_temp.fail('I9b kişi saklamadayken ayrıntısında kişi geçen olay imha adayı sayıldı'); END IF;

  -- ── I10 Anonimleştirme saat bilgisini güne yuvarlar (aynı anlı diğer tablolarla eşleştirmeyle kimlik geri bulunamaz).
  PERFORM public.auth_retention_hold_release('o', (SELECT id FROM public.auth_retention_holds WHERE released_at IS NULL LIMIT 1));
  BEGIN
    PERFORM pg_temp.proof('o', 'retention_policy', public.auth_retention_table_uuid('auth_recovery_events'), odev);
    r := public.auth_retention_policy_set('o', 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'anonimlestirme', NULL);
    r := public.auth_retention_preview('o', 'auth_recovery_events');
    run := (r->>'run_id')::uuid;
    PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
    r := public.auth_retention_execute('o', run, r->>'confirm_text');
    IF NOT coalesce((r->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('I10-ön anonimleştirme yürütülmeli: ' || r::text); END IF;
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.fail('I10-ön hata: ' || SQLERRM);
  END;
  IF EXISTS (SELECT 1 FROM public.auth_recovery_events WHERE subject_user_id = '00000000-0000-0000-0000-000000000000'
               AND created_at <> date_trunc('day', created_at)) THEN
    PERFORM pg_temp.fail('I10 anonimleştirilen satırda tam zaman damgası kaldı (eşleştirme ile kimlik geri bulunabilir)');
  END IF;

  -- ── I11 Yardımcı tablo-kimliği fonksiyonu yalnız sunucu rolüne açık.
  IF has_function_privilege('anon', 'public.auth_retention_table_uuid(text)', 'EXECUTE') THEN
    PERFORM pg_temp.fail('I11 auth_retention_table_uuid anon''a açık');
  END IF;

  SELECT count(*) INTO n FROM f2i_fail;
  IF n > 0 THEN
    RAISE EXCEPTION 'F2-I: % ihlal → %', n, (SELECT string_agg(msg, ' | ' ORDER BY id) FROM f2i_fail);
  END IF;
END $$;
