-- =============================================================================
-- 20280103000100_auth_mfa_core_f2b.sql
--
-- GİRİŞ GÜVENLİĞİ F2-B — ortak MFA altyapısı (A/2: EKLEYİCİ; mevcut kodla uyumlu).
-- BAĞIMLILIK: 20280103000000_auth_session_hardening_f2a.sql (auth_is_owner_admin, android süresi).
--
-- HEDEF: Şifre → geçici MFA challenge → ikinci doğrulama → auth_finalize_login → oturum.
--
--   * users.mfa_required (varsayılan false): ZORUNLULUK kullanıcı başına VERİTABANINDA tutulur.
--     Env bayrakları yalnız hangi yöntemlerin SUNULACAĞINI belirler; zorunluluğu kaldıramaz.
--     Değişiklik YALNIZ auth_mfa_set_required (Owner, audit'li) ile; Owner kendi zorunluluğunu
--     kaldıramaz (acil durum = SQL konsolu).
--   * auth_mfa_challenges: challenge oturum DEĞİLDİR (user_sessions'a yazılmaz). Tarayıcı bağlama
--     sırrının YALNIZ sha256 özeti saklanır. Tek kullanımlık: pending → verified → consumed.
--   * auth_mfa_mark_verified: ikinci doğrulama yöntemleri (F2-C QR / F2-D e-posta) bunu kendi
--     SECURITY DEFINER fonksiyonlarından çağırır. service_role'e EXECUTE VERİLMEZ → hiçbir API
--     route'u bir challenge'ı doğrulanmış işaretleyemez (bu migration'da yöntem YOK).
--   * auth_finalize_login: TEK MFA'lı oturum oluşturma noktası (challenge FOR UPDATE kilidi,
--     bağlama + durum + süre + kullanıcı kontrolü, oturum + tüketim AYNI işlemde).
--   * user_sessions_mfa_guard: mfa_required kullanıcı için user_sessions INSERT'i YALNIZ
--     auth_finalize_login içinden (yasam.mfa_finalize) yapılabilir → admin doğrudan INSERT,
--     create_session_v2 doğrudan çağrısı, eski create_session_within_limits ATLATAMAZ.
--   * create_session_admin_web: admin web oturumu (Owner 2026-10-04 acil kararı: pending/üst sınır
--     YOK) artık uygulama kodunda doğrudan INSERT ile değil bu RPC ile açılır (D-04). 20280103000200
--     service_role'ün INSERT yetkisini bu kod deploy edildikten SONRA kaldırır.
--   * auth_mfa_test_accounts: production kontrollü test hesabı izin listesi (Owner; satır EKLENMEZ).
--
-- GÜVENLİK: SECURITY DEFINER + search_path='' ; tablolar RLS açık, policy yok, yalnız postgres.
-- VERİ: mevcut satır DEĞİŞMEZ (yeni kolonlar varsayılanla). Kimsenin mfa_required'ı açılmaz.
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS / guard'lı constraint.
-- ROLLBACK (yalnız gerekirse; MFA'lı kullanıcı YOKKEN): DROP TRIGGER user_sessions_mfa_guard_trg,
--   users_mfa_policy_guard_trg; DROP FUNCTION auth_* (bu dosyadakiler), create_session_admin_web;
--   tablolar/kolonlar zararsızdır, bırakılabilir.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 100;
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

-- ── 1) users: MFA zorunluluğu ────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_required_at timestamptz;

CREATE OR REPLACE FUNCTION public.users_mfa_policy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.mfa_required IS DISTINCT FROM OLD.mfa_required
     AND coalesce(current_setting('yasam.mfa_policy', true), '') <> 'on' THEN
    RAISE EXCEPTION 'users.mfa_required yalnız auth_mfa_set_required ile değiştirilebilir'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.users_mfa_policy_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_mfa_policy_guard_trg ON public.users;
CREATE TRIGGER users_mfa_policy_guard_trg
  BEFORE UPDATE OF mfa_required ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_mfa_policy_guard();

-- ── 2) user_sessions: MFA kanıtı ─────────────────────────────────────────────
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS mfa_method text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS mfa_challenge_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_mfa_method_chk'
                 AND conrelid = 'public.user_sessions'::regclass) THEN
    ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_mfa_method_chk
      CHECK (mfa_method IS NULL OR mfa_method IN ('qr_device', 'email_otp'));
  END IF;
END $$;

-- ── 3) Test hesabı izin listesi (Owner; satır eklenmez) ─────────────────────
CREATE TABLE IF NOT EXISTS public.auth_mfa_test_accounts (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  note       text NOT NULL CHECK (length(btrim(note)) BETWEEN 3 AND 200),
  added_by   uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT auth_mfa_test_accounts_window_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days')
);
ALTER TABLE public.auth_mfa_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_mfa_test_accounts FROM PUBLIC, anon, authenticated, service_role;

-- ── 4) MFA challenge'ları ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_mfa_challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose             text NOT NULL DEFAULT 'login' CHECK (purpose IN ('login')),
  state               text NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'verified', 'consumed', 'expired', 'denied')),
  browser_secret_hash text NOT NULL CHECK (browser_secret_hash ~ '^[0-9a-f]{64}$'),
  client_channel      text,
  ip_hash             text,
  user_agent          text CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  method              text CHECK (method IS NULL OR method IN ('qr_device', 'email_otp')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  verified_at         timestamptz,
  consumed_at         timestamptz,
  session_id          uuid,
  CONSTRAINT auth_mfa_challenges_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CONSTRAINT auth_mfa_challenges_verified_chk CHECK (state NOT IN ('verified', 'consumed') OR (method IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT auth_mfa_challenges_consumed_chk CHECK (state <> 'consumed' OR (consumed_at IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenges_user_state ON public.auth_mfa_challenges (user_id, state);
CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenges_expires ON public.auth_mfa_challenges (expires_at);
ALTER TABLE public.auth_mfa_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_mfa_challenges FROM PUBLIC, anon, authenticated, service_role;

-- ── 5) user_sessions INSERT kapısı (DB seviyesinde MFA zorunluluğu) ─────────
CREATE OR REPLACE FUNCTION public.user_sessions_mfa_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_finalize boolean := coalesce(current_setting('yasam.mfa_finalize', true), '') = 'on';
  v_required boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT u.mfa_required INTO v_required FROM public.users u WHERE u.id = NEW.user_id;
    IF coalesce(v_required, false) AND NOT v_finalize THEN
      RAISE EXCEPTION 'MFA zorunlu kullanıcı için oturum yalnız auth_finalize_login ile açılır'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.mfa_method IS NOT NULL OR NEW.mfa_challenge_id IS NOT NULL) AND NOT v_finalize THEN
      RAISE EXCEPTION 'MFA kanıt alanları yalnız auth_finalize_login ile yazılır' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: kapalı/bekleyen oturumun AKTİFLEŞMESİ (admin_decide_pending_session) MFA zorunlu kullanıcıda
  -- yalnız finalize içinde olabilir → MFA öncesi oluşmuş pending satırı onayla MFA'sız oturuma dönemez.
  IF OLD.is_active = false AND NEW.is_active = true AND NOT v_finalize THEN
    SELECT u.mfa_required INTO v_required FROM public.users u WHERE u.id = NEW.user_id;
    IF coalesce(v_required, false) THEN
      RAISE EXCEPTION 'MFA zorunlu kullanıcı için oturum yalnız auth_finalize_login ile aktifleşir'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- MFA kanıtı yalnız finalize içinde (NULL → değer) yazılır; sonra DEĞİŞMEZ.
  IF (NEW.mfa_method IS DISTINCT FROM OLD.mfa_method OR NEW.mfa_challenge_id IS DISTINCT FROM OLD.mfa_challenge_id)
     AND NOT (v_finalize AND OLD.mfa_method IS NULL AND OLD.mfa_challenge_id IS NULL) THEN
    RAISE EXCEPTION 'user_sessions MFA kanıt alanları değiştirilemez' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.user_sessions_mfa_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS user_sessions_mfa_guard_trg ON public.user_sessions;
CREATE TRIGGER user_sessions_mfa_guard_trg
  BEFORE INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.user_sessions_mfa_guard();

-- ── 6) Test hesabı sorgusu ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_is_test_account(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_mfa_test_accounts t
                  WHERE t.user_id = p_user_id AND t.expires_at > now());
$$;

REVOKE ALL ON FUNCTION public.auth_mfa_is_test_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_is_test_account(uuid) TO service_role;

-- ── 7a) Kullanıcının kullanılabilir ikinci doğrulama yöntemi var mı? ─────────
--   F2-B'de HİÇBİR yöntem yok → her zaman false (kimse hazırlıksız zorunlu yapılamaz).
--   F2-C (güvenilir Android cihazı) / F2-D (doğrulanmış e-posta) bu fonksiyonu GENİŞLETİR.
CREATE OR REPLACE FUNCTION public.auth_mfa_user_has_method(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.auth_mfa_user_has_method(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_user_has_method(uuid) TO service_role;

-- ── 7b) Zorunluluk değişikliği (yalnız Owner, audit'li) ─────────────────────
--   Aktör ID olarak DEĞİL, aktif oturum TOKEN'ı ile kanıtlanır (service_role kodu başkasının ID'sini
--   geçirip Owner taklidi yapamaz). Açmak için kullanıcının kullanılabilir yöntemi OLMALI.
DROP FUNCTION IF EXISTS public.auth_mfa_set_required(uuid, uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.auth_mfa_set_required(
  p_actor_token text, p_user_id uuid, p_required boolean, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old boolean;
  p_actor_id uuid;
BEGIN
  IF p_actor_token IS NULL OR btrim(p_actor_token) = '' OR p_user_id IS NULL OR p_required IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT s.user_id INTO p_actor_id
    FROM public.user_sessions s
   WHERE s.session_token = p_actor_token
     AND s.is_active = true
     AND s.session_state = 'active'
     AND (s.expires_at IS NULL OR s.expires_at > now())
   LIMIT 1;
  IF p_actor_id IS NULL OR NOT public.auth_is_owner_admin(p_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_required = true AND NOT public.auth_mfa_user_has_method(p_user_id) THEN
    -- Yöntemi olmayan hesabı zorunlu yapmak kullanıcıyı kilitler → reddedilir.
    RETURN jsonb_build_object('ok', false, 'code', 'no_method');
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 OR length(p_reason) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'reason_required');
  END IF;
  -- Owner kendi zorunluluğunu KALDIRAMAZ (ele geçirilmiş Owner oturumu MFA'yı kapatamasın).
  IF p_required = false AND p_actor_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'self_disable_forbidden');
  END IF;

  SELECT mfa_required INTO v_old FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_old = p_required THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users
     SET mfa_required = p_required,
         mfa_required_at = CASE WHEN p_required THEN now() ELSE NULL END
   WHERE id = p_user_id;
  PERFORM set_config('yasam.mfa_policy', 'off', true);

  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user_id, 'mfa_policy_changed', 'high',
          CASE WHEN p_required THEN 'MFA zorunluluğu açıldı' ELSE 'MFA zorunluluğu kaldırıldı' END,
          jsonb_build_object('actor_id', p_actor_id, 'required', p_required, 'reason', btrim(p_reason)));

  RETURN jsonb_build_object('ok', true, 'changed', true, 'required', p_required);
END $$;

REVOKE ALL ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean, text) TO service_role;

-- ── 8) Challenge başlatma (parola doğrulandıktan SONRA; oturum AÇMAZ) ───────
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
  v_now  timestamptz := now();
  v_user public.users%ROWTYPE;
  v_open integer;
  v_ttl  integer := least(greatest(coalesce(p_ttl_seconds, 300), 60), 900);
  v_id   uuid;
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

  -- Süresi geçen açık challenge'lar kapanır; kullanıcı başına en fazla 5 açık challenge.
  UPDATE public.auth_mfa_challenges
     SET state = 'expired'
   WHERE user_id = p_user_id AND state IN ('pending', 'verified') AND expires_at <= v_now;
  SELECT count(*) INTO v_open FROM public.auth_mfa_challenges
   WHERE user_id = p_user_id AND state IN ('pending', 'verified');
  IF v_open >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_open');
  END IF;

  INSERT INTO public.auth_mfa_challenges (user_id, browser_secret_hash, client_channel, ip_hash, user_agent, created_at, expires_at)
  VALUES (p_user_id, p_browser_secret_hash,
          CASE WHEN p_client_channel IN ('desktop_web','mobile_web','tablet_web','android_app','unknown') THEN p_client_channel ELSE 'unknown' END,
          left(p_ip_hash, 128), left(p_user_agent, 512), v_now, v_now + make_interval(secs => v_ttl))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'challenge_id', v_id, 'expires_at', v_now + make_interval(secs => v_ttl));
END $$;

REVOKE ALL ON FUNCTION public.auth_mfa_begin(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_begin(uuid, text, text, text, text, integer) TO service_role;

-- ── 9) Challenge durumu (YALNIZ bağlama sırrı sahibine; kullanıcı verisi DÖNMEZ) ─
CREATE OR REPLACE FUNCTION public.auth_mfa_challenge_status(p_challenge_id uuid, p_browser_secret_hash text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.auth_mfa_challenges%ROWTYPE;
BEGIN
  IF p_challenge_id IS NULL OR p_browser_secret_hash IS NULL THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  SELECT * INTO v FROM public.auth_mfa_challenges WHERE id = p_challenge_id;
  IF NOT FOUND OR v.browser_secret_hash <> p_browser_secret_hash THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  IF v.state IN ('pending', 'verified') AND v.expires_at <= now() THEN
    UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE id = v.id AND state IN ('pending', 'verified');
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  -- user_id yalnız SUNUCU içindir (tamamlama adımında hesap gating'i); status route istemciye DÖNMEZ.
  RETURN jsonb_build_object('state', v.state, 'expires_at', v.expires_at, 'user_id', v.user_id);
END $$;

REVOKE ALL ON FUNCTION public.auth_mfa_challenge_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_challenge_status(uuid, text) TO service_role;

-- ── 10) Doğrulandı işareti (YALNIZ yöntem fonksiyonları; service_role'e VERİLMEZ) ─
CREATE OR REPLACE FUNCTION public.auth_mfa_mark_verified(p_challenge_id uuid, p_method text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('qr_device', 'email_otp') THEN
    RETURN false;
  END IF;
  UPDATE public.auth_mfa_challenges
     SET state = 'verified', method = p_method, verified_at = now()
   WHERE id = p_challenge_id AND state = 'pending' AND expires_at > now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

REVOKE ALL ON FUNCTION public.auth_mfa_mark_verified(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 11) Admin web oturumu (D-04; Owner 2026-10-04 acil kararı aynen) ─────────
--   Önceki uygulama kodu (lib/auth/sessionSecurity.ts) bu INSERT'i doğrudan yapıyordu. Davranış
--   birebir: aynı cihaz eski token'ı (aynı kullanıcı) kapanır, yeni oturum doğrudan AKTİF; pending /
--   2-web üst sınırı YOK. Kimlik + active/rol gating ÇAĞIRANDA; burada savunma olarak tekrar.
CREATE OR REPLACE FUNCTION public.create_session_admin_web(
  p_user_id       uuid,
  p_session_token text,
  p_ip            text,
  p_country       text,
  p_city          text,
  p_user_agent    text,
  p_platform      text,
  p_client_channel text,
  p_replace_token text,
  p_expires_at    timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_user public.users%ROWTYPE;
  v_channel text;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RAISE EXCEPTION 'create_session_admin_web: eksik parametre' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'inactive');
  END IF;
  IF lower(btrim(coalesce(v_user.role::text, ''))) <> 'admin' THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'no_role');
  END IF;
  v_channel := CASE WHEN p_client_channel IN ('desktop_web','mobile_web','tablet_web','unknown')
                    THEN p_client_channel ELSE 'unknown' END;  -- android_app bu yoldan AÇILAMAZ

  IF p_replace_token IS NOT NULL AND btrim(p_replace_token) <> '' AND p_replace_token <> p_session_token THEN
    UPDATE public.user_sessions
       SET is_active = false, ended_at = v_now, end_reason = 'replaced_same_device'
     WHERE session_token = p_replace_token AND user_id = p_user_id AND is_active = true;
  END IF;

  INSERT INTO public.user_sessions
    (user_id, ip_address, country, city, user_agent, platform, client_channel, session_token,
     is_active, created_at, last_seen_at, expires_at, session_role, session_state)
  VALUES
    (p_user_id, p_ip, p_country, p_city, p_user_agent, p_platform, v_channel, p_session_token,
     true, v_now, v_now, p_expires_at, 'admin', 'active')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('inserted', true, 'state', 'active', 'session_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.create_session_admin_web(uuid,text,text,text,text,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_admin_web(uuid,text,text,text,text,text,text,text,text,timestamptz) TO service_role;

-- ── 12) auth_finalize_login — TEK MFA'lı oturum oluşturma noktası ────────────
--   Sonuç: { ok:true, inserted:true, state:'active', session_id, ... } |
--          { ok:false, reason:'invalid'|'not_verified'|'expired'|'consumed'|'inactive'|'not_required' } |
--          { ok:true, inserted:false, reason:<limit nedeni> } (challenge TÜKETİLMEZ; tekrar denenebilir).
CREATE OR REPLACE FUNCTION public.auth_finalize_login(
  p_challenge_id           uuid,
  p_browser_secret_hash    text,
  p_session_token          text,
  p_ip                     text,
  p_country                text,
  p_city                   text,
  p_user_agent             text,
  p_platform               text,
  p_client_channel         text,
  p_replace_token          text,
  p_expires_at             timestamptz,
  p_high_risk              boolean,
  p_enforce                boolean,
  p_expert_idle_seconds    integer,
  p_admin_idle_seconds     integer,
  p_admin_absolute_seconds integer,
  p_expert_stale_seconds   integer,
  p_admin_web_cap          integer,
  p_pending_ttl_seconds    integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_ch   public.auth_mfa_challenges%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_role text;
  v_res  jsonb;
  v_sid  uuid;
BEGIN
  IF p_challenge_id IS NULL OR p_browser_secret_hash IS NULL OR p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- Paralel tamamlama: satır kilidi → ikinci çağrı ilk işlem bitince 'consumed' görür.
  SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND OR v_ch.browser_secret_hash <> p_browser_secret_hash OR v_ch.purpose <> 'login' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_ch.state = 'consumed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'consumed');
  END IF;
  IF v_ch.state IN ('pending', 'verified') AND v_ch.expires_at <= v_now THEN
    UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE id = v_ch.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_ch.state <> 'verified' THEN
    RETURN jsonb_build_object('ok', false, 'reason', CASE WHEN v_ch.state = 'pending' THEN 'not_verified' ELSE v_ch.state END);
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_ch.user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;
  v_role := lower(btrim(coalesce(v_user.role::text, '')));

  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  IF v_role = 'admin' AND coalesce(p_client_channel, '') <> 'android_app' THEN
    v_res := public.create_session_admin_web(v_ch.user_id, p_session_token, p_ip, p_country, p_city,
               p_user_agent, p_platform, p_client_channel, p_replace_token, p_expires_at);
  ELSE
    v_res := public.create_session_v2(v_ch.user_id, p_session_token, p_ip, p_country, p_city,
               p_user_agent, p_platform, p_client_channel, p_replace_token, p_expires_at, p_high_risk,
               p_enforce, p_expert_idle_seconds, p_admin_idle_seconds, p_admin_absolute_seconds,
               p_expert_stale_seconds, p_admin_web_cap, p_pending_ttl_seconds);
  END IF;

  IF coalesce((v_res->>'inserted')::boolean, false) IS NOT TRUE THEN
    PERFORM set_config('yasam.mfa_finalize', 'off', true);
    RETURN jsonb_build_object('ok', true) || v_res;  -- challenge tüketilmez (limit vb. → tekrar)
  END IF;

  v_sid := (v_res->>'session_id')::uuid;
  IF v_sid IS NULL OR coalesce(v_res->>'state', 'active') <> 'active' THEN
    -- MFA'lı girişte bekleyen onay oturumu oluşmaz (admin web pending yolu kullanılmaz); savunma.
    RAISE EXCEPTION 'auth_finalize_login: beklenmeyen oturum durumu' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.user_sessions
     SET mfa_method = v_ch.method, mfa_challenge_id = v_ch.id
   WHERE id = v_sid;
  UPDATE public.auth_mfa_challenges
     SET state = 'consumed', consumed_at = v_now, session_id = v_sid
   WHERE id = v_ch.id;
  PERFORM set_config('yasam.mfa_finalize', 'off', true);

  -- TRIAL7: deneme penceresi oturumla AYNI işlemde başlar (oturum commit'lenmeden deneme başlamaz;
  -- deneme başlatma hatası girişi ENGELLEMEZ — alt blok geri alınır, /api/trial/status yeniden dener).
  -- trial_activate_on_login koşullu ve idempotenttir (yalnız self_7d + not_started; tekrar süreyi sıfırlamaz).
  IF v_role = 'expert' AND to_regprocedure('public.trial_activate_on_login(uuid)') IS NOT NULL THEN
    BEGIN
      PERFORM public.trial_activate_on_login(v_ch.user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true) || v_res || jsonb_build_object('user_id', v_ch.user_id, 'mfa_method', v_ch.method);
END $$;

REVOKE ALL ON FUNCTION public.auth_finalize_login(uuid,text,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_finalize_login(uuid,text,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)
  TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 100 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
