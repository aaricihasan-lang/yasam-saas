-- GİRİŞ GÜVENLİĞİ F2-G davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar.
-- Zincir: session-model + f2a…f2d fixture'ları → F2-A…F2-F migration'ları ; migration: 20280103000700 (iki kez).
-- Test kısayolu: MFA'lı oturum / cihaz satırları postgres rolüyle kurulur (üretimde yalnız F2 akışlarıyla).

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
  VALUES (p_user, repeat('G', 120), pg_temp.h(p_fp), 'ABCD-EFGH', 'Pixel', p_state, CASE WHEN p_state = 'active' THEN now() END) RETURNING id;
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  r jsonb; s jsonb; n int; t text; odev uuid; adev uuid; xdev uuid; ldev uuid; ch uuid; ch2 uuid; cid uuid; nonce text; mc text; bh text;
BEGIN
  -- Kurulum: Owner + uzmanlar e-posta doğrulanmış ve MFA zorunlu; Owner'ın aktif güvenilir telefonu; AND1'in telefonu.
  UPDATE public.users SET email_verified_at = now() WHERE id IN (OWNER, EXP, AND1, VE);
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id IN (OWNER, EXP, AND1, VE);
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  odev := pg_temp.dev(OWNER, 'owner-phone', 'active');
  adev := pg_temp.dev(AND1, 'and1-phone', 'active');
  PERFORM pg_temp.sess(OWNER, 'o-stolen', 'qr_device', interval '5 minutes');   -- saldırganın çaldığı TAZE oturum
  PERFORM pg_temp.sess(OWNER, 'o-real', 'qr_device');                          -- Owner'ın kendi oturumu
  PERFORM pg_temp.sess(OWNER, 'o-stale', 'qr_device', interval '31 minutes');
  PERFORM pg_temp.sess(ADM2, 'a2', 'qr_device');

  -- ══ SALDIRI: yalnız çalınmış, 5 dk'lık Owner oturumu (parola / telefon / e-posta YOK) ══════════════════
  -- Saldırgan uzmanın parolasını sıfırlar (Owner yetkisi) ve kendi telefonunu uzman adına eşleştirir.
  UPDATE public.users SET password_hash = 'saldirganin-parolasi' WHERE id = EXP;
  r := public.auth_device_enroll_begin(EXP, repeat('X', 120), pg_temp.h('attacker-phone'), 'ATCK-PHON', 'Saldırgan', 34, '2.0.0', 'iph', NULL, NULL);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'S0 kurulum: %', r; END IF;
  xdev := (r->>'device_id')::uuid;
  r := public.auth_device_owner_decide('o-stolen', xdev, 'approve', true, 'telefon', 'aradım (yalan)');
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'S1 taze çalınmış oturum TEK BAŞINA onaylayamaz: %', r; END IF;
  -- Saldırgan onay isteği açabilir ama DOĞRULAYAMAZ:
  r := public.auth_owner_step_up_begin('o-stolen', 'device_approve', xdev);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'S2 istek açılır: %', r; END IF;
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce'; mc := r->>'match_code';
  r := public.auth_qr_decide(ch, nonce, adev, 'approve', mc);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'S3 başka kullanıcının telefonu Owner isteğini onaylayamaz: %', r; END IF;
  -- Saldırganın kendi (henüz onaysız) cihazı da onaylayamaz.
  r := public.auth_qr_decide(ch, nonce, xdev, 'approve', mc);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'S4 onaysız cihaz onaylayamaz: %', r; END IF;
  SELECT browser_secret_hash INTO bh FROM public.auth_mfa_challenges WHERE id = ch;
  r := public.auth_recovery_code_verify(ch, bh, pg_temp.h('herhangi'));
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'S5 kurtarma kodu step-up için GEÇMEZ: %', r; END IF;
  r := public.auth_finalize_login(ch, bh, 'stepup-session', '1.1.1.1', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL,
        now() + interval '1 day', false, true, 604800, 7200, 86400, 900, 2, 600);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'S6 step-up isteği oturum açamaz: %', r; END IF;
  -- E-posta kodu Owner'ın kutusuna gider; saldırgan tahmin eder → 5 yanlış → istek kalıcı red.
  r := public.auth_email_otp_issue(OWNER, 'login', ch, pg_temp.h('owner-code-123456'), pg_temp.h('to'), 'synthetic', 100000, 100000);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'S7 kod rezervasyonu: %', r; END IF;
  PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, 'm');
  FOR i IN 1..5 LOOP r := public.auth_email_otp_verify(OWNER, 'login', ch, pg_temp.h('tahmin-' || i)); END LOOP;
  IF r->>'reason' <> 'locked' OR (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) <> 'denied' THEN RAISE EXCEPTION 'S8 5 yanlış → red: %', r; END IF;
  r := public.auth_device_owner_decide('o-stolen', xdev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'S9 hâlâ onaylanamaz: %', r; END IF;
  IF (SELECT state FROM public.auth_trusted_devices WHERE id = xdev) <> 'pending_owner' THEN RAISE EXCEPTION 'S10 saldırgan cihazı beklemede kalır'; END IF;
  r := public.auth_mfa_set_required('o-stolen', EXP, false, 'kapat');
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'S11 MFA kapatma da kanıt ister: %', r; END IF;
  r := public.auth_recovery_case_open('o-stolen', EXP, 'telefon', 'kayıtlı numaradan arandı');
  cid := (r->>'case_id')::uuid;
  UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours',
         expires_at = expires_at - interval '73 hours' WHERE id = cid;
  UPDATE public.user_sessions SET created_at = created_at - interval '80 hours' WHERE user_id = EXP;
  r := public.auth_recovery_case_execute('o-stolen', cid, pg_temp.h('bilet'), true);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'S12 kurtarma yürütme de kanıt ister: %', r; END IF;
  IF (SELECT mfa_required FROM public.users WHERE id = EXP) IS NOT TRUE THEN RAISE EXCEPTION 'S13 uzmanın MFA''sı yerinde'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = EXP AND created_at > now() - interval '1 hour';
  IF n <> 0 THEN RAISE EXCEPTION 'S14 saldırgan uzman oturumu açamadı'; END IF;
  IF EXISTS (SELECT 1 FROM public.auth_recovery_codes WHERE user_id = EXP AND kind = 'case_ticket') THEN RAISE EXCEPTION 'S15 bilet üretilmedi'; END IF;

  -- ══ MEŞRU AKIŞ ve kanıtın bağları ═══════════════════════════════════════════════════════════════════
  ldev := pg_temp.dev(VE, 've-new-phone', 'pending_owner');
  r := public.auth_owner_step_up_begin('o-stale', 'device_approve', ldev);
  IF r->>'code' <> 'fresh_mfa_required' THEN RAISE EXCEPTION 'L0 bayat oturum istek açamaz: %', r; END IF;
  r := public.auth_owner_step_up_begin('a2', 'device_approve', ldev);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'L1 Owner olmayan istek açamaz: %', r; END IF;
  r := public.auth_owner_step_up_begin('o-real', 'device_approve', ldev);
  ch := (r->>'challenge_id')::uuid;
  IF NOT (r->>'has_device')::boolean OR NOT (r->>'email_verified')::boolean THEN RAISE EXCEPTION 'L2 yöntem bilgisi: %', r; END IF;
  s := public.auth_owner_step_up_status('o-stolen', ch);
  IF s->>'state' <> 'invalid' THEN RAISE EXCEPTION 'L3 başka oturum isteğin durumunu göremez: %', s; END IF;
  r := public.auth_qr_decide(ch, r->>'qr_nonce', odev, 'approve', r->>'match_code');
  IF r->>'result' <> 'approved' THEN RAISE EXCEPTION 'L4 Owner telefonu onaylar: %', r; END IF;
  IF (public.auth_owner_step_up_status('o-real', ch))->>'state' <> 'verified' THEN RAISE EXCEPTION 'L5 doğrulandı'; END IF;
  -- Kanıt OTURUMA bağlı: çalınmış başka oturum kullanamaz.
  r := public.auth_device_owner_decide('o-stolen', ldev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'L6 kanıt başka oturumda geçmez: %', r; END IF;
  -- Kanıt HEDEFE bağlı: saldırgan cihazı için kullanılamaz.
  r := public.auth_device_owner_decide('o-real', xdev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'L7 kanıt başka hedefte geçmez: %', r; END IF;
  -- Kanıt İŞLEME bağlı.
  r := public.auth_mfa_set_required('o-real', VE, false, 'kapat');
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'L8 kanıt başka işlemde geçmez: %', r; END IF;
  -- Çekirdek başarısızsa kanıt TÜKENMEZ (bağımsız kimlik teyidi kutusu işaretlenmedi).
  r := public.auth_device_owner_decide('o-real', ldev, 'approve', false, 'telefon', NULL);
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'L9 insan teyidi kuralı korunur: %', r; END IF;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) <> 'verified' THEN RAISE EXCEPTION 'L10 başarısız işlem kanıtı harcamaz'; END IF;
  r := public.auth_device_owner_decide('o-real', ldev, 'approve', true, 'telefon', 'kayıtlı numaradan arandı');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'L11 kanıt + teyit ile onay: %', r; END IF;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) <> 'consumed' THEN RAISE EXCEPTION 'L12 kanıt tüketildi'; END IF;
  -- Tek kullanım.
  ldev := pg_temp.dev(AND1, 'and1-second', 'pending_owner');
  r := public.auth_device_owner_decide('o-real', ldev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'L13 kanıt tek kullanımlık: %', r; END IF;
  -- Süre: 5 dk'yı geçen doğrulanmış kanıt kullanılamaz.
  r := public.auth_owner_step_up_begin('o-real', 'device_approve', ldev);
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_qr_decide(ch2, r->>'qr_nonce', odev, 'approve', r->>'match_code');
  UPDATE public.auth_mfa_challenges SET created_at = created_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes',
         verified_at = verified_at - interval '6 minutes' WHERE id = ch2;
  r := public.auth_device_owner_decide('o-real', ldev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'L14 süresi geçmiş kanıt: %', r; END IF;
  -- Yanlış eşleştirme sayısı → istek kalıcı red.
  r := public.auth_owner_step_up_begin('o-real', 'device_approve', ldev);
  ch2 := (r->>'challenge_id')::uuid;
  SELECT x INTO t FROM public.auth_mfa_challenges c, unnest(c.match_options) x WHERE c.id = ch2 AND x <> (r->>'match_code') LIMIT 1;
  r := public.auth_qr_decide(ch2, r->>'qr_nonce', odev, 'approve', t);
  IF r->>'result' <> 'denied' THEN RAISE EXCEPTION 'L15 yanlış sayı → red: %', r; END IF;
  -- E-posta yolu: MFA kapatma (başka kullanıcı) kanıtla.
  r := public.auth_owner_step_up_begin('o-real', 'mfa_disable', VE);
  ch2 := (r->>'challenge_id')::uuid;
  r := public.auth_email_otp_issue(OWNER, 'login', ch2, pg_temp.h('dogru-kod'), pg_temp.h('to'), 'synthetic', 100000, 100000);
  IF r->>'reason' = 'cooldown' THEN
    UPDATE public.auth_email_otps SET created_at = created_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds' WHERE user_id = OWNER;
    r := public.auth_email_otp_issue(OWNER, 'login', ch2, pg_temp.h('dogru-kod'), pg_temp.h('to'), 'synthetic', 100000, 100000);
  END IF;
  PERFORM public.auth_email_delivery_result((r->>'delivery_id')::bigint, true, NULL, 'm');
  r := public.auth_email_otp_verify(OWNER, 'login', ch2, pg_temp.h('dogru-kod'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'L16 e-posta kodu: %', r; END IF;
  r := public.auth_mfa_set_required('o-real', VE, false, 'Owner kanıtla kapattı');
  IF NOT (r->>'ok')::boolean OR (SELECT mfa_required FROM public.users WHERE id = VE) THEN RAISE EXCEPTION 'L17 kanıtla kapatma: %', r; END IF;
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = ch2) <> 'consumed' THEN RAISE EXCEPTION 'L18 tüketildi'; END IF;
  -- Açmak serbest; Owner kendini kapatamaz (eski kod).
  r := public.auth_mfa_set_required('o-real', VE, true, 'geri aç');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'L19 açmak kanıt istemez: %', r; END IF;
  r := public.auth_mfa_set_required('o-real', OWNER, false, 'kendim');
  IF r->>'code' <> 'self_disable_forbidden' THEN RAISE EXCEPTION 'L20 eski kural: %', r; END IF;
  -- RET kanıt istemez (yalnız yetki azaltır).
  r := public.auth_device_owner_decide('o-real', xdev, 'reject', false, NULL, 'saldırgan cihazı');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'L23 ret kanıtsız: %', r; END IF;
  -- Kurtarma yürütme kanıtla (meşru Owner).
  r := public.auth_owner_step_up_begin('o-real', 'recovery_execute', cid);
  PERFORM public.auth_qr_decide((r->>'challenge_id')::uuid, r->>'qr_nonce', odev, 'approve', r->>'match_code');
  r := public.auth_recovery_case_execute('o-real', cid, pg_temp.h('bilet'), true);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'L21 kanıtla yürütme: %', r; END IF;
  -- Owner cihazı iptal edilince onun onayladığı (henüz kullanılmamış) kanıt da geçersiz.
  r := public.auth_owner_step_up_begin('o-real', 'device_approve', ldev);
  ch2 := (r->>'challenge_id')::uuid;
  PERFORM public.auth_qr_decide(ch2, r->>'qr_nonce', odev, 'approve', r->>'match_code');
  PERFORM public.auth_device_revoke('o-real', odev, 'test');
  r := public.auth_device_owner_decide('o-real', ldev, 'approve', true, 'telefon', NULL);
  IF r->>'code' NOT IN ('step_up_required', 'forbidden') THEN RAISE EXCEPTION 'L22 iptal cihazın kanıtı geçmez: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_recovery_events WHERE event = 'step_up_used' AND subject_user_id = OWNER;
  IF n <> 3 THEN RAISE EXCEPTION 'L24 kullanılan kanıtlar denetimde (%)', n; END IF;

  -- ══ Saklama politikası (yalnız kayıt + kuru sayım) ═══════════════════════════════════════════════════
  SELECT count(*) INTO n FROM public.auth_audit_retention_policy WHERE retention_days IS NULL AND disposal_method = 'karar_bekliyor';
  IF n <> 3 THEN RAISE EXCEPTION 'R1 varsayılan politika KARARSIZ (%)', n; END IF;
  IF (SELECT data_class FROM public.auth_audit_retention_policy WHERE table_name = 'auth_recovery_events') <> 'takma_adli_kisisel_veri' THEN
    RAISE EXCEPTION 'R2 korunan kayıtlar anonim SAYILMAZ';
  END IF;
  BEGIN
    UPDATE public.auth_audit_retention_policy SET retention_days = 365, disposal_method = 'silme' WHERE table_name = 'auth_recovery_events';
    RAISE EXCEPTION 'R3 hukuki gerekçe / karar veren olmadan süre girilemez';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.auth_recovery_events;
  PERFORM * FROM public.auth_audit_retention_report();
  IF (SELECT count(*) FROM public.auth_recovery_events) <> n THEN RAISE EXCEPTION 'R4 rapor hiçbir şey silmez'; END IF;
  IF (SELECT past_retention FROM public.auth_audit_retention_report() WHERE table_name = 'auth_recovery_events') IS NOT NULL THEN
    RAISE EXCEPTION 'R5 karar yokken süresi dolan sayısı hesaplanmaz';
  END IF;
  IF has_table_privilege('service_role', 'public.auth_audit_retention_policy', 'UPDATE')
     OR has_function_privilege('service_role', 'public.auth_audit_retention_report()', 'EXECUTE') THEN
    RAISE EXCEPTION 'R6 politika yalnız veritabanı yöneticisine';
  END IF;
  BEGIN
    DELETE FROM public.auth_recovery_events;
    RAISE EXCEPTION 'R7 değiştirilemezlik yerinde';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOREACH t IN ARRAY ARRAY['public.auth_step_up_lock(text,text,uuid)', 'public.auth_step_up_consume(uuid)'] LOOP
    IF has_function_privilege('service_role', t, 'EXECUTE') THEN RAISE EXCEPTION 'R8 % iç fonksiyon', t; END IF;
  END LOOP;
  RAISE NOTICE 'session-f2g-assert: GEÇTİ';
END $$;
