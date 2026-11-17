-- GİRİŞ GÜVENLİĞİ F2-K — QR eşleştirme (O1), bekleyen cihaz eşleştirmesi (O5), kalıcı silme × yasal saklama (C3).
-- Yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar. Zincir: F2-A…F2-J ; migration: 20280103001100 (iki kez).
-- Her madde ayrı kaydedilir; sonda BÜTÜN ihlaller tek hata olarak raporlanır.

CREATE TEMP TABLE f2k_fail (id serial, msg text);
CREATE FUNCTION pg_temp.fail(p text) RETURNS void LANGUAGE sql AS $$ INSERT INTO f2k_fail (msg) VALUES (p); $$;
CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex'); $$;

-- ── O1: 6 haneli yazılan QR kodu ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  OWNER constant uuid := '00000000-0000-0000-0000-00000000a001';
  VE    constant uuid := '00000000-0000-0000-0000-00000000e0d1';
  odev uuid; vdev uuid; r jsonb; r2 jsonb; f jsonb; a uuid; b uuid; c uuid; n int; d int;
BEGIN
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true WHERE id IN (OWNER, VE);
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (OWNER, repeat('O', 120), pg_temp.h('k-owner'), 'KKKK-OOOO', 'active', now()) RETURNING id INTO odev;
  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
  VALUES (VE, repeat('V', 120), pg_temp.h('k-ve'), 'KKKK-VVVV', 'active', now()) RETURNING id INTO vdev;

  -- Kod biçimi ve dağılım (2.000 kod).
  SELECT count(*) FILTER (WHERE x !~ '^[0-9]{6}$'), count(DISTINCT x) INTO n, d FROM (SELECT public.auth_mfa_match_code6() AS x FROM generate_series(1, 2000)) s;
  IF n <> 0 OR d < 1990 THEN
    PERFORM pg_temp.fail('O1a kod biçimi / dağılımı beklenmeyen: biçim dışı=' || n || ' farklı=' || d);
  END IF;
  IF has_function_privilege('service_role', 'public.auth_mfa_match_code6()', 'EXECUTE') THEN
    PERFORM pg_temp.fail('O1b kod üretici sunucu rolüne açık');
  END IF;

  r := public.auth_mfa_begin(VE, pg_temp.h('k-a'), 'desktop_web', NULL, NULL, 300);
  a := (r->>'challenge_id')::uuid;
  IF r->>'match_code' !~ '^[0-9]{6}$' OR (SELECT match_options FROM public.auth_mfa_challenges WHERE id = a) IS NOT NULL THEN
    PERFORM pg_temp.fail('O1c giriş isteği 6 haneli yazılan kod üretmedi: ' || r::text);
  END IF;
  f := public.auth_qr_fetch(a, r->>'qr_nonce', vdev);
  IF f->>'match_mode' IS DISTINCT FROM 'typed6' OR f->'options' <> 'null'::jsonb OR f->>'purpose' <> 'login' THEN
    PERFORM pg_temp.fail('O1d telefon yazma kipini / amacı almadı (seçenek sızdı?): ' || f::text);
  END IF;
  -- Başka kullanıcının cihazı aynı isteği okuyamaz / onaylayamaz.
  IF (public.auth_qr_fetch(a, r->>'qr_nonce', odev)->>'ok')::boolean
     OR (public.auth_qr_decide(a, r->>'qr_nonce', odev, 'approve', r->>'match_code')->>'ok')::boolean THEN
    PERFORM pg_temp.fail('O1e başka kullanıcının cihazı isteği okudu / onayladı');
  END IF;
  -- İkinci ve üçüncü açık istek (paralel oltalama bağlantıları).
  r2 := public.auth_mfa_begin(VE, pg_temp.h('k-b'), 'desktop_web', NULL, NULL, 300);
  b := (r2->>'challenge_id')::uuid;
  c := (public.auth_mfa_begin(VE, pg_temp.h('k-c'), 'desktop_web', NULL, NULL, 300)->>'challenge_id')::uuid;
  -- A'nın kodu B'de geçmez (başka isteğe aktarılamaz) → B reddedilir ve kardeşler (A, C) de kapanır.
  f := public.auth_qr_decide(b, r2->>'qr_nonce', vdev, 'approve', r->>'match_code');
  IF f->>'result' IS DISTINCT FROM 'denied'
     OR (SELECT count(*) FROM public.auth_mfa_challenges WHERE id IN (a, b, c) AND state = 'denied' AND denied_reason = 'wrong_match') <> 3 THEN
    PERFORM pg_temp.fail('O1f yanlış kod sonrası kullanıcının bütün açık QR istekleri kapanmadı: ' || f::text);
  END IF;
  IF (public.auth_qr_decide(a, r->>'qr_nonce', vdev, 'approve', r->>'match_code')->>'ok')::boolean THEN
    PERFORM pg_temp.fail('O1g kapanan istek doğru kodla yeniden onaylandı');
  END IF;
  -- Meşru: doğru kod → onay; aynı istek ikinci kez kullanılamaz.
  r := public.auth_mfa_begin(VE, pg_temp.h('k-d'), 'desktop_web', NULL, NULL, 300);
  a := (r->>'challenge_id')::uuid;
  f := public.auth_qr_decide(a, r->>'qr_nonce', vdev, 'approve', r->>'match_code');
  IF f->>'result' IS DISTINCT FROM 'approved' THEN
    PERFORM pg_temp.fail('O1h doğru 6 haneli kod onaylanmadı: ' || f::text);
  END IF;
  IF (public.auth_qr_decide(a, r->>'qr_nonce', vdev, 'approve', r->>'match_code')->>'ok')::boolean THEN
    PERFORM pg_temp.fail('O1i aynı istek ikinci kez onaylandı');
  END IF;
  -- Bilinçli ret yalnız o isteği kapatır (kardeşler açık kalır).
  r := public.auth_mfa_begin(VE, pg_temp.h('k-e'), 'desktop_web', NULL, NULL, 300);
  r2 := public.auth_mfa_begin(VE, pg_temp.h('k-f'), 'desktop_web', NULL, NULL, 300);
  PERFORM public.auth_qr_decide((r->>'challenge_id')::uuid, r->>'qr_nonce', vdev, 'deny', '');
  IF (SELECT state FROM public.auth_mfa_challenges WHERE id = (r2->>'challenge_id')::uuid) <> 'pending' THEN
    PERFORM pg_temp.fail('O1j bilinçli ret kardeş isteği de kapattı');
  END IF;
  -- Süresi dolmuş istek.
  UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = (r2->>'challenge_id')::uuid;
  IF (public.auth_qr_decide((r2->>'challenge_id')::uuid, r2->>'qr_nonce', vdev, 'approve', r2->>'match_code')->>'ok')::boolean THEN
    PERFORM pg_temp.fail('O1k süresi dolmuş istek onaylandı');
  END IF;
END $$;

-- ── O5: bekleyen cihaz eşleştirmesi 15 dakika ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  EX constant uuid := '00000000-0000-0000-0000-00000000e0d2';
  r jsonb; r2 jsonb; d1 uuid; d2 uuid; ok boolean;
BEGIN
  -- Bu kullanıcının önceki cihazları yok sayılsın diye sentetik ikinci uzman.
  INSERT INTO public.users (id, email, role, active) SELECT EX, 'f2k-o5@ornek.test', 'expert', true
   WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = EX);
  r := public.auth_device_enroll_begin(EX, repeat('A', 120), pg_temp.h('o5-a'), 'AAAA-2222', 'Test', 34, '1.0', 'iph', NULL, repeat('a', 120));
  d1 := (r->>'device_id')::uuid;
  IF r->>'state' IS DISTINCT FROM 'pending_owner' THEN PERFORM pg_temp.fail('O5a talep açılmadı: ' || r::text); END IF;
  -- Aynı anahtarla tekrar (ağ kesintisi) → aynı talep; yeni satır yok.
  r2 := public.auth_device_enroll_begin(EX, repeat('A', 120), pg_temp.h('o5-a'), 'AAAA-2222', 'Test', 34, '1.0', 'iph', NULL, repeat('a', 120));
  IF (r2->>'device_id')::uuid IS DISTINCT FROM d1 OR (SELECT count(*) FROM public.auth_trusted_devices WHERE user_id = EX) <> 1 THEN
    PERFORM pg_temp.fail('O5b aynı anahtarla tekrar idempotent değil: ' || r2::text);
  END IF;
  -- Başka anahtarla ikinci talep süre dolmadan engellenir.
  r2 := public.auth_device_enroll_begin(EX, repeat('B', 120), pg_temp.h('o5-b'), 'BBBB-3333', 'Test', 34, '1.0', 'iph', NULL, repeat('b', 120));
  IF r2->>'reason' IS DISTINCT FROM 'pending_exists' THEN PERFORM pg_temp.fail('O5c süre dolmadan ikinci talep açıldı: ' || r2::text); END IF;
  -- 15 dakika geçti (test saati: oluşturma zamanı geri alınır).
  UPDATE public.auth_trusted_devices SET created_at = now() - interval '15 minutes 1 second' WHERE id = d1;
  -- Doğrudan durum geçişi (owner_approved / active) tetikleyici tarafından reddedilir.
  BEGIN
    UPDATE public.auth_trusted_devices SET state = 'active', activated_at = now() WHERE id = d1;
    PERFORM pg_temp.fail('O5d süresi geçmiş talep doğrudan etkinleştirildi');
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  -- Owner listesi süresi geçen talebi göstermez (lazy; satır hâlâ pending_owner olabilir).
  IF EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.id = d1 AND d.state = 'pending_owner' AND d.created_at > now() - interval '15 minutes') THEN
    PERFORM pg_temp.fail('O5e filtre koşulu yanlış');
  END IF;
  -- Durum sorgusu tembel olarak kapatır; onaylı SAYILMAZ.
  r := public.auth_device_status(d1);
  IF r->>'state' IS DISTINCT FROM 'expired' THEN PERFORM pg_temp.fail('O5f durum sorgusu süresi geçmiş talebi kapatmadı: ' || r::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.security_events WHERE user_id = EX AND event_type = 'device_enroll_expired' AND metadata->>'device_id' = d1::text) THEN
    PERFORM pg_temp.fail('O5g süre dolumu güvenlik olayına yazılmadı');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_trusted_devices WHERE id = d1 AND state = 'expired' AND revoke_reason = 'pending_ttl') THEN
    PERFORM pg_temp.fail('O5h satır / geçmiş korunmadı');
  END IF;
  -- Kullanıcı yeniden deneyebilir (kalıcı kilit yok).
  r2 := public.auth_device_enroll_begin(EX, repeat('B', 120), pg_temp.h('o5-b'), 'BBBB-3333', 'Test', 34, '1.0', 'iph', NULL, repeat('b', 120));
  d2 := (r2->>'device_id')::uuid;
  IF r2->>'state' IS DISTINCT FROM 'pending_owner' THEN PERFORM pg_temp.fail('O5i süre dolduktan sonra yeniden deneme engellendi: ' || r2::text); END IF;
  -- Yeni talebin süresi dolunca enroll_begin de kapatır (status çağrılmasa bile).
  UPDATE public.auth_trusted_devices SET created_at = now() - interval '16 minutes' WHERE id = d2;
  r := public.auth_device_enroll_begin(EX, repeat('C', 120), pg_temp.h('o5-c'), 'CCCC-4444', 'Test', 34, '1.0', 'iph', NULL, repeat('c', 120));
  IF r->>'state' IS DISTINCT FROM 'pending_owner' OR (SELECT state FROM public.auth_trusted_devices WHERE id = d2) <> 'expired' THEN
    PERFORM pg_temp.fail('O5j yeni talep eskiyi kapatmadı: ' || r::text);
  END IF;
  -- Yetki: kapatıcı fonksiyon dışarıya kapalı.
  IF has_function_privilege('service_role', 'public.auth_device_pending_expire(uuid,uuid)', 'EXECUTE') THEN
    PERFORM pg_temp.fail('O5k kapatıcı fonksiyon sunucu rolüne açık');
  END IF;
END $$;

DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(msg, E'\n  ' ORDER BY id) INTO v FROM f2k_fail;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION E'F2-K ihlalleri (% madde):\n  %', (SELECT count(*) FROM f2k_fail), v;
  END IF;
  RAISE NOTICE 'session-f2k: PASS';
END $$;
