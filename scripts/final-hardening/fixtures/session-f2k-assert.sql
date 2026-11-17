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

DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(msg, E'\n  ' ORDER BY id) INTO v FROM f2k_fail;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION E'F2-K ihlalleri (% madde):\n  %', (SELECT count(*) FROM f2k_fail), v;
  END IF;
  RAISE NOTICE 'session-f2k: PASS';
END $$;
