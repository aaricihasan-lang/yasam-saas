-- GİRİŞ GÜVENLİĞİ F2-K — kritik yetki ve cihaz güvenliği kapatma. F2-A…F2-J'ye bağımlı, EKLEYİCİ.
-- Owner talimatı 17.11.2026 (N2 → A3 → O1 → O5 → C3).
--
--   K1 (N2) Yönetici yetkisi kazandıran HER geçiş (yönetici satırı ekleme, rolü yöneticiye yükseltme, pasif yöneticiyi
--      etkinleştirme) yalnız Owner'ın işleme özel kanıtını (step-up 'admin_grant', hedefe bağlı, 5 dk, tek kullanım) tüketen
--      SECURITY DEFINER fonksiyonlarının açtığı işlem içi işaretle mümkündür (users tetikleyicisi; eski rota, toplu işlem,
--      başka SQL fonksiyonu veya doğrudan sunucu rolü yazımı bunu atlayamaz). Süper yönetici işaretinin açılması hiçbir
--      uygulama yolundan mümkün değildir. Yeni / yükseltilen yöneticide MFA zorunludur (MFA'sız oturum açılamaz).
--      Yetki AZALTAN işlemler (rol düşürme, pasifleştirme, arşivleme) etkilenmez.

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 1100;
  v_known   constant integer := 1100;
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
      (1100, to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL)
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

-- ── K1a) Step-up işlem listesi: + admin_grant ─────────────────────────────────
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_step_up_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_step_up_chk
  CHECK ((purpose = 'step_up') = (step_action IS NOT NULL AND step_target IS NOT NULL AND step_session_id IS NOT NULL)
     AND (step_action IS NULL OR step_action IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy',
                                                 'retention_execute', 'password_reset', 'admin_grant')));

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
  IF p_action IS NULL OR p_action NOT IN ('device_approve', 'mfa_disable', 'recovery_execute', 'retention_policy', 'retention_execute', 'password_reset', 'admin_grant') OR p_target IS NULL THEN
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
  -- QR nonce (192 bit) + 6 haneli yazılan eşleştirme kodu (F2-K O1).
  v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  -- F2-K (O1): 6 haneli, kriptografik rastgele kod; seçenek listesi YOK → telefonda kullanıcı kodu YAZAR.
  v_match := public.auth_mfa_match_code6();
  v_codes := NULL;
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

-- ── K1b) users: yönetici yetkisi kazanımı yalnız kanıtlı fonksiyonlarla ───────────
CREATE OR REPLACE FUNCTION public.users_admin_grant_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_new boolean := lower(btrim(coalesce(NEW.role::text, ''))) = 'admin' AND NEW.active IS TRUE;
  v_old boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := lower(btrim(coalesce(OLD.role::text, ''))) = 'admin' AND OLD.active IS TRUE;
  END IF;
  IF v_new AND NOT v_old AND current_setting('yasam.admin_grant', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'users: yönetici yetkisi yalnız Owner işleme özel doğrulamasıyla verilebilir' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_super_admin IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_super_admin IS NOT TRUE)
     AND current_setting('yasam.super_admin_grant', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'users: sistem sahibi işareti uygulama yolundan verilemez' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.users_admin_grant_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_users_admin_grant_guard ON public.users;
CREATE TRIGGER trg_users_admin_grant_guard
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_admin_grant_guard();

-- ── K1c) Kanıt: Owner + son 30 dk MFA'lı oturum + 'admin_grant' kanıtı (hedefe bağlı, tek kullanım). İç yardımcı.
--        MFA kullanmayan Owner için GEVŞEME YOK (password_reset'ten farkı): yetki verme her zaman kanıt ister.
CREATE OR REPLACE FUNCTION public.auth_admin_grant_proof(p_actor_token text, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s     record;
  v_proof uuid;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  IF v_s.mfa_method IS NULL OR public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
  END IF;
  v_proof := public.auth_step_up_lock(p_actor_token, 'admin_grant', p_target);
  IF v_proof IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'admin_grant', 'target', p_target);
  END IF;
  PERFORM public.auth_step_up_consume(v_proof);
  RETURN jsonb_build_object('ok', true, 'actor', v_s.user_id);
END $$;
REVOKE ALL ON FUNCTION public.auth_admin_grant_proof(text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Yeni yönetici için kanıt hedefi: e-postadan türetilmiş sabit kimlik (kanıt bu adrese bağlıdır).
CREATE OR REPLACE FUNCTION public.auth_admin_grant_email_target(p_email text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT md5('admin_grant:' || lower(btrim(coalesce(p_email, ''))))::uuid $$;
REVOKE ALL ON FUNCTION public.auth_admin_grant_email_target(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_admin_grant_email_target(text) TO service_role;

-- Yetki verildikten sonra: MFA zorunlu (yöntem kurulana kadar oturum açılamaz), açık oturumlar kapanır, denetim kaydı.
CREATE OR REPLACE FUNCTION public.auth_admin_grant_finish(p_actor uuid, p_user uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = true, mfa_required_at = coalesce(mfa_required_at, now())
   WHERE id = p_user AND mfa_required IS NOT TRUE;
  PERFORM set_config('yasam.mfa_policy', 'off', true);
  UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'admin_granted'
   WHERE user_id = p_user AND is_active = true;
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user, 'admin_role_granted', 'high', 'Yönetici yetkisi verildi (Owner işleme özel doğrulaması ile)',
          jsonb_build_object('actor_id', p_actor, 'kind', p_kind));
END $$;
REVOKE ALL ON FUNCTION public.auth_admin_grant_finish(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── K1d) Yeni yönetici oluşturma (yalnız bu yol) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_admin_create_admin(p_actor_token text, p_payload jsonb, p_membership jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_p     jsonb;
  v_res   jsonb;
  v_uid   uuid;
BEGIN
  IF v_email = '' OR p_payload ? 'is_super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  v_p := public.auth_admin_grant_proof(p_actor_token, public.auth_admin_grant_email_target(v_email));
  IF coalesce((v_p->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_p;
  END IF;
  PERFORM set_config('yasam.admin_grant', 'on', true);
  v_res := public.admin_create_user_with_modules(
    p_payload || jsonb_build_object('role', 'admin', 'actor_admin_id', v_p->>'actor'),
    p_membership, '{}'::jsonb, '{}'::text[]);
  PERFORM set_config('yasam.admin_grant', 'off', true);
  IF coalesce(v_res->>'outcome', '') = 'provisioned' THEN
    v_uid := (v_res->>'user_id')::uuid;
    PERFORM public.auth_admin_grant_finish((v_p->>'actor')::uuid, v_uid, 'create');
  END IF;
  RETURN jsonb_build_object('ok', true) || v_res;
END $$;
REVOKE ALL ON FUNCTION public.auth_admin_create_admin(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_admin_create_admin(text, jsonb, jsonb) TO service_role;

-- ── K1e) Mevcut kullanıcıyı yöneticiye yükseltme / pasif yöneticiyi etkinleştirme ─────────────────
CREATE OR REPLACE FUNCTION public.auth_admin_role_grant(p_actor_token text, p_user_id uuid, p_op text, p_expected_active boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p   jsonb;
  v_u   public.users%ROWTYPE;
  v_res jsonb;
BEGIN
  IF p_user_id IS NULL OR p_op IS NULL OR p_op NOT IN ('promote', 'activate') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT * INTO v_u FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_u.is_super_admin IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_op = 'promote' AND lower(btrim(coalesce(v_u.role::text, ''))) = 'admin' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;
  IF p_op = 'activate' AND lower(btrim(coalesce(v_u.role::text, ''))) <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  v_p := public.auth_admin_grant_proof(p_actor_token, p_user_id);
  IF coalesce((v_p->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_p;
  END IF;
  PERFORM set_config('yasam.admin_grant', 'on', true);
  IF p_op = 'promote' THEN
    UPDATE public.users SET role = 'admin' WHERE id = p_user_id;
    v_res := jsonb_build_object('changed', true);
  ELSE
    v_res := public.admin_set_user_active(p_user_id, (v_p->>'actor')::uuid, true, p_expected_active);
  END IF;
  PERFORM set_config('yasam.admin_grant', 'off', true);
  PERFORM public.auth_admin_grant_finish((v_p->>'actor')::uuid, p_user_id, p_op);
  RETURN jsonb_build_object('ok', true) || coalesce(v_res, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.auth_admin_role_grant(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_admin_role_grant(text, uuid, text, boolean) TO service_role;

-- ── K2 (O1) QR eşleştirme: 6 haneli YAZILAN kod (3 seçenek yerine) + kullanıcı kilidi + yanlış kodda kardeş istekler ─
-- Kod tek güvenlik faktörü DEĞİLDİR: onay yine güvenilir cihazın asıl anahtarıyla imzalanır (YS-QR-DECIDE-V1).
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_match_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_match_chk
  CHECK ((match_code IS NULL OR match_code ~ '^[0-9]{2}$' OR match_code ~ '^[0-9]{6}$')
     AND (qr_nonce_hash IS NULL OR qr_nonce_hash ~ '^[0-9a-f]{64}$')
     AND (denied_reason IS NULL OR denied_reason IN ('user_denied', 'wrong_match', 'device_revoked', 'otp_locked',
                                                      'recovery_locked', 'account_recovery', 'credentials_changed')));

-- 000000…999999 eşit dağılımlı (reddederek örnekleme; 32 bit).
CREATE OR REPLACE FUNCTION public.auth_mfa_match_code6()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $f2k$
DECLARE
  v_b bytea;
  v_n bigint;
BEGIN
  LOOP
    v_b := extensions.gen_random_bytes(4);
    v_n := (get_byte(v_b, 0)::bigint << 24) | (get_byte(v_b, 1)::bigint << 16) | (get_byte(v_b, 2)::bigint << 8) | get_byte(v_b, 3)::bigint;
    EXIT WHEN v_n < 4294000000;
  END LOOP;
  RETURN lpad((v_n % 1000000)::text, 6, '0');
END $f2k$;
REVOKE ALL ON FUNCTION public.auth_mfa_match_code6() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_mfa_begin(
  p_user_id             uuid,
  p_browser_secret_hash text,
  p_client_channel      text,
  p_ip_hash             text,
  p_user_agent          text,
  p_ttl_seconds         integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_user  public.users%ROWTYPE;
  v_open  integer;
  v_ttl   integer := least(greatest(coalesce(p_ttl_seconds, 300), 60), 900);
  v_id    uuid;
  v_nonce text;
  v_codes text[] := ARRAY[]::text[];
  v_c     text;
  v_match text;
BEGIN
  IF p_user_id IS NULL OR p_browser_secret_hash IS NULL OR p_browser_secret_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mfa:' || p_user_id::text, 0));

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;
  IF v_user.mfa_required IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_required');
  END IF;

  UPDATE public.auth_mfa_challenges
     SET state = 'expired'
   WHERE user_id = p_user_id AND state IN ('pending', 'verified') AND expires_at <= v_now;
  SELECT count(*) INTO v_open FROM public.auth_mfa_challenges
   WHERE user_id = p_user_id AND state IN ('pending', 'verified');
  IF v_open >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_open');
  END IF;

  -- QR nonce: 192 bit, base64url; yalnız özeti saklanır. Eşleştirme: 6 haneli yazılan kod (F2-K O1).
  v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  -- F2-K (O1): 6 haneli, kriptografik rastgele kod; seçenek listesi YOK → telefonda kullanıcı kodu YAZAR.
  v_match := public.auth_mfa_match_code6();
  v_codes := NULL;

  INSERT INTO public.auth_mfa_challenges (user_id, browser_secret_hash, client_channel, ip_hash, user_agent,
                                          created_at, expires_at, qr_nonce_hash, match_code, match_options)
  VALUES (p_user_id, p_browser_secret_hash,
          CASE WHEN p_client_channel IN ('desktop_web','mobile_web','tablet_web','android_app','unknown') THEN p_client_channel ELSE 'unknown' END,
          left(p_ip_hash, 128), left(p_user_agent, 512), v_now, v_now + make_interval(secs => v_ttl),
          encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex'), v_match, v_codes)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'challenge_id', v_id, 'expires_at', v_now + make_interval(secs => v_ttl),
                            'qr_nonce', v_nonce, 'match_code', v_match);
END $$;
REVOKE ALL ON FUNCTION public.auth_mfa_begin(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_begin(uuid, text, text, text, text, integer) TO service_role;

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
                            -- F2-K (O1): 'typed6' → telefonda 6 haneli kod yazılır; 'options' → eski 3 seçenek (geçiş).
                            'match_mode', CASE WHEN v_ch.match_options IS NULL THEN 'typed6' ELSE 'options' END,
                            'client_channel', v_ch.client_channel, 'created_at', v_ch.created_at, 'expires_at', v_ch.expires_at,
                            -- F2-I: telefon isteğin amacını gösterir (giriş mi, Owner'ın kritik işlemi mi).
                            'purpose', v_ch.purpose, 'action', v_ch.step_action);
END $$;
REVOKE ALL ON FUNCTION public.auth_qr_fetch(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_qr_fetch(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_qr_decide(
  p_challenge_id uuid, p_qr_nonce text, p_device_id uuid, p_decision text, p_match_code text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ch public.auth_mfa_challenges%ROWTYPE;
  v_dev public.auth_trusted_devices%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approve', 'deny') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- F2-K (O1): aynı kullanıcının kararları sıraya girer (paralel tahmin / çift dokunuş yarışı yok).
  SELECT * INTO v_dev FROM public.auth_trusted_devices WHERE id = p_device_id AND state = 'active' FOR SHARE;
  IF v_dev.id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mfa:' || v_dev.user_id::text, 0));
  END IF;
  SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF v_dev.id IS NULL OR v_ch.id IS NULL OR v_ch.user_id <> v_dev.user_id OR v_ch.state <> 'pending'
     OR v_ch.expires_at <= now() OR v_ch.qr_nonce_hash IS NULL OR p_qr_nonce IS NULL
     OR v_ch.qr_nonce_hash <> encode(sha256(convert_to(p_qr_nonce, 'UTF8')), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_decision = 'deny' OR p_match_code IS DISTINCT FROM v_ch.match_code THEN
    UPDATE public.auth_mfa_challenges
       SET state = 'denied', denied_reason = CASE WHEN p_decision = 'deny' THEN 'user_denied' ELSE 'wrong_match' END,
           approved_device_id = v_dev.id
     WHERE id = v_ch.id;
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (v_ch.user_id, CASE WHEN p_decision = 'deny' THEN 'mfa_qr_denied' ELSE 'mfa_qr_wrong_match' END,
            CASE WHEN p_decision = 'deny' THEN 'medium' ELSE 'high' END,
            CASE WHEN p_decision = 'deny' THEN 'QR giriş isteği telefondan reddedildi' ELSE 'QR girişinde yanlış eşleştirme kodu (olası kimlik avı)' END,
            jsonb_build_object('device_id', v_dev.id, 'challenge_id', v_ch.id));
    -- F2-K (O1): yanlış kod = olası oltalama → kullanıcının BÜTÜN açık QR istekleri (giriş + kritik işlem) kapanır;
    -- paralel gönderilmiş bağlantılarla körlemesine deneme sayısı 1'e iner. (Bilinçli ret yalnız bu isteği kapatır.)
    IF p_decision = 'approve' THEN
      UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'wrong_match'
       WHERE user_id = v_ch.user_id AND id <> v_ch.id AND state = 'pending' AND qr_nonce_hash IS NOT NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'result', 'denied');
  END IF;

  IF NOT public.auth_mfa_mark_verified(v_ch.id, 'qr_device') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  UPDATE public.auth_mfa_challenges SET approved_device_id = v_dev.id WHERE id = v_ch.id;
  UPDATE public.auth_trusted_devices SET last_used_at = now() WHERE id = v_dev.id;
  RETURN jsonb_build_object('ok', true, 'result', 'approved');
END $$;
REVOKE ALL ON FUNCTION public.auth_qr_decide(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_qr_decide(uuid, text, uuid, text, text) TO service_role;


-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 1100 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
