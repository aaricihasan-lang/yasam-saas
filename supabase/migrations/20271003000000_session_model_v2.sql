-- =============================================================================
-- 20271003000000_session_model_v2.sql
--
-- ADMIN / EXPERT OTURUM MODELİ v2 (owner kararları 2026-10-02/03 — KİLİTLİ).
--
-- AMAÇ (yalnız oturum yaşam döngüsü + eşzamanlılık; YETKİ modeli DEĞİŞMEZ):
--   * Admin web     : idle 2 sa / mutlak 24 sa (DEĞİŞMEZ). En fazla 2 ONAYLI eşzamanlı web oturumu.
--                     Aktif web varken yeni web girişi → pending_approval (10 dk); mevcut admin
--                     oturumu (web veya resmi Android) onaylar/reddeder. 3. web → RED.
--                     Yüksek riskli web girişi → aktif web olmasa da pending.
--   * Admin Android : resmi uygulama (client_channel='android_app') — EN FAZLA 1 aktif oturum
--                     (kilit + kısmi UNIQUE index). İkinci giriş REDDEDİLİR; mevcut ASLA kapatılmaz.
--                     Süre (idle/mutlak) uygulanmaz.
--   * Expert web    : idle 7 gün / mutlak 30 gün (DEĞİŞMEZ). 15 dk stale temizliği YALNIZ burada.
--   * Expert Android: süre yok; MOBİL limitine sayılır (tablette de).
--   * Limitler      : users.allowed_* TEK KAYNAK (-1 sınırsız / 0 yasak / N). security_exempt artık
--                     limitleri ATLAMAZ (yalnız konum/risk muafiyeti — uygulama katmanı).
--   * Kanal/rol     : client_channel + session_role YALNIZ INSERT'te yazılır, sonra DEĞİŞMEZ
--                     (web oturumu android_app'e yükseltilemez).
--
-- TEMPORARY TEST ACCOUNT EXCEPTION — REMOVE AFTER SALES LAUNCH:
--   public.session_limit_exceptions — veri-tabanlı, SÜRELİ (expires_at ≤ 2026-12-31 CHECK),
--   yalnız uzman; YALNIZ cihaz/oturum limiti sayımını + 15 dk stale temizliğini atlar. active /
--   approval / role / tenant / modül / revoke / parola-reset / süre kontrollerini ATLAMAZ.
--   Bu migration SATIR EKLEMEZ (satır ayrı owner onayıyla eklenir).
--
-- GÜVENLİK: tüm yeni fonksiyonlar SECURITY DEFINER + search_path='' + yalnız service_role.
-- VERİ: DELETE yok; mevcut satırlara UPDATE yok (yalnız yeni kolonların varsayılanı).
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / guard'lı constraint.
-- GERİYE UYUM: eski create_session_within_limits + kod yolu çalışmaya devam eder (trigger,
--   eski kodun NULL→web kanal UPDATE'ine izin verir; NULL→android_app'i reddeder).
-- ROLLBACK (yalnız gerekirse; veri kaybı yok — yeni kolon/tablo):
--   DROP TRIGGER IF EXISTS user_sessions_policy_guard_trg ON public.user_sessions;
--   DROP FUNCTION IF EXISTS public.user_sessions_policy_guard();
--   DROP FUNCTION IF EXISTS public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer);
--   DROP FUNCTION IF EXISTS public.admin_decide_pending_session(text,uuid,text,integer);
--   DROP FUNCTION IF EXISTS public.session_pending_status(text);
--   DROP FUNCTION IF EXISTS public.revoke_own_session(text,uuid);
--   DROP INDEX IF EXISTS public.ux_user_sessions_admin_android_active;
--   touch_active_session → 20270129000200 tanımına geri yükle (android oturumları normal süreye döner).
-- =============================================================================

BEGIN;

-- ── 1) Kolonlar ──────────────────────────────────────────────────────────────
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS session_role text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS session_state text NOT NULL DEFAULT 'active';
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS approved_by_session_id uuid;

COMMENT ON COLUMN public.user_sessions.session_role IS
  'Oturum oluşturulurken kullanıcının rolü (admin|expert). INSERT''te yazılır, değişmez. Yetki kanıtı DEĞİL (yetki her istekte users tablosundan).';
COMMENT ON COLUMN public.user_sessions.session_state IS
  'active | pending_approval. Pending oturum is_active=false tutulur → hiçbir guard/çerez yolu erişim vermez.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_session_role_chk'
                  AND conrelid = 'public.user_sessions'::regclass) THEN
    ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_session_role_chk
      CHECK (session_role IS NULL OR session_role IN ('admin', 'expert'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_session_state_chk'
                  AND conrelid = 'public.user_sessions'::regclass) THEN
    ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_session_state_chk
      CHECK (session_state IN ('active', 'pending_approval')
             AND (session_state <> 'pending_approval' OR is_active = false OR approved_at IS NOT NULL));
  END IF;
END $$;

-- Tek aktif ADMIN resmi Android oturumu — kilitten bağımsız fiziksel garanti.
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_admin_android_active
  ON public.user_sessions (user_id)
  WHERE is_active = true AND client_channel = 'android_app' AND session_role = 'admin';

-- Bekleyen onay taraması.
CREATE INDEX IF NOT EXISTS idx_user_sessions_pending
  ON public.user_sessions (user_id, pending_expires_at)
  WHERE session_state = 'pending_approval' AND ended_at IS NULL;

-- ── 2) TEMPORARY TEST ACCOUNT EXCEPTION — REMOVE AFTER SALES LAUNCH ──────────
CREATE TABLE IF NOT EXISTS public.session_limit_exceptions (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  reason     text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CONSTRAINT session_limit_exceptions_reason_chk CHECK (char_length(btrim(reason)) BETWEEN 3 AND 300),
  CONSTRAINT session_limit_exceptions_expiry_cap_chk
    CHECK (expires_at <= '2026-12-31T23:59:59+03:00'::timestamptz)
);
COMMENT ON TABLE public.session_limit_exceptions IS
  'TEMPORARY TEST ACCOUNT EXCEPTION — REMOVE AFTER SALES LAUNCH. Yalnız uzman; yalnız cihaz/oturum limiti '
  'sayımı + 15 dk stale temizliği atlanır. active/approval/role/tenant/modül/revoke/parola/süre ATLANMAZ. '
  'expires_at üst sınırı 2026-12-31 (CHECK).';
ALTER TABLE public.session_limit_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.session_limit_exceptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_limit_exceptions TO service_role;

-- ── 3) Değişmezlik trigger'ı ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_sessions_policy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_create   boolean := coalesce(current_setting('yasam.session_create', true), '') = 'on';
  v_decision boolean := coalesce(current_setting('yasam.session_decision', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Resmi Android oturumu yalnız create_session_v2 içinden doğar.
    IF NEW.client_channel = 'android_app' AND NOT v_create THEN
      RAISE EXCEPTION 'android_app oturumu yalnız create_session_v2 ile oluşturulabilir'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.session_state = 'pending_approval' AND NEW.is_active THEN
      RAISE EXCEPTION 'pending_approval oturumu aktif oluşturulamaz' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.client_channel IS DISTINCT FROM OLD.client_channel THEN
    -- Eski kod uyumu: NULL → web kanalı (bir kez) serbest; android_app'e geçiş / değişiklik YASAK.
    IF OLD.client_channel IS NOT NULL OR NEW.client_channel = 'android_app' THEN
      RAISE EXCEPTION 'user_sessions.client_channel değiştirilemez' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.session_role IS DISTINCT FROM OLD.session_role THEN
    RAISE EXCEPTION 'user_sessions.session_role değiştirilemez' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.client_channel = 'android_app' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'android_app oturumunun expires_at değeri değiştirilemez' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.session_state = 'active' AND NEW.session_state <> 'active' THEN
    RAISE EXCEPTION 'aktif oturum pending durumuna alınamaz' USING ERRCODE = 'check_violation';
  END IF;
  -- Yeniden canlandırma YASAK; tek istisna: pending → active (yalnız karar fonksiyonu).
  IF OLD.is_active = false AND NEW.is_active = true THEN
    IF NOT (OLD.session_state = 'pending_approval' AND OLD.ended_at IS NULL AND v_decision) THEN
      RAISE EXCEPTION 'kapalı oturum yeniden açılamaz' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.session_state = 'pending_approval' AND NEW.session_state = 'active' AND NOT v_decision THEN
    RAISE EXCEPTION 'pending oturum yalnız onay fonksiyonu ile aktifleşir' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_sessions_policy_guard_trg ON public.user_sessions;
CREATE TRIGGER user_sessions_policy_guard_trg
  BEFORE INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.user_sessions_policy_guard();

-- ── 4) touch_active_session (AYNI imza) ──────────────────────────────────────
--   Değişiklik: (a) yalnız session_state='active' satırlar geçerli; (b) client_channel='android_app'
--   için süre (mutlak/idle) bloğu ATLANIR. Diğer kanallarda davranış birebir aynı.
CREATE OR REPLACE FUNCTION public.touch_active_session(
  p_token                  text,
  p_touch_after_seconds    integer,
  p_idle_seconds           integer,
  p_enforce                boolean,
  p_admin_idle_seconds     integer DEFAULT NULL,
  p_admin_absolute_seconds integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_id       uuid;
  v_user     uuid;
  v_last     timestamptz;
  v_expires  timestamptz;
  v_created  timestamptz;
  v_role     text;
  v_channel  text;
  v_is_admin boolean;
  v_idle     integer;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, s.created_at,
         lower(btrim(coalesce(u.role::text, ''))), coalesce(s.client_channel, '')
    INTO v_id, v_user, v_last, v_expires, v_created, v_role, v_channel
    FROM public.user_sessions s
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE s.session_token = p_token
     AND s.is_active = true
     AND s.session_state = 'active'
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF coalesce(p_enforce, false) AND v_channel <> 'android_app' THEN
    v_is_admin := (v_role = 'admin');

    IF (v_expires IS NOT NULL AND v_expires <= v_now)
       OR (v_is_admin AND p_admin_absolute_seconds IS NOT NULL AND p_admin_absolute_seconds > 0
           AND v_created <= v_now - make_interval(secs => p_admin_absolute_seconds))
    THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'expired_absolute'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;

    v_idle := CASE WHEN v_is_admin AND p_admin_idle_seconds IS NOT NULL
                   THEN p_admin_idle_seconds ELSE p_idle_seconds END;
    IF v_idle IS NOT NULL AND v_idle > 0 AND v_last IS NOT NULL
       AND v_last <= v_now - make_interval(secs => v_idle)
    THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'expired_idle'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;
  END IF;

  IF v_last IS NULL
     OR v_last < v_now - make_interval(secs => greatest(coalesce(p_touch_after_seconds, 0), 0))
  THEN
    UPDATE public.user_sessions
       SET last_seen_at = v_now
     WHERE id = v_id
       AND is_active = true
       AND (last_seen_at IS NULL
            OR last_seen_at < v_now - make_interval(secs => greatest(coalesce(p_touch_after_seconds, 0), 0)));
  END IF;

  RETURN v_user;
END $$;

REVOKE ALL ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  TO service_role;

-- ── 5) create_session_v2 ─────────────────────────────────────────────────────
--   Tek atomik oturum oluşturma noktası (kullanıcı başına advisory lock). Sonuç jsonb:
--     { inserted:true, state:'active'|'pending_approval', session_id, pending_expires_at?,
--       exception_used, replaced, expired_closed, stale_closed }
--     { inserted:false, reason:'inactive'|'no_role'|'admin_mobile_active'|'admin_web_limit'|
--       'device_forbidden'|'device_limit'|'total_forbidden'|'total_limit' }
--   Kimlik doğrulama + active/approval gating ÇAĞIRANDA yapılır (bu fonksiyon yalnız savunma
--   olarak active + rolü yeniden kontrol eder).
CREATE OR REPLACE FUNCTION public.create_session_v2(
  p_user_id                uuid,
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
  v_now        timestamptz := now();
  v_user       public.users%ROWTYPE;
  v_role       text;
  v_channel    text;
  v_android    boolean;
  v_platform   text;
  v_exception  boolean := false;
  v_replaced   integer := 0;
  v_expired    integer := 0;
  v_stale      integer := 0;
  v_n          integer;
  v_n_pending  integer;
  v_total      integer;
  v_plat_n     integer;
  v_plat_limit integer;
  v_tot_limit  integer;
  v_state      text := 'active';
  v_pending_to timestamptz;
  v_id         uuid;
  v_cap        integer := greatest(coalesce(p_admin_web_cap, 2), 1);
  v_ttl        integer := greatest(coalesce(p_pending_ttl_seconds, 600), 60);
BEGIN
  IF p_user_id IS NULL OR p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RAISE EXCEPTION 'create_session_v2: eksik parametre' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'inactive');
  END IF;
  v_role := lower(btrim(coalesce(v_user.role::text, '')));
  IF v_role NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'no_role');
  END IF;

  v_channel := CASE WHEN p_client_channel IN ('desktop_web','mobile_web','tablet_web','android_app','unknown')
                    THEN p_client_channel ELSE 'unknown' END;
  v_android := (v_channel = 'android_app');
  -- Resmi Android uygulaması (tablet dahil) MOBİL sayılır.
  v_platform := CASE WHEN v_android THEN 'mobile'
                     WHEN p_platform IN ('desktop','mobile','tablet','unknown') THEN p_platform
                     ELSE 'unknown' END;

  -- TEMPORARY TEST ACCOUNT EXCEPTION — REMOVE AFTER SALES LAUNCH (yalnız uzman, süreli).
  IF v_role = 'expert' THEN
    SELECT EXISTS (SELECT 1 FROM public.session_limit_exceptions e
                    WHERE e.user_id = p_user_id AND e.expires_at > v_now)
      INTO v_exception;
  END IF;

  -- (a) Aynı cihaz/tarayıcıdan yeniden giriş: istemcinin elindeki ESKİ token (aynı kullanıcı) kapanır.
  IF p_replace_token IS NOT NULL AND btrim(p_replace_token) <> '' AND p_replace_token <> p_session_token THEN
    UPDATE public.user_sessions
       SET is_active = false, ended_at = v_now, end_reason = 'replaced_same_device'
     WHERE session_token = p_replace_token
       AND user_id = p_user_id
       AND ended_at IS NULL
       AND (is_active = true OR session_state = 'pending_approval');
    GET DIAGNOSTICS v_replaced = ROW_COUNT;
  END IF;

  -- (b) Süresi geçmiş (ama henüz dokunulmamış) web oturumlarını kapat — sayım doğru olsun.
  IF coalesce(p_enforce, false) THEN
    UPDATE public.user_sessions s
       SET is_active = false, ended_at = v_now,
           end_reason = CASE
             WHEN (s.expires_at IS NOT NULL AND s.expires_at <= v_now)
               OR (v_role = 'admin' AND coalesce(p_admin_absolute_seconds, 0) > 0
                   AND s.created_at <= v_now - make_interval(secs => p_admin_absolute_seconds))
             THEN 'expired_absolute' ELSE 'expired_idle' END
     WHERE s.user_id = p_user_id
       AND s.is_active = true
       AND coalesce(s.client_channel, '') <> 'android_app'
       AND (
             (s.expires_at IS NOT NULL AND s.expires_at <= v_now)
          OR (v_role = 'admin' AND coalesce(p_admin_absolute_seconds, 0) > 0
              AND s.created_at <= v_now - make_interval(secs => p_admin_absolute_seconds))
          OR (s.last_seen_at IS NOT NULL
              AND s.last_seen_at <= v_now - make_interval(secs => greatest(
                    CASE WHEN v_role = 'admin' THEN coalesce(p_admin_idle_seconds, 0)
                         ELSE coalesce(p_expert_idle_seconds, 0) END, 0))
              AND (CASE WHEN v_role = 'admin' THEN coalesce(p_admin_idle_seconds, 0)
                        ELSE coalesce(p_expert_idle_seconds, 0) END) > 0)
       );
    GET DIAGNOSTICS v_expired = ROW_COUNT;
  END IF;

  -- Süresi dolan bekleyen onaylar.
  UPDATE public.user_sessions
     SET ended_at = v_now, end_reason = 'pending_expired'
   WHERE user_id = p_user_id
     AND session_state = 'pending_approval'
     AND ended_at IS NULL
     AND is_active = false
     AND pending_expires_at IS NOT NULL
     AND pending_expires_at <= v_now;

  -- (c) 15 dk stale temizliği — YALNIZ uzman WEB oturumları (istisna hesapta atlanır).
  IF v_role = 'expert' AND NOT v_exception AND coalesce(p_expert_stale_seconds, 0) > 0 THEN
    UPDATE public.user_sessions
       SET is_active = false, ended_at = v_now, end_reason = 'stale'
     WHERE user_id = p_user_id
       AND is_active = true
       AND coalesce(client_channel, '') <> 'android_app'
       AND last_seen_at < v_now - make_interval(secs => p_expert_stale_seconds);
    GET DIAGNOSTICS v_stale = ROW_COUNT;
  END IF;

  IF v_role = 'admin' THEN
    IF v_android THEN
      SELECT count(*) INTO v_n FROM public.user_sessions
       WHERE user_id = p_user_id AND is_active = true AND client_channel = 'android_app';
      IF v_n >= 1 THEN
        RETURN jsonb_build_object('inserted', false, 'reason', 'admin_mobile_active');
      END IF;
    ELSE
      SELECT count(*) INTO v_n FROM public.user_sessions
       WHERE user_id = p_user_id AND is_active = true AND coalesce(client_channel, '') <> 'android_app';
      SELECT count(*) INTO v_n_pending FROM public.user_sessions
       WHERE user_id = p_user_id AND session_state = 'pending_approval' AND ended_at IS NULL
         AND is_active = false AND pending_expires_at > v_now;
      IF v_n + v_n_pending >= v_cap THEN
        RETURN jsonb_build_object('inserted', false, 'reason', 'admin_web_limit',
                                  'active_web', v_n, 'pending', v_n_pending);
      END IF;
      IF v_n >= 1 OR coalesce(p_high_risk, false) THEN
        v_state := 'pending_approval';
        v_pending_to := v_now + make_interval(secs => v_ttl);
      END IF;
    END IF;
  ELSIF NOT v_exception THEN
    -- Uzman: users.allowed_* tek kaynak (-1 sınırsız / 0 yasak / N). security_exempt ATLAMAZ.
    v_tot_limit := coalesce(v_user.allowed_active_sessions, -1);
    v_plat_limit := coalesce(CASE v_platform
                      WHEN 'desktop' THEN v_user.allowed_desktop_sessions
                      WHEN 'mobile'  THEN v_user.allowed_mobile_sessions
                      WHEN 'tablet'  THEN v_user.allowed_tablet_sessions
                      ELSE v_user.allowed_unknown_sessions END, -1);
    SELECT count(*) INTO v_total FROM public.user_sessions
     WHERE user_id = p_user_id AND is_active = true;
    SELECT count(*) INTO v_plat_n FROM public.user_sessions
     WHERE user_id = p_user_id AND is_active = true
       AND (CASE WHEN client_channel = 'android_app' THEN 'mobile'
                 ELSE coalesce(platform, 'desktop') END) = v_platform;
    IF v_plat_limit = 0 THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'device_forbidden', 'platform', v_platform);
    ELSIF v_plat_limit > 0 AND v_plat_n >= v_plat_limit THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'device_limit', 'platform', v_platform);
    END IF;
    IF v_tot_limit = 0 THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'total_forbidden', 'platform', v_platform);
    ELSIF v_tot_limit > 0 AND v_total >= v_tot_limit THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'total_limit', 'platform', v_platform);
    END IF;
  END IF;

  PERFORM set_config('yasam.session_create', 'on', true);
  INSERT INTO public.user_sessions
    (user_id, ip_address, country, city, user_agent, platform, client_channel, session_token,
     is_active, created_at, last_seen_at, expires_at, session_role, session_state, pending_expires_at)
  VALUES
    (p_user_id, p_ip, p_country, p_city, p_user_agent, v_platform, v_channel, p_session_token,
     v_state = 'active', v_now, v_now,
     CASE WHEN v_android THEN NULL ELSE p_expires_at END,
     v_role, v_state, v_pending_to)
  RETURNING id INTO v_id;
  PERFORM set_config('yasam.session_create', 'off', true);

  RETURN jsonb_build_object(
    'inserted', true,
    'state', v_state,
    'session_id', v_id,
    'pending_expires_at', v_pending_to,
    'platform', v_platform,
    'exception_used', v_exception,
    'replaced', v_replaced,
    'expired_closed', v_expired,
    'stale_closed', v_stale
  );
END $$;

REVOKE ALL ON FUNCTION public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)
  TO service_role;

-- ── 6) admin_decide_pending_session ──────────────────────────────────────────
--   Onaylayan: aynı admin kullanıcısının AKTİF (session_state='active') oturumu (web veya
--   resmi Android). Pending oturum aynı kullanıcıya ait, süresi dolmamış olmalı. Onayda 2-web
--   üst sınırı kilit altında yeniden kontrol edilir.
CREATE OR REPLACE FUNCTION public.admin_decide_pending_session(
  p_actor_token   text,
  p_pending_id    uuid,
  p_decision      text,
  p_admin_web_cap integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_actor_id uuid;
  v_user_id  uuid;
  v_pending  public.user_sessions%ROWTYPE;
  v_n        integer;
  v_cap      integer := greatest(coalesce(p_admin_web_cap, 2), 1);
BEGIN
  IF p_decision NOT IN ('approve', 'deny') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_decision');
  END IF;
  IF p_actor_token IS NULL OR btrim(p_actor_token) = '' OR p_pending_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  SELECT s.id, s.user_id INTO v_actor_id, v_user_id
    FROM public.user_sessions s
    JOIN public.users u ON u.id = s.user_id
   WHERE s.session_token = p_actor_token
     AND s.is_active = true
     AND s.session_state = 'active'
     AND lower(btrim(coalesce(u.role::text, ''))) = 'admin'
     AND u.active = true
   LIMIT 1;
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT * INTO v_pending FROM public.user_sessions
   WHERE id = p_pending_id AND user_id = v_user_id
     AND session_state = 'pending_approval' AND is_active = false AND ended_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_pending.pending_expires_at IS NULL OR v_pending.pending_expires_at <= v_now THEN
    UPDATE public.user_sessions SET ended_at = v_now, end_reason = 'pending_expired'
     WHERE id = v_pending.id;
    RETURN jsonb_build_object('ok', false, 'code', 'expired', 'user_id', v_user_id);
  END IF;

  IF p_decision = 'deny' THEN
    UPDATE public.user_sessions SET ended_at = v_now, end_reason = 'owner_denied'
     WHERE id = v_pending.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'deny', 'user_id', v_user_id,
                              'actor_session_id', v_actor_id);
  END IF;

  SELECT count(*) INTO v_n FROM public.user_sessions
   WHERE user_id = v_user_id AND is_active = true AND coalesce(client_channel, '') <> 'android_app';
  IF v_n >= v_cap THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cap', 'user_id', v_user_id);
  END IF;

  PERFORM set_config('yasam.session_decision', 'on', true);
  UPDATE public.user_sessions
     SET is_active = true, session_state = 'active', approved_at = v_now,
         approved_by_session_id = v_actor_id, last_seen_at = v_now, pending_expires_at = NULL
   WHERE id = v_pending.id;
  PERFORM set_config('yasam.session_decision', 'off', true);

  RETURN jsonb_build_object('ok', true, 'decision', 'approve', 'user_id', v_user_id,
                            'actor_session_id', v_actor_id);
END $$;

REVOKE ALL ON FUNCTION public.admin_decide_pending_session(text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_pending_session(text, uuid, text, integer) TO service_role;

-- ── 7) session_pending_status ────────────────────────────────────────────────
--   Yalnız token SAHİBİNE kendi bekleyen girişinin durumunu söyler: pending | approved |
--   denied | expired | invalid. Hiçbir veri/yetki vermez.
CREATE OR REPLACE FUNCTION public.session_pending_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_s   public.user_sessions%ROWTYPE;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  SELECT * INTO v_s FROM public.user_sessions WHERE session_token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  IF v_s.is_active AND v_s.session_state = 'active' THEN
    IF v_s.approved_at IS NOT NULL THEN
      RETURN jsonb_build_object('state', 'approved', 'user_id', v_s.user_id);
    END IF;
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  IF v_s.session_state = 'pending_approval' THEN
    IF v_s.ended_at IS NULL AND v_s.pending_expires_at > v_now THEN
      RETURN jsonb_build_object('state', 'pending', 'pending_expires_at', v_s.pending_expires_at);
    END IF;
    IF v_s.ended_at IS NULL THEN
      UPDATE public.user_sessions SET ended_at = v_now, end_reason = 'pending_expired' WHERE id = v_s.id;
      RETURN jsonb_build_object('state', 'expired');
    END IF;
    IF v_s.end_reason = 'owner_denied' THEN
      RETURN jsonb_build_object('state', 'denied');
    END IF;
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  RETURN jsonb_build_object('state', 'invalid');
END $$;

REVOKE ALL ON FUNCTION public.session_pending_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_pending_status(text) TO service_role;

-- ── 8) revoke_own_session ────────────────────────────────────────────────────
--   Kullanıcı (admin veya uzman) KENDİ oturumunu kapatır (kayıp telefon dahil). Aktör token'ı
--   aktif olmalı; hedef aynı kullanıcıya ait aktif veya bekleyen oturum olmalı.
CREATE OR REPLACE FUNCTION public.revoke_own_session(p_actor_token text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_actor_id uuid;
  v_user_id  uuid;
  v_n        integer;
BEGIN
  IF p_actor_token IS NULL OR btrim(p_actor_token) = '' OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT s.id, s.user_id INTO v_actor_id, v_user_id
    FROM public.user_sessions s
    JOIN public.users u ON u.id = s.user_id
   WHERE s.session_token = p_actor_token AND s.is_active = true AND s.session_state = 'active'
     AND u.active = true
   LIMIT 1;
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  UPDATE public.user_sessions
     SET is_active = false, ended_at = v_now, end_reason = 'owner_self_revoked'
   WHERE id = p_session_id AND user_id = v_user_id AND ended_at IS NULL
     AND (is_active = true OR session_state = 'pending_approval');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'was_current', p_session_id = v_actor_id);
END $$;

REVOKE ALL ON FUNCTION public.revoke_own_session(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_own_session(text, uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM public.user_sessions WHERE session_state <> 'active';            -- 0
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.user_sessions'::regclass AND NOT tgisinternal;
--   SELECT has_function_privilege('anon','public.create_session_v2(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,boolean,integer,integer,integer,integer,integer,integer)','EXECUTE'); -- false
--   SELECT count(*) FROM public.session_limit_exceptions;                                -- 0 (satır ayrı onayla)
-- =============================================================================
