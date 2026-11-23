-- GİRİŞ GÜVENLİĞİ F2-C davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK.
-- Zincir (fixture): session-model + f2a + f2b + f2c fixture'ları → 20270129000200 → 20271003200000 →
--   20271003200100 → F2-A → F2-B 000100 → 000200 ; migration: 20280103000300 (iki kez).
-- İmza doğrulaması (ECDSA) uygulama katmanındadır (f2c-routes harness'ı gerçek anahtarla sınar);
-- burada DB durum makinesi + yetki + bağlama kuralları sınanır.

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
CREATE FUNCTION pg_temp.enroll(p_user uuid, p_key text, p_boot text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_device_enroll_begin(p_user, repeat('A', 120), pg_temp.h(p_key), 'ABCD-EFGH', 'Pixel 8', 34, '2.0.0', 'iph', p_boot);
$$;
CREATE FUNCTION pg_temp.fin(p_ch uuid, p_hash text, p_tok text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_finalize_login(p_ch, p_hash, p_tok, '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
    'desktop', 'desktop_web', NULL, now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600);
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  EXP   constant uuid := '00000000-0000-0000-0000-00000000e0f2';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  FREE  constant uuid := '00000000-0000-0000-0000-00000000e001';
  r jsonb; n int; t text; dev uuid; dev2 uuid; odev uuid; ch uuid; nonce text; code text; boot text;
BEGIN
  -- Aktör oturumları: Owner MFA'lı (kanıtlı), Owner MFA'sız, ADM2, EXP.
  PERFORM public.create_session_admin_web(OWNER, 'f2c-owner-plain', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  PERFORM public.create_session_admin_web(ADM2, 'f2c-adm2', '203.0.113.9', 'TR', 'I', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day');
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
  VALUES (OWNER, 'f2c-owner-mfa', true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device'),
         (EXP, 'f2c-exp-self', true, 'desktop_web', 'expert', now() + interval '1 day', NULL);
  PERFORM set_config('yasam.mfa_finalize', 'off', true);

  -- ── A) Başlangıç: yöntem yok → zorunluluk açılamaz; zil CHECK'i mevcut satırı bozmadı ─
  IF public.auth_mfa_user_has_method(EXP) THEN RAISE EXCEPTION 'A1 cihaz yokken yöntem yok'; END IF;
  r := public.auth_mfa_set_required('f2c-owner-plain', EXP, true, 'erken');
  IF r->>'code' <> 'no_method' THEN RAISE EXCEPTION 'A2 cihazsız zorunluluk reddedilmeli: %', r; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'basvuru';
  IF n <> 1 THEN RAISE EXCEPTION 'A3 mevcut zil kaydı korunmalı'; END IF;

  -- ── B) Eşleştirme isteği: pending_owner + zil + tekil kurallar ─────────────
  r := pg_temp.enroll(EXP, 'k-exp-1');
  IF NOT (r->>'ok')::boolean OR r->>'state' <> 'pending_owner' THEN RAISE EXCEPTION 'B1 eşleştirme isteği: %', r; END IF;
  dev := (r->>'device_id')::uuid;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE type = 'cihaz_eslesme' AND kind = 'action'
     AND target_user_id = EXP AND resolved_at IS NULL AND payload->>'device_id' = dev::text;
  IF n <> 1 THEN RAISE EXCEPTION 'B2 Owner Bildirim Zili''ne cihaz_eslesme düşmeli'; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = EXP AND session_token <> 'f2c-exp-self';
  IF n <> 0 THEN RAISE EXCEPTION 'B3 eşleştirme oturum açmamalı'; END IF;
  r := pg_temp.enroll(EXP, 'k-exp-2');
  IF r->>'reason' <> 'pending_exists' THEN RAISE EXCEPTION 'B4 tek bekleyen eşleştirme: %', r; END IF;
  r := pg_temp.enroll(AND1, 'k-exp-1');
  IF r->>'reason' <> 'key_in_use' THEN RAISE EXCEPTION 'B5 aynı anahtar başka hesapta kullanılamaz: %', r; END IF;
  r := public.auth_device_status(dev);
  IF r->>'state' <> 'pending_owner' OR r ? 'activation_nonce' THEN RAISE EXCEPTION 'B6 bekleyen durumda nonce yok: %', r; END IF;
  IF public.auth_device_public_key(dev) IS NOT NULL THEN RAISE EXCEPTION 'B7 bekleyen cihazın anahtarı imza için verilmemeli'; END IF;

  -- ── C) Owner kararı: yalnız MFA'lı Owner; doğrulama teyidi; kendi cihazı YASAK ─
  r := public.auth_device_owner_decide('f2c-owner-plain', dev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'C1 MFA''sız Owner oturumu karar veremez: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-adm2', dev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'C2 Owner olmayan admin karar veremez: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-exp-self', dev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'C3 uzman kendi cihazını onaylayamaz: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-owner-mfa', dev, 'approve', false, 'telefon', NULL);
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'C4 parmak izi teyidi zorunlu: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-owner-mfa', dev, 'approve', true, 'eposta', NULL);
  IF r->>'code' <> 'verification_required' THEN RAISE EXCEPTION 'C5 yalnız telefon/yüz yüze doğrulama: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-owner-mfa', dev, 'approve', true, 'telefon', 'kayıtlı numaradan arandı');
  IF NOT (r->>'ok')::boolean OR r->>'state' <> 'owner_approved' THEN RAISE EXCEPTION 'C6 Owner onayı: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE user_id = EXP AND session_token <> 'f2c-exp-self';
  IF n <> 0 THEN RAISE EXCEPTION 'C7 Owner onayı OTURUM AÇMAMALI'; END IF;
  IF public.auth_mfa_user_has_method(EXP) THEN RAISE EXCEPTION 'C8 Owner onayı cihazı tek başına güvenilir yapmamalı'; END IF;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE event_key = 'cihaz_eslesme:' || dev AND resolution = 'cihaz_onaylandi';
  IF n <> 1 THEN RAISE EXCEPTION 'C9 zil bildirimi çözülmeli'; END IF;
  r := public.auth_device_owner_decide('f2c-owner-mfa', dev, 'reject', false, NULL, NULL);
  IF r->>'code' <> 'not_pending' THEN RAISE EXCEPTION 'C10 karar tekrar verilemez: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_device_decisions WHERE device_id = dev AND decision = 'approve' AND fingerprint_confirmed AND verification_method = 'telefon';
  IF n <> 1 THEN RAISE EXCEPTION 'C11 karar kaydı'; END IF;
  BEGIN
    UPDATE public.auth_device_decisions SET note = 'değiştir' WHERE device_id = dev;
    RAISE EXCEPTION 'C12 karar kaydı değiştirilememeli';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Owner kendi cihazını panelden onaylayamaz.
  r := pg_temp.enroll(OWNER, 'k-owner-panel');
  odev := (r->>'device_id')::uuid;
  r := public.auth_device_owner_decide('f2c-owner-mfa', odev, 'approve', true, 'telefon', NULL);
  IF r->>'code' <> 'self_approval_forbidden' THEN RAISE EXCEPTION 'C13 Owner kendi cihazını onaylayamaz: %', r; END IF;
  r := public.auth_device_owner_decide('f2c-owner-mfa', odev, 'reject', false, NULL, NULL);
  IF r->>'code' <> 'self_approval_forbidden' THEN RAISE EXCEPTION 'C14 kendi cihazı için karar yok: %', r; END IF;

  -- ── D) Aktivasyon (cihaz imzası uygulamada doğrulanır; DB nonce + süre) ────
  r := public.auth_device_status(dev);
  nonce := r->>'activation_nonce';
  IF r->>'state' <> 'owner_approved' OR nonce IS NULL THEN RAISE EXCEPTION 'D1 onaylı durumda nonce: %', r; END IF;
  r := public.auth_device_activate(dev, 'yanlis-nonce-yanlis-nonce-yanlis!');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'D2 yanlış nonce: %', r; END IF;
  r := public.auth_device_activate(dev, nonce);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D3 aktivasyon: %', r; END IF;
  r := public.auth_device_activate(dev, nonce);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'D4 aktivasyon tekrarlanamaz'; END IF;
  IF NOT public.auth_mfa_user_has_method(EXP) THEN RAISE EXCEPTION 'D5 aktif cihaz → yöntem var'; END IF;
  IF (public.auth_device_public_key(dev))->>'state' <> 'active' THEN RAISE EXCEPTION 'D6 aktif cihaz anahtarı'; END IF;
  -- Süresi dolmuş aktivasyon.
  r := pg_temp.enroll(AND1, 'k-and-1');
  dev2 := (r->>'device_id')::uuid;
  PERFORM public.auth_device_owner_decide('f2c-owner-mfa', dev2, 'approve', true, 'yuz_yuze', NULL);
  UPDATE public.auth_trusted_devices SET activation_expires_at = now() - interval '1 second' WHERE id = dev2;
  r := public.auth_device_activate(dev2, (SELECT activation_nonce FROM public.auth_trusted_devices WHERE id = dev2));
  IF r->>'reason' <> 'expired' THEN RAISE EXCEPTION 'D7 süresi dolmuş aktivasyon: %', r; END IF;
  -- Yeniden eşleştirme (ikinci telefon, AND1).
  r := pg_temp.enroll(AND1, 'k-and-2');
  dev2 := (r->>'device_id')::uuid;
  PERFORM public.auth_device_owner_decide('f2c-owner-mfa', dev2, 'approve', true, 'yuz_yuze', NULL);
  PERFORM public.auth_device_activate(dev2, (SELECT activation_nonce FROM public.auth_trusted_devices WHERE id = dev2));

  -- ── E) QR: yalnız doğru kullanıcının aktif cihazı + doğru nonce + doğru kod ─
  r := public.auth_mfa_set_required('f2c-owner-plain', EXP, true, 'QR testi');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E0 aktif cihazlı kullanıcı zorunlu yapılabilir: %', r; END IF;
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-1'), 'desktop_web', 'x', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', 300);
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce'; code := r->>'match_code';
  IF nonce !~ '^[A-Za-z0-9_-]{32}$' OR code !~ '^[0-9]{2}$' THEN RAISE EXCEPTION 'E1 QR nonce/kod: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_mfa_challenges WHERE id = ch AND qr_nonce_hash = pg_temp.h(nonce)
     AND array_length(match_options, 1) = 3 AND code = ANY (match_options);
  IF n <> 1 THEN RAISE EXCEPTION 'E2 nonce yalnız özet; 3 seçenek içinde doğru kod'; END IF;
  r := public.auth_qr_fetch(ch, nonce, dev2);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E3 başka uzmanın telefonu isteği OKUYAMAZ: %', r; END IF;
  r := public.auth_qr_decide(ch, nonce, dev2, 'approve', code);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E4 başka uzmanın telefonu ONAYLAYAMAZ: %', r; END IF;
  r := public.auth_qr_fetch(ch, 'X' || substr(nonce, 2), dev);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E5 yanlış QR nonce: %', r; END IF;
  r := public.auth_qr_fetch(ch, nonce, dev);
  IF NOT (r->>'ok')::boolean OR jsonb_array_length(r->'options') <> 3 THEN RAISE EXCEPTION 'E6 doğru cihaz okur: %', r; END IF;
  r := public.auth_qr_decide(ch, nonce, dev, 'approve', CASE WHEN code = '00' THEN '01' ELSE '00' END);
  IF r->>'result' <> 'denied' THEN RAISE EXCEPTION 'E7 yanlış kod → kalıcı red: %', r; END IF;
  SELECT denied_reason INTO t FROM public.auth_mfa_challenges WHERE id = ch;
  IF t <> 'wrong_match' THEN RAISE EXCEPTION 'E8 red nedeni wrong_match (%)', t; END IF;
  r := public.auth_qr_decide(ch, nonce, dev, 'approve', code);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E9 reddedilen QR yeniden onaylanamaz: %', r; END IF;
  r := pg_temp.fin(ch, pg_temp.h('bind-1'), 'f2c-tok-denied');
  IF r->>'reason' <> 'denied' THEN RAISE EXCEPTION 'E10 reddedilen challenge oturum açamaz: %', r; END IF;
  -- Kullanıcı reddi.
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-2'), 'desktop_web', 'x', 'UA', 300);
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce';
  r := public.auth_qr_decide(ch, nonce, dev, 'deny', NULL);
  IF r->>'result' <> 'denied' THEN RAISE EXCEPTION 'E11 ret: %', r; END IF;
  -- Onay → tek oturum; QR ikinci kez kullanılamaz.
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-3'), 'desktop_web', 'x', 'UA', 300);
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce'; code := r->>'match_code';
  r := public.auth_qr_decide(ch, nonce, dev, 'approve', code);
  IF r->>'result' <> 'approved' THEN RAISE EXCEPTION 'E12 onay: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_mfa_challenges WHERE id = ch AND state = 'verified' AND method = 'qr_device' AND approved_device_id = dev;
  IF n <> 1 THEN RAISE EXCEPTION 'E13 challenge verified + onaylayan cihaz'; END IF;
  r := public.auth_qr_decide(ch, nonce, dev, 'approve', code);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E14 QR ikinci kez onaylanamaz: %', r; END IF;
  r := pg_temp.fin(ch, pg_temp.h('baska-tarayici'), 'f2c-tok-thief');
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E15 QR başka tarayıcıya aktarılarak oturum açılamaz: %', r; END IF;
  r := pg_temp.fin(ch, pg_temp.h('bind-3'), 'f2c-tok-ok');
  IF NOT (r->>'inserted')::boolean THEN RAISE EXCEPTION 'E16 başlatan tarayıcı oturum açar: %', r; END IF;
  -- Süresi dolmuş QR.
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-4'), 'desktop_web', 'x', 'UA', 300);
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce'; code := r->>'match_code';
  UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = ch;
  r := public.auth_qr_decide(ch, nonce, dev, 'approve', code);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'E17 süresi dolmuş QR onaylanamaz: %', r; END IF;

  -- ── F) Cihaz iptali: onayladığı oturumlar kapanır, cihaz bir daha kabul edilmez ─
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-5'), 'desktop_web', 'x', 'UA', 300);
  ch := (r->>'challenge_id')::uuid; nonce := r->>'qr_nonce'; code := r->>'match_code';
  PERFORM public.auth_qr_decide(ch, nonce, dev, 'approve', code);  -- verified, henüz tüketilmedi
  r := public.auth_device_revoke('f2c-adm2', dev, 'yetkisiz');
  IF r->>'code' <> 'not_found' THEN RAISE EXCEPTION 'F1 Owner olmayan admin başkasının cihazını iptal edemez: %', r; END IF;
  r := public.auth_device_revoke('f2c-exp-self', dev, 'telefon kayboldu');
  IF NOT (r->>'ok')::boolean OR (r->>'sessions_closed')::int <> 1 THEN RAISE EXCEPTION 'F2 kendi cihazını iptal + 1 oturum kapanır: %', r; END IF;
  SELECT count(*) INTO n FROM public.user_sessions WHERE session_token = 'f2c-tok-ok' AND is_active;
  IF n <> 0 THEN RAISE EXCEPTION 'F3 iptal edilen cihazın onayladığı oturum kapanmalı'; END IF;
  r := pg_temp.fin(ch, pg_temp.h('bind-5'), 'f2c-tok-after-revoke');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'F4 iptalden sonra bekleyen onay oturuma dönüşemez: %', r; END IF;
  IF public.auth_device_public_key(dev) IS NOT NULL THEN RAISE EXCEPTION 'F5 iptal edilen cihaz anahtarı verilmez'; END IF;
  r := public.auth_mfa_begin(EXP, pg_temp.h('bind-6'), 'desktop_web', 'x', 'UA', 300);
  r := public.auth_qr_fetch((r->>'challenge_id')::uuid, r->>'qr_nonce', dev);
  IF r->>'reason' <> 'invalid' THEN RAISE EXCEPTION 'F6 iptal edilen cihaz QR okuyamaz'; END IF;
  IF public.auth_mfa_user_has_method(EXP) THEN RAISE EXCEPTION 'F7 iptal sonrası yöntem yok'; END IF;
  -- Owner başkasının cihazını iptal edebilir.
  r := public.auth_device_revoke('f2c-owner-plain', dev2, 'Owner iptali');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'F8 Owner iptal edebilir: %', r; END IF;

  -- ── G) Owner ilk cihaz (bootstrap) ────────────────────────────────────────
  UPDATE public.auth_trusted_devices SET state = 'rejected' WHERE id = odev;  -- panel isteği kapatıldı
  boot := public.auth_owner_bootstrap_issue();
  IF boot !~ '^[A-Z0-9]{20}$' THEN RAISE EXCEPTION 'G1 bootstrap kodu biçimi (%)', boot; END IF;
  r := pg_temp.enroll(EXP, 'k-exp-boot', encode(sha256(convert_to('yasam-bootstrap:' || boot, 'UTF8')), 'hex'));
  IF r->>'reason' <> 'bootstrap_invalid' THEN RAISE EXCEPTION 'G2 bootstrap kodu yalnız Owner hesabında: %', r; END IF;
  r := pg_temp.enroll(OWNER, 'k-owner-boot', encode(sha256(convert_to('yasam-bootstrap:' || boot, 'UTF8')), 'hex'));
  IF NOT (r->>'ok')::boolean OR r->>'state' <> 'owner_approved' THEN RAISE EXCEPTION 'G3 Owner bootstrap: %', r; END IF;
  odev := (r->>'device_id')::uuid;
  SELECT count(*) INTO n FROM public.admin_notifications WHERE event_key = 'cihaz_eslesme:' || odev;
  IF n <> 0 THEN RAISE EXCEPTION 'G4 bootstrap zile istek düşürmez'; END IF;
  IF public.auth_mfa_user_has_method(OWNER) THEN RAISE EXCEPTION 'G5 bootstrap da cihazı tek başına aktif yapmaz'; END IF;
  PERFORM public.auth_device_activate(odev, (SELECT activation_nonce FROM public.auth_trusted_devices WHERE id = odev));
  IF NOT public.auth_mfa_user_has_method(OWNER) THEN RAISE EXCEPTION 'G6 Owner cihazı imzayla aktifleşir'; END IF;
  UPDATE public.auth_trusted_devices SET state = 'revoked', revoked_at = now() WHERE id = odev;
  r := pg_temp.enroll(OWNER, 'k-owner-boot-2', encode(sha256(convert_to('yasam-bootstrap:' || boot, 'UTF8')), 'hex'));
  IF r->>'reason' <> 'bootstrap_invalid' THEN RAISE EXCEPTION 'G7 bootstrap kodu tek kullanımlık: %', r; END IF;
  IF has_function_privilege('service_role', 'public.auth_owner_bootstrap_issue()', 'EXECUTE') THEN
    RAISE EXCEPTION 'G8 bootstrap kodu yalnız SQL konsolundan (service_role KAPALI)'; END IF;

  -- ── H) Cihaz sınırı (2 aktif) ─────────────────────────────────────────────
  FOR i IN 1..2 LOOP
    r := pg_temp.enroll(FREE, 'k-free-' || i);
    PERFORM public.auth_device_owner_decide('f2c-owner-mfa', (r->>'device_id')::uuid, 'approve', true, 'telefon', NULL);
    PERFORM public.auth_device_activate((r->>'device_id')::uuid,
      (SELECT activation_nonce FROM public.auth_trusted_devices WHERE id = (r->>'device_id')::uuid));
  END LOOP;
  r := pg_temp.enroll(FREE, 'k-free-3');
  IF r->>'reason' <> 'device_limit' THEN RAISE EXCEPTION 'H1 en fazla 2 aktif cihaz: %', r; END IF;

  -- ── I) Yetkiler ───────────────────────────────────────────────────────────
  IF has_table_privilege('service_role', 'public.auth_trusted_devices', 'SELECT')
     OR has_table_privilege('service_role', 'public.auth_device_decisions', 'SELECT')
     OR has_table_privilege('service_role', 'public.auth_owner_bootstrap_codes', 'SELECT') THEN
    RAISE EXCEPTION 'I1 cihaz tablolarına doğrudan erişim olmamalı'; END IF;
  IF has_function_privilege('anon', 'public.auth_qr_decide(uuid,text,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_device_owner_decide(text,uuid,text,boolean,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.auth_session_actor(text,boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.auth_device_notify(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'I2 yetki sınırları'; END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname LIKE ANY (ARRAY['auth_device_%', 'auth_qr_%', 'auth_owner_bootstrap_issue', 'auth_session_actor'])
     AND p.proname <> 'auth_device_decisions_append_only'
     AND NOT (p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%');
  IF n <> 0 THEN RAISE EXCEPTION 'I3 SECURITY DEFINER + search_path (% eksik)', n; END IF;

  RAISE NOTICE 'session-f2c assert: PASS';
END $$;
