-- GİRİŞ GÜVENLİĞİ F2-J — Android yönetici oturumu cihaz kanıtı, kanal tutarlılığı, eski süresiz oturum geçişi.
-- Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar. Zincir: F2-A…F2-I ; migration: 20280103001000 (iki kez).
-- Her madde ayrı kaydedilir; sonda BÜTÜN ihlaller tek hata olarak raporlanır.

CREATE TEMP TABLE f2j_fail (id serial, msg text);
CREATE FUNCTION pg_temp.fail(p text) RETURNS void LANGUAGE sql AS $$ INSERT INTO f2j_fail (msg) VALUES (p); $$;
CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;
-- Oturum: kanal, rol, yaş, son görülme ve mutlak bitiş verilerek (mfa_finalize ile; yalnız test kurulumu).
CREATE FUNCTION pg_temp.sess(p_user uuid, p_token text, p_channel text, p_role text, p_created interval, p_last interval,
                             p_expires interval) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  PERFORM set_config('yasam.session_create', 'on', true);
  INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method,
                                    created_at, last_seen_at)
  VALUES (p_user, p_token, true, p_channel, p_role, CASE WHEN p_expires IS NULL THEN NULL ELSE now() + p_expires END, 'qr_device',
          now() - p_created, now() - p_last)
  RETURNING id INTO v;
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
  PERFORM set_config('yasam.session_create', 'off', true);
  RETURN v;
END $$;
-- Üretimdeki çağrı parametreleri (sessionSecurity: uzman boşta 7 gün, admin boşta 2 saat, admin mutlak 24 saat).
CREATE FUNCTION pg_temp.touch(p_token text) RETURNS uuid LANGUAGE sql AS $$
  SELECT public.touch_active_session(p_token, 60, 604800, true, 7200, 86400);
$$;
CREATE FUNCTION pg_temp.begin(p_token text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_session_device_bind_begin(p_token, 604800, 7200, 86400);
$$;
CREATE FUNCTION pg_temp.bind(p_sid uuid, p_nonce text, p_dev uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.auth_session_device_bind(p_sid, p_nonce, p_dev, 604800, 7200, 86400);
$$;
CREATE FUNCTION pg_temp.state(p_sid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN is_active THEN 'active' ELSE 'ended:' || coalesce(end_reason, '?') END FROM public.user_sessions WHERE id = p_sid;
$$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  odev uuid; odev2 uuid; a2dev uuid; pend uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid; s9 uuid; s10 uuid; s11 uuid;
  A3    constant uuid := '00000000-0000-0000-0000-00000000a0f3';
  A4    constant uuid := '00000000-0000-0000-0000-00000000a0f4';
  a4dev uuid; a3dev uuid;
  r jsonb; r2 jsonb; ch uuid; n int; u uuid;
BEGIN
  -- Ek yöneticiler (her yöneticinin tek etkin Android oturumu olabilir — ux_user_sessions_admin_android_active).
  INSERT INTO public.users SELECT (jsonb_populate_record(NULL::public.users, to_jsonb(x) || jsonb_build_object('id', A3, 'email', 'j-a3@test.invalid'))).*
    FROM public.users x WHERE x.id = ADM2;
  INSERT INTO public.users SELECT (jsonb_populate_record(NULL::public.users, to_jsonb(x) || jsonb_build_object('id', A4, 'email', 'j-a4@test.invalid'))).*
    FROM public.users x WHERE x.id = ADM2;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (OWNER, repeat('O', 120), pg_temp.h('j-owner-phone'), 'JJJJ-OOOO', 'active', now()) RETURNING id INTO odev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (OWNER, repeat('P', 120), pg_temp.h('j-owner-phone-2'), 'JJJJ-PPPP', 'active', now()) RETURNING id INTO odev2;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (ADM2, repeat('A', 120), pg_temp.h('j-adm2-phone'), 'JJJJ-AAAA', 'active', now()) RETURNING id INTO a2dev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (A4, repeat('B', 120), pg_temp.h('j-a4-phone'), 'JJJJ-BBBB', 'active', now()) RETURNING id INTO a4dev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (A3, repeat('C', 120), pg_temp.h('j-a3-phone'), 'JJJJ-CCCC', 'active', now()) RETURNING id INTO a3dev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state)
  VALUES (OWNER, repeat('Q', 120), pg_temp.h('j-owner-pending'), 'JJJJ-QQQQ', 'pending_owner') RETURNING id INTO pend;

  -- ── J2: taklit edilmiş (cihaz kanıtsız) Android yönetici oturumu = web yönetici sınırları ──────────────
  s1 := pg_temp.sess(OWNER, 'j-s1', 'android_app', 'admin', interval '25 hours', interval '5 minutes', interval '29 days');
  IF pg_temp.touch('j-s1') IS NOT NULL OR pg_temp.state(s1) <> 'ended:expired_absolute' THEN
    PERFORM pg_temp.fail('J2a kanıtsız android admin oturumu 24 saati aştı ama geçerli kaldı: ' || pg_temp.state(s1));
  END IF;
  s2 := pg_temp.sess(OWNER, 'j-s2', 'android_app', 'admin', interval '5 hours', interval '3 hours', interval '29 days');
  IF pg_temp.touch('j-s2') IS NOT NULL OR pg_temp.state(s2) <> 'ended:expired_idle' THEN
    PERFORM pg_temp.fail('J2b kanıtsız android admin oturumu 3 saat boşta ama geçerli kaldı: ' || pg_temp.state(s2));
  END IF;
  s3 := pg_temp.sess(OWNER, 'j-s3', 'android_app', 'admin', interval '10 minutes', interval '1 minute', interval '30 days');
  IF pg_temp.touch('j-s3') IS DISTINCT FROM OWNER THEN
    PERFORM pg_temp.fail('J2c taze kanıtsız android admin oturumu (web sınırları içinde) reddedildi');
  END IF;
  -- Uzman Android (yeni model) ve web davranışı değişmedi.
  s4 := pg_temp.sess(VE, 'j-s4', 'android_app', 'expert', interval '10 days', interval '3 hours', interval '20 days');
  IF pg_temp.touch('j-s4') IS DISTINCT FROM VE THEN
    PERFORM pg_temp.fail('J2d uzman android oturumu (10 gün, 3 saat boşta) reddedildi — uzman davranışı bozuldu');
  END IF;
  -- Eski süresiz oturumlar: politika 'kapali' → BUGÜNKÜ davranış (anında çıkış YOK).
  s5 := pg_temp.sess(VE, 'j-s5', 'android_app', 'expert', interval '200 days', interval '60 days', NULL);
  s6 := pg_temp.sess(ADM2, 'j-s6', 'android_app', 'admin', interval '200 days', interval '2 days', NULL);
  IF pg_temp.touch('j-s5') IS DISTINCT FROM VE OR pg_temp.touch('j-s6') IS DISTINCT FROM ADM2 THEN
    PERFORM pg_temp.fail('J4a politika kapalıyken eski süresiz oturum kapandı (habersiz çıkış)');
  END IF;

  -- ── J3: cihaz kanıtı ─────────────────────────────────────────────────────────────────────────────────
  r := pg_temp.begin('j-s3');
  IF NOT coalesce((r->>'ok')::boolean, false) OR (r->>'session_id')::uuid <> s3 OR length(r->>'nonce') <> 64 THEN
    PERFORM pg_temp.fail('J3a kanıt başlatma başarısız: ' || r::text);
  END IF;
  -- Başka kullanıcının (etkin) cihazıyla → reddedilir, nonce tüketilir.
  r2 := pg_temp.bind(s3, r->>'nonce', a2dev);
  IF coalesce((r2->>'ok')::boolean, true) OR r2->>'reason' <> 'device_invalid' THEN
    PERFORM pg_temp.fail('J3b başka kullanıcının cihazıyla bağlandı: ' || r2::text);
  END IF;
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF coalesce((r2->>'ok')::boolean, true) THEN
    PERFORM pg_temp.fail('J3c reddedilen denemenin nonce''u yeniden kullanıldı: ' || r2::text);
  END IF;
  -- Etkin olmayan (pending_owner) kendi cihazı.
  r := pg_temp.begin('j-s3');
  r2 := pg_temp.bind(s3, r->>'nonce', pend);
  IF coalesce((r2->>'ok')::boolean, true) OR r2->>'reason' <> 'device_invalid' THEN
    PERFORM pg_temp.fail('J3d etkin olmayan cihazla bağlandı: ' || r2::text);
  END IF;
  -- Başka oturumun nonce'u.
  s7 := pg_temp.sess(A3, 'j-s7', 'android_app', 'admin', interval '5 minutes', interval '1 minute', interval '30 days');
  r := pg_temp.begin('j-s7');
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF coalesce((r2->>'ok')::boolean, true) THEN
    PERFORM pg_temp.fail('J3e başka oturumun nonce''uyla bağlandı: ' || r2::text);
  END IF;
  -- Süresi dolmuş nonce.
  r := pg_temp.begin('j-s3');
  UPDATE public.auth_session_device_proofs SET expires_at = now() - interval '1 second' WHERE nonce_hash = pg_temp.h(r->>'nonce');
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF coalesce((r2->>'ok')::boolean, true) OR r2->>'reason' <> 'expired' THEN
    PERFORM pg_temp.fail('J3f süresi dolmuş nonce kabul edildi: ' || r2::text);
  END IF;
  -- Meşru bağlama.
  r := pg_temp.begin('j-s3');
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF NOT coalesce((r2->>'ok')::boolean, false) OR NOT (r2->>'first')::boolean THEN
    PERFORM pg_temp.fail('J3g meşru cihaz kanıtı reddedildi: ' || r2::text);
  END IF;
  -- Aynı nonce ikinci kez (replay).
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF coalesce((r2->>'ok')::boolean, true) THEN
    PERFORM pg_temp.fail('J3h aynı nonce iki kez kullanıldı: ' || r2::text);
  END IF;
  -- Bağlı oturum: 3 saat boşta, 10 gün yaşında → Android sınırları (geçerli).
  UPDATE public.user_sessions SET last_seen_at = now() - interval '3 hours', created_at = now() - interval '10 days' WHERE id = s3;
  IF pg_temp.touch('j-s3') IS DISTINCT FROM OWNER THEN
    PERFORM pg_temp.fail('J3i cihaza bağlı yönetici oturumu (kanıt taze) reddedildi: ' || pg_temp.state(s3));
  END IF;
  -- Başka cihaza geçirme reddi.
  r := pg_temp.begin('j-s3');
  r2 := pg_temp.bind(s3, r->>'nonce', odev2);
  IF coalesce((r2->>'ok')::boolean, true) OR r2->>'reason' <> 'device_mismatch' THEN
    PERFORM pg_temp.fail('J3j bağlı oturum başka cihaza geçirildi: ' || r2::text);
  END IF;
  -- (zaman geçişi: bu oturumun önceki nonce istekleri 10 dakikalık hız penceresinin dışına alınır)
  UPDATE public.auth_session_device_proofs SET created_at = now() - interval '11 minutes' WHERE session_id = s3;
  -- Kanıt bayat (25 saat) → geçersiz ama SONLANMAZ; yeniden kanıt sonrası geçerli.
  PERFORM set_config('yasam.session_bind', 'on', true);
  UPDATE public.user_sessions SET device_proof_at = now() - interval '25 hours' WHERE id = s3;
  PERFORM set_config('yasam.session_bind', 'off', true);
  IF pg_temp.touch('j-s3') IS NOT NULL OR pg_temp.state(s3) <> 'active' THEN
    PERFORM pg_temp.fail('J3k bayat kanıtlı oturum: beklenen geçersiz-ama-açık, bulunan ' || coalesce(pg_temp.touch('j-s3')::text, 'NULL') || ' / ' || pg_temp.state(s3));
  END IF;
  r := pg_temp.begin('j-s3');
  r2 := pg_temp.bind(s3, r->>'nonce', odev);
  IF NOT coalesce((r2->>'ok')::boolean, false) OR (r2->>'first')::boolean OR pg_temp.touch('j-s3') IS DISTINCT FROM OWNER THEN
    PERFORM pg_temp.fail('J3l yeniden cihaz kanıtı başarısız: ' || r2::text);
  END IF;
  -- Bağlı cihaz iptal edilirse oturum hemen biter.
  s8 := pg_temp.sess(A4, 'j-s8', 'android_app', 'admin', interval '5 minutes', interval '1 minute', interval '30 days');
  r := pg_temp.begin('j-s8');
  r2 := pg_temp.bind(s8, r->>'nonce', a4dev);
  IF NOT coalesce((r2->>'ok')::boolean, false) THEN PERFORM pg_temp.fail('J3m-hazırlık bağlama başarısız: ' || r2::text); END IF;
  UPDATE public.auth_trusted_devices SET state = 'revoked', revoked_at = now() WHERE id = a4dev;
  IF pg_temp.touch('j-s8') IS NOT NULL OR pg_temp.state(s8) <> 'ended:device_revoked' THEN
    PERFORM pg_temp.fail('J3m iptal edilen cihaza bağlı oturum açık kaldı: ' || pg_temp.state(s8));
  END IF;
  -- Kanıt gerekmeyen oturumlar.
  s9 := pg_temp.sess(VE, 'j-s9', 'android_app', 'expert', interval '5 minutes', interval '1 minute', interval '30 days');
  s10 := pg_temp.sess(OWNER, 'j-s10', 'desktop_web', 'admin', interval '5 minutes', interval '1 minute', interval '23 hours');
  IF pg_temp.begin('j-s9')->>'reason' <> 'not_required' OR pg_temp.begin('j-s10')->>'reason' <> 'not_required' THEN
    PERFORM pg_temp.fail('J3n uzman / web oturumu için kanıt nonce''u üretildi');
  END IF;
  -- Web sınırlarını aşmış kanıtsız oturum bağlanamaz (24 saat).
  s11 := pg_temp.sess(A4, 'j-s11', 'android_app', 'admin', interval '23 hours 59 minutes', interval '1 minute', interval '30 days');
  r := pg_temp.begin('j-s11');
  UPDATE public.user_sessions SET created_at = now() - interval '25 hours' WHERE id = s11;
  r2 := pg_temp.bind(s11, r->>'nonce', a4dev);
  IF coalesce((r2->>'ok')::boolean, true) THEN
    PERFORM pg_temp.fail('J3o 24 saati aşmış kanıtsız oturum bağlandı: ' || r2::text);
  END IF;
  -- Nonce hız sınırı (10 dakikada 5).
  FOR n IN 1..6 LOOP r := pg_temp.begin('j-s7'); END LOOP;
  IF r->>'reason' <> 'rate_limited' THEN
    PERFORM pg_temp.fail('J3p nonce hız sınırı çalışmadı: ' || r::text);
  END IF;
  -- Cihaz bağı kolonları doğrudan (bind fonksiyonu dışında) değiştirilemez.
  BEGIN
    UPDATE public.user_sessions SET bound_device_id = a3dev, device_proof_at = now() WHERE id = s7;
    PERFORM pg_temp.fail('J3q cihaz bağı doğrudan UPDATE ile kuruldu');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE id = s7;
  BEGIN
    PERFORM set_config('yasam.mfa_finalize', 'on', true);
    PERFORM set_config('yasam.session_create', 'on', true);
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method, bound_device_id, device_proof_at)
    VALUES (A3, 'j-forge', true, 'android_app', 'admin', now() + interval '30 days', 'qr_device', a3dev, now());
    PERFORM pg_temp.fail('J3r bağlı oturum doğrudan INSERT ile oluşturuldu');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('yasam.mfa_finalize', 'off', true);
  PERFORM set_config('yasam.session_create', 'off', true);
  -- service_role yeni tabloya / iç fonksiyonlara erişemez.
  IF has_table_privilege('service_role', 'public.auth_session_device_proofs', 'SELECT')
     OR has_table_privilege('service_role', 'public.auth_legacy_session_policy', 'UPDATE')
     OR has_function_privilege('anon', 'public.auth_session_device_bind(uuid,text,uuid,integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_session_device_bind_begin(text,integer,integer,integer)', 'EXECUTE') THEN
    PERFORM pg_temp.fail('J3s yeni tablo / fonksiyon API rollerine açık');
  END IF;

  -- ── J1: tamamlama adımında kanal değiştirilemez ───────────────────────────────────────────────────────
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id = OWNER;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  r := public.auth_mfa_begin(OWNER, pg_temp.h('j-bind'), 'desktop_web', NULL, NULL, 300);
  ch := (r->>'challenge_id')::uuid;
  IF ch IS NULL THEN PERFORM pg_temp.fail('J1-hazırlık challenge yok: ' || r::text); END IF;
  PERFORM public.auth_mfa_mark_verified(ch, 'qr_device');
  r2 := public.auth_finalize_login(ch, pg_temp.h('j-bind'), 'j-fin-1', NULL, NULL, NULL, 'ua', 'desktop', 'android_app', NULL,
          now() + interval '30 days', false, true, 604800, 7200, 86400, 3600, 2, 600);
  IF coalesce((r2->>'ok')::boolean, true) OR r2->>'reason' <> 'channel_mismatch'
     OR (SELECT state FROM public.auth_mfa_challenges WHERE id = ch) <> 'verified' THEN
    PERFORM pg_temp.fail('J1a web''de başlayan giriş Android kanalıyla tamamlandı: ' || r2::text);
  END IF;
  r2 := public.auth_finalize_login(ch, pg_temp.h('j-bind'), 'j-fin-1', NULL, NULL, NULL, 'ua', 'desktop', 'desktop_web', NULL,
          now() + interval '1 day', false, true, 604800, 7200, 86400, 3600, 2, 600);
  IF NOT coalesce((r2->>'ok')::boolean, false)
     OR (SELECT client_channel FROM public.user_sessions WHERE session_token = 'j-fin-1') <> 'desktop_web' THEN
    PERFORM pg_temp.fail('J1b meşru tamamlama başarısız: ' || r2::text);
  END IF;

  -- ── J4: eski süresiz oturum politikası ────────────────────────────────────────────────────────────────
  PERFORM pg_temp.sess(OWNER, 'j-owner-fresh', 'desktop_web', 'admin', interval '5 minutes', interval '1 minute', interval '23 hours');
  PERFORM pg_temp.sess(OWNER, 'j-owner-stale', 'desktop_web', 'admin', interval '2 hours', interval '1 minute', interval '22 hours');
  PERFORM pg_temp.sess(ADM2, 'j-adm2', 'desktop_web', 'admin', interval '5 minutes', interval '1 minute', interval '23 hours');
  IF public.auth_legacy_session_policy_set('j-owner-stale', 'kademeli', now() + interval '14 days')->>'reason' <> 'owner_fresh_mfa_required'
     OR public.auth_legacy_session_policy_set('j-adm2', 'kademeli', now() + interval '14 days')->>'reason' <> 'owner_fresh_mfa_required' THEN
    PERFORM pg_temp.fail('J4b bayat Owner / başka admin oturumu politikayı değiştirebildi');
  END IF;
  IF public.auth_legacy_session_policy_set('j-owner-fresh', 'kademeli', now() + interval '3 days')->>'reason' <> 'deadline_too_soon' THEN
    PERFORM pg_temp.fail('J4c 7 günden kısa son tarih kabul edildi');
  END IF;
  r := public.auth_legacy_session_policy_set('j-owner-fresh', 'kademeli', now() + interval '14 days');
  IF NOT coalesce((r->>'ok')::boolean, false) THEN
    PERFORM pg_temp.fail('J4d Owner politikayı açamadı: ' || r::text);
  END IF;
  -- 60 gün boşta eski oturum politika açılınca HEMEN kapanmaz (boşta süresi politika anından sayılır).
  IF pg_temp.touch('j-s5') IS DISTINCT FROM VE THEN
    PERFORM pg_temp.fail('J4e politika açılınca uzun süre boşta eski oturum anında kapandı');
  END IF;
  IF (public.auth_session_legacy_info('j-s5')->>'legacy')::boolean IS NOT TRUE THEN
    PERFORM pg_temp.fail('J4f eski oturum bilgisi (bildirim için) dönmedi');
  END IF;
  -- Politika 8 gün önce açılmış ve oturum o zamandan beri kullanılmamış → boşta sınırı (7 gün).
  UPDATE public.auth_legacy_session_policy SET set_at = now() - interval '8 days', deadline = now() + interval '6 days' WHERE id = 1;
  UPDATE public.user_sessions SET last_seen_at = now() - interval '60 days' WHERE id = s5;
  IF pg_temp.touch('j-s5') IS NOT NULL OR pg_temp.state(s5) <> 'ended:expired_idle' THEN
    PERFORM pg_temp.fail('J4g politika sonrası 7 günden uzun boşta eski oturum açık kaldı: ' || pg_temp.state(s5));
  END IF;
  -- Son tarih geçti → eski oturum 'legacy_deadline' ile biter (yönetici dahil).
  UPDATE public.auth_legacy_session_policy SET set_at = now() - interval '20 days', deadline = now() - interval '1 minute' WHERE id = 1;
  IF pg_temp.touch('j-s6') IS NOT NULL OR pg_temp.state(s6) <> 'ended:legacy_deadline' THEN
    PERFORM pg_temp.fail('J4h son tarih geçtikten sonra eski oturum açık kaldı: ' || pg_temp.state(s6));
  END IF;
  -- Politika kapatılabilir (Owner, taze).
  r := public.auth_legacy_session_policy_set('j-owner-fresh', 'kapali', NULL);
  IF NOT coalesce((r->>'ok')::boolean, false) OR (SELECT mode FROM public.auth_legacy_session_policy WHERE id = 1) <> 'kapali' THEN
    PERFORM pg_temp.fail('J4i politika kapatılamadı: ' || r::text);
  END IF;
  -- Denetim izi.
  SELECT count(*) INTO n FROM public.security_events WHERE event_type IN ('session_device_bound', 'session_device_reproof', 'session_device_bind_rejected', 'legacy_session_policy_set');
  IF n < 6 THEN
    PERFORM pg_temp.fail('J5 denetim kayıtları eksik: ' || n);
  END IF;
END $$;

DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(msg, E'\n  ' ORDER BY id) INTO v FROM f2j_fail;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION E'F2-J ihlalleri (% madde):\n  %', (SELECT count(*) FROM f2j_fail), v;
  END IF;
  RAISE NOTICE 'session-f2j: PASS';
END $$;
