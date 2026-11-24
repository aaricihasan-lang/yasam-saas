-- GİRİŞ GÜVENLİĞİ F2-H davranış doğrulaması (hata → FAIL). Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar /
-- SENTETİK saklama süreleri ve gerekçeler (gerçek hukuki karar DEĞİLDİR).
-- Zincir: session-model + f2a…f2d fixture'ları → F2-A…F2-G migration'ları ; migration: 20280103000800 (iki kez).

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
-- Owner telefonuyla işleme özel kanıt (step-up) al.
CREATE FUNCTION pg_temp.proof(p_token text, p_action text, p_target uuid, p_dev uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.auth_owner_step_up_begin(p_token, p_action, p_target);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'proof begin: %', r; END IF;
  PERFORM public.auth_qr_decide((r->>'challenge_id')::uuid, r->>'qr_nonce', p_dev, 'approve', r->>'match_code');
  RETURN (r->>'challenge_id')::uuid;
END $$;
CREATE FUNCTION pg_temp.cnt(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE n bigint; BEGIN EXECUTE p_sql INTO n; RETURN n; END $$;

DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  ADM2  constant uuid := '00000000-0000-0000-0000-00000000a002';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  VE2   constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  AND1  constant uuid := '00000000-0000-0000-0000-00000000e0b2';
  ZERO  constant uuid := '00000000-0000-0000-0000-000000000000';
  OLD_T constant timestamptz := now() - interval '400 days';
  r jsonb; n bigint; odev uuid; run uuid; hold bigint; d_held uuid; d_free uuid; ev_before bigint; dec_before bigint; se_before bigint; t text;
BEGIN
  -- Kurulum: Owner MFA + güvenilir telefon; oturumlar; sentetik eski / yeni denetim satırları.
  UPDATE public.users SET email_verified_at = now() WHERE id = OWNER;
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id = OWNER;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (OWNER, repeat('O', 120), pg_temp.h('owner-phone'), 'ABCD-EFGH', 'active', now()) RETURNING id INTO odev;
  PERFORM pg_temp.sess(OWNER, 'o', 'qr_device');
  PERFORM pg_temp.sess(OWNER, 'o-stale', 'qr_device', interval '31 minutes');
  PERFORM pg_temp.sess(OWNER, 'o-plain', NULL);
  PERFORM pg_temp.sess(ADM2, 'a2', 'qr_device');
  INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, detail, created_at) VALUES
    (VE, VE, 'codes_generated', '{"batch_id":"x"}', OLD_T), (VE, OWNER, 'case_opened', '{"case_id":"y"}', OLD_T),
    (VE2, VE2, 'code_used', '{"challenge_id":"z"}', OLD_T), (AND1, AND1, 'codes_generated', '{}', OLD_T),
    (VE, VE, 'code_used', '{}', now()), (AND1, AND1, 'code_used', '{}', now());
  d_held := gen_random_uuid(); d_free := gen_random_uuid();
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed, note, created_at) VALUES
    (d_free, OWNER, 'approve', 'telefon', true, 'kayıtlı numaradan arandı', OLD_T), (d_free, VE, 'revoke', 'kullanici', false, NULL, OLD_T),
    (d_held, OWNER, 'approve', 'telefon', true, 'eski cihaz', OLD_T), (gen_random_uuid(), OWNER, 'approve', 'yuz_yuze', true, 'yeni', now());
  INSERT INTO public.security_events (user_id, event_type, severity, ip_address, created_at) VALUES
    (VE, 'login', 'info', '203.0.113.1', OLD_T), (VE2, 'login', 'info', '203.0.113.2', OLD_T), (AND1, 'login', 'info', '203.0.113.3', OLD_T),
    (VE, 'login', 'info', '203.0.113.4', now());

  -- ── A) Varsayılan: karar bekliyor → hiçbir imha mümkün değil ─────────────────────────────────────
  SELECT count(*) INTO n FROM public.auth_audit_retention_policy WHERE retention_days IS NULL AND disposal_method = 'karar_bekliyor';
  IF n <> 3 THEN RAISE EXCEPTION 'A1 varsayılan 3 politika karar bekliyor (%)', n; END IF;
  r := public.auth_retention_preview('o', 'auth_recovery_events');
  IF r->>'code' <> 'policy_undecided' THEN RAISE EXCEPTION 'A2 karar yokken önizleme / imha yok: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_retention_runs;
  IF n <> 0 THEN RAISE EXCEPTION 'A3 çalıştırma oluşmadı'; END IF;
  -- Değiştirilemezlik sıradan işlemlere kapalı (veritabanı yöneticisi dahil, imha çalıştırması dışında).
  BEGIN DELETE FROM public.auth_recovery_events; RAISE EXCEPTION 'A4 silinememeli'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.auth_device_decisions SET note = NULL; RAISE EXCEPTION 'A5 değiştirilememeli'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.auth_retention_context (txid, run_id) VALUES (txid_current(), gen_random_uuid());
    DELETE FROM public.auth_recovery_events;
    RAISE EXCEPTION 'A6 sahte bağlam (var olmayan çalıştırma) istisna açmamalı';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN foreign_key_violation THEN NULL;
  END;
  DELETE FROM public.auth_retention_context;
  FOREACH t IN ARRAY ARRAY['auth_retention_runs', 'auth_retention_context', 'auth_retention_holds', 'auth_retention_log', 'auth_audit_retention_policy'] LOOP
    IF has_table_privilege('service_role', 'public.' || t, 'SELECT') OR has_table_privilege('service_role', 'public.' || t, 'INSERT')
       OR has_table_privilege('service_role', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'A7 % API rolüne kapalı', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.auth_retention_active_run()', 'public.auth_retention_count(text,timestamptz)', 'public.auth_retention_owner(text)',
      'public.auth_retention_policy_fp(text)'] LOOP
    IF has_function_privilege('service_role', t, 'EXECUTE') THEN RAISE EXCEPTION 'A8 % iç fonksiyon', t; END IF;
  END LOOP;

  -- ── B) Yetki ve politika kuralları ──────────────────────────────────────────────────────────────
  FOREACH t IN ARRAY ARRAY['o-stale', 'o-plain', 'a2'] LOOP
    r := public.auth_retention_policy_set(t, 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL);
    IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'B1 % politika yazamaz: %', t, r; END IF;
  END LOOP;
  r := public.auth_retention_policy_set('o', 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'B2 kanıt şart: %', r; END IF;
  r := public.auth_retention_policy_set('o', 'auth_recovery_events', 10, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL);
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'B3 30 günden kısa süre yok: %', r; END IF;
  r := public.auth_retention_policy_set('o', 'auth_recovery_events', 365, 'kısa', 'silme', NULL);
  IF r->>'code' <> 'bad_request' THEN RAISE EXCEPTION 'B4 gerekçe şart: %', r; END IF;
  r := public.auth_retention_policy_set('o', 'security_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'anonimlestirme', NULL);
  IF r->>'code' <> 'method_not_allowed' THEN RAISE EXCEPTION 'B5 security_events yalnız silme: %', r; END IF;
  BEGIN
    UPDATE public.auth_audit_retention_policy SET retention_days = 400, legal_basis = 'Sentetik gerekçe ...', disposal_method = 'anonimlestirme',
           decided_by = OWNER, decided_at = now() WHERE table_name = 'security_events';
    RAISE EXCEPTION 'B6 DB kısıtı security_events anonimleştirmeyi reddetmeli';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.proof('o', 'retention_policy', public.auth_retention_table_uuid('auth_recovery_events'), odev);
  r := public.auth_retention_policy_set('o', 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', 'test');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B7 kanıtla politika: %', r; END IF;
  IF (SELECT decided_by FROM public.auth_audit_retention_policy WHERE table_name = 'auth_recovery_events') <> OWNER THEN RAISE EXCEPTION 'B8 karar veren kaydı'; END IF;
  r := public.auth_retention_policy_set('o', 'auth_device_decisions', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'anonimlestirme', NULL);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'B9 kanıt tablo başına / tek kullanımlık: %', r; END IF;

  -- ── C) Yasal saklama + önizleme (salt sayım) ────────────────────────────────────────────────────
  r := public.auth_retention_hold_set('o', 'subject_user', VE2, 'Sentetik yasal saklama — dava dosyası');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'C1 saklama: %', r; END IF;
  hold := (r->>'hold_id')::bigint;
  ev_before := pg_temp.cnt('SELECT count(*) FROM public.auth_recovery_events');
  r := public.auth_retention_preview('o', 'auth_recovery_events');
  IF NOT (r->>'ok')::boolean OR (r->>'candidates')::int <> 3 OR (r->>'held')::int <> 1 THEN RAISE EXCEPTION 'C2 önizleme 3 aday / 1 saklı: %', r; END IF;
  run := (r->>'run_id')::uuid;
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_recovery_events') <> ev_before THEN RAISE EXCEPTION 'C3 önizleme hiçbir şey silmez'; END IF;
  r := public.auth_retention_preview('o', 'auth_recovery_events');
  IF r->>'code' <> 'preview_exists' THEN RAISE EXCEPTION 'C4 tablo başına tek açık önizleme: %', r; END IF;

  -- ── D) Yürütme: ayrı açık onay + kanıt ──────────────────────────────────────────────────────────
  r := public.auth_retention_execute('o-stale', run, 'auth_recovery_events silme 3');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'D1 bayat oturum yürütemez: %', r; END IF;
  r := public.auth_retention_execute('o', run, 'auth_recovery_events silme 4');
  IF r->>'code' <> 'confirm_mismatch' THEN RAISE EXCEPTION 'D2 onay cümlesi birebir: %', r; END IF;
  r := public.auth_retention_execute('o', run, 'auth_recovery_events silme 3');
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'D3 kanıt şart: %', r; END IF;
  PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
  r := public.auth_retention_execute('o', run, 'auth_recovery_events silme 3');
  IF NOT (r->>'ok')::boolean OR (r->>'affected')::int <> 3 THEN RAISE EXCEPTION 'D4 yürütme: %', r; END IF;
  -- (Kanıt alma / kullanma yeni, güncel tarihli olaylar ekler; eski satırlar ayrı sayılır.)
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_recovery_events WHERE created_at < now() - interval ''300 days''') <> 1 THEN RAISE EXCEPTION 'D5 4 eski satırdan tam 3''ü silindi'; END IF;
  IF pg_temp.cnt(format('SELECT count(*) FROM public.auth_recovery_events WHERE subject_user_id = %L', VE2)) <> 1 THEN RAISE EXCEPTION 'D6 yasal saklamadaki kişi korunur'; END IF;
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_recovery_events WHERE created_at > now() - interval ''1 day''') < 2 THEN RAISE EXCEPTION 'D7 süresi dolmayan satırlar korunur'; END IF;
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_device_decisions') <> 4 OR pg_temp.cnt('SELECT count(*) FROM public.security_events WHERE created_at < now() - interval ''300 days''') <> 3 THEN
    RAISE EXCEPTION 'D8 başka tablolara dokunulmaz';
  END IF;
  IF (SELECT state || '/' || affected_count FROM public.auth_retention_runs WHERE id = run) <> 'completed/3' THEN RAISE EXCEPTION 'D9 kapsam ve sayı kayıtlı'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_retention_log WHERE run_id = run AND action = 'execute' AND (detail->>'affected')::int = 3) THEN RAISE EXCEPTION 'D10 kayıt'; END IF;
  IF EXISTS (SELECT 1 FROM public.auth_retention_context) THEN RAISE EXCEPTION 'D11 bağlam işaretçisi kalmamalı'; END IF;
  BEGIN DELETE FROM public.auth_recovery_events; RAISE EXCEPTION 'D12 imha sonrası değiştirilemezlik yerinde'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r := public.auth_retention_execute('o', run, 'auth_recovery_events silme 3');
  IF r->>'code' <> 'not_previewed' THEN RAISE EXCEPTION 'D13 aynı çalıştırma ikinci kez yürütülemez: %', r; END IF;
  BEGIN DELETE FROM public.auth_retention_log; RAISE EXCEPTION 'D14 imha kaydı silinemez'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- ── E) Anonimleştirme (karar kayıtları) ─────────────────────────────────────────────────────────
  r := public.auth_retention_hold_set('o', 'device', d_held, 'Sentetik cihaz saklaması — inceleme');
  PERFORM pg_temp.proof('o', 'retention_policy', public.auth_retention_table_uuid('auth_device_decisions'), odev);
  r := public.auth_retention_policy_set('o', 'auth_device_decisions', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'anonimlestirme', NULL);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E1 politika: %', r; END IF;
  r := public.auth_retention_preview('o', 'auth_device_decisions');
  IF (r->>'candidates')::int <> 2 OR (r->>'held')::int <> 1 THEN RAISE EXCEPTION 'E2 önizleme: %', r; END IF;
  run := (r->>'run_id')::uuid;
  PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
  r := public.auth_retention_execute('o', run, 'auth_device_decisions anonimlestirme 2');
  IF NOT (r->>'ok')::boolean OR (r->>'affected')::int <> 2 THEN RAISE EXCEPTION 'E3 anonimleştirme: %', r; END IF;
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_device_decisions') <> 4 THEN RAISE EXCEPTION 'E4 anonimleştirme satır silmez'; END IF;
  IF pg_temp.cnt(format('SELECT count(*) FROM public.auth_device_decisions WHERE device_id = %L AND actor_id = %L AND note IS NULL', ZERO, ZERO)) <> 2 THEN
    RAISE EXCEPTION 'E5 kimlik ve serbest metin kaldırıldı';
  END IF;
  IF pg_temp.cnt(format('SELECT count(*) FROM public.auth_device_decisions WHERE device_id = %L', d_free)) <> 0 THEN RAISE EXCEPTION 'E6 cihaz kimliği kalmadı'; END IF;
  IF pg_temp.cnt(format('SELECT count(*) FROM public.auth_device_decisions WHERE device_id = %L AND note = ''eski cihaz''', d_held)) <> 1 THEN RAISE EXCEPTION 'E7 saklı cihaz korunur'; END IF;
  IF pg_temp.cnt('SELECT count(*) FROM public.auth_device_decisions WHERE decision = ''revoke'' AND verification_method = ''kullanici''') <> 1 THEN RAISE EXCEPTION 'E8 olay türü korunur'; END IF;
  BEGIN UPDATE public.auth_device_decisions SET note = 'geri' WHERE device_id = ZERO; RAISE EXCEPTION 'E9 anonim satır da değiştirilemez'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.proof('o', 'retention_policy', public.auth_retention_table_uuid('auth_device_decisions'), odev);
  PERFORM public.auth_retention_policy_set('o', 'auth_device_decisions', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'anonimlestirme', 'ikinci');
  r := public.auth_retention_preview('o', 'auth_device_decisions');
  IF (r->>'candidates')::int <> 0 THEN RAISE EXCEPTION 'E10 anonim satır tekrar aday olmaz: %', r; END IF;
  PERFORM public.auth_retention_cancel('o', (r->>'run_id')::uuid);

  -- ── F) Yarış / tutarlılık / kısmi hata korumaları ──────────────────────────────────────────────
  PERFORM pg_temp.proof('o', 'retention_policy', public.auth_retention_table_uuid('security_events'), odev);
  r := public.auth_retention_policy_set('o', 'security_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL);
  r := public.auth_retention_preview('o', 'security_events');
  IF (r->>'candidates')::int <> 2 OR (r->>'held')::int <> 1 THEN RAISE EXCEPTION 'F1 önizleme: %', r; END IF;
  run := (r->>'run_id')::uuid;
  -- F2: önizlemeden sonra yeni eski-tarihli satır → sayı uyuşmaz → HİÇBİR satır silinmez.
  INSERT INTO public.security_events (user_id, event_type, severity, created_at) VALUES (AND1, 'login', 'info', OLD_T);
  se_before := pg_temp.cnt('SELECT count(*) FROM public.security_events');
  PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
  r := public.auth_retention_execute('o', run, 'security_events silme 2');
  IF r->>'error' <> 'count_mismatch' OR pg_temp.cnt('SELECT count(*) FROM public.security_events') <> se_before THEN RAISE EXCEPTION 'F2 tutarsızlıkta silme yok: %', r; END IF;
  IF (SELECT state FROM public.auth_retention_runs WHERE id = run) <> 'failed' THEN RAISE EXCEPTION 'F3 durum failed'; END IF;
  -- F4: politika önizlemeden sonra (fonksiyon dışından bile) değişirse → yürütme reddi.
  r := public.auth_retention_preview('o', 'security_events');
  run := (r->>'run_id')::uuid;
  UPDATE public.auth_audit_retention_policy SET retention_days = 366 WHERE table_name = 'security_events';
  PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
  r := public.auth_retention_execute('o', run, 'security_events silme ' || (SELECT candidate_count FROM public.auth_retention_runs WHERE id = run));
  IF r->>'error' <> 'policy_changed' OR pg_temp.cnt('SELECT count(*) FROM public.security_events') <> se_before THEN RAISE EXCEPTION 'F4 politika değişti: %', r; END IF;
  -- F5: imha ORTASINDA hata → alt işlem geri alınır (kısmi imha yok).
  r := public.auth_retention_preview('o', 'security_events');
  run := (r->>'run_id')::uuid;
  CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF OLD.ip_address = '203.0.113.3' THEN RAISE EXCEPTION 'yapay'; END IF; RETURN OLD; END $f$;
  CREATE TRIGGER f2h_boom BEFORE DELETE ON public.security_events FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
  PERFORM pg_temp.proof('o', 'retention_execute', run, odev);
  r := public.auth_retention_execute('o', run, 'security_events silme ' || (SELECT candidate_count FROM public.auth_retention_runs WHERE id = run));
  DROP TRIGGER f2h_boom ON public.security_events;
  IF (r->>'ok')::boolean OR pg_temp.cnt('SELECT count(*) FROM public.security_events') <> se_before THEN RAISE EXCEPTION 'F5 kısmi imha olmamalı: % (%)', r, pg_temp.cnt('SELECT count(*) FROM public.security_events'); END IF;
  IF EXISTS (SELECT 1 FROM public.auth_retention_context) THEN RAISE EXCEPTION 'F6 hata sonrası bağlam kalmamalı'; END IF;
  -- F7: süresi dolan önizleme.
  r := public.auth_retention_preview('o', 'security_events');
  run := (r->>'run_id')::uuid;
  UPDATE public.auth_retention_runs SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours' WHERE id = run;
  r := public.auth_retention_execute('o', run, 'x');
  IF r->>'code' <> 'expired' THEN RAISE EXCEPTION 'F7 süresi dolan önizleme: %', r; END IF;
  -- F8: iptal.
  r := public.auth_retention_preview('o', 'security_events');
  run := (r->>'run_id')::uuid;
  r := public.auth_retention_cancel('o', run);
  r := public.auth_retention_execute('o', run, 'x');
  IF r->>'code' <> 'not_previewed' THEN RAISE EXCEPTION 'F8 iptal edilen çalıştırma yürütülemez: %', r; END IF;
  -- F9: saklama kaldırma kanıt ister; kaldırılınca açık önizlemeler geçersiz.
  r := public.auth_retention_hold_release('o', hold);
  IF r->>'code' <> 'step_up_required' THEN RAISE EXCEPTION 'F9 saklama kaldırma kanıt ister: %', r; END IF;
  PERFORM pg_temp.proof('o', 'retention_policy', (r->>'target')::uuid, odev);
  r := public.auth_retention_hold_release('o', hold);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'F10 kanıtla kaldırma: %', r; END IF;
  -- F11: görünüm kişisel veri / satır içeriği içermez.
  r := public.auth_retention_overview('o');
  IF NOT (r->>'ok')::boolean OR r::text LIKE '%203.0.113%' OR r::text LIKE '%kayıtlı numaradan%' THEN RAISE EXCEPTION 'F11 görünüm: %', r; END IF;
  r := public.auth_retention_overview('o-stale');
  IF r->>'code' <> 'forbidden' THEN RAISE EXCEPTION 'F12 görünüm taze Owner: %', r; END IF;
  RAISE NOTICE 'session-f2h-assert: GEÇTİ';
END $$;
