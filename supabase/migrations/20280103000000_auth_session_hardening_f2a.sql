-- =============================================================================
-- 20280103000000_auth_session_hardening_f2a.sql
--
-- GİRİŞ GÜVENLİĞİ F2-A — mevcut oturum güvenliğinin güçlendirilmesi (F0/F1 bulguları).
--
-- KAPSAM (yalnız oturum yaşam döngüsü; yetki/üyelik/deneme modeli DEĞİŞMEZ):
--   D-01  Resmî Android (client_channel='android_app') YENİ oturumları süreli: expires_at artık
--         çağıranın verdiği değerdir (uygulama 30 gün yazar) ve touch_active_session expires_at'i
--         + uzman idle süresini android için de uygular. Admin web kuralları (24 sa / 2 sa)
--         android'e UYGULANMAZ.
--         MEVCUT süresiz (expires_at NULL) android oturumlarına DOKUNULMAZ → habersiz çıkış YOK.
--         (Owner 2026-10-03 "Android'de süre uygulanmaz" kararı Owner 2026-11-15 F2 talimatıyla
--         yeni oturumlar için değişti.)
--   D-06  touch_active_session: sahibi pasif (users.active <> true) olan oturum GEÇERSİZ (NULL).
--         Arşiv ⇒ pasif CHECK'i (20280101000600) nedeniyle arşivdeki hesaplar da kapsanır.
--         Oturum satırı DEĞİŞTİRİLMEZ (yalnız erişim reddi; iptal mevcut admin akışlarında).
--   D-02  Aşama 1 (geriye uyumlu): user_sessions.token_hash = sha256(session_token) hex; INSERT /
--         session_token UPDATE'inde trigger doldurur; mevcut satırlar bir kez doldurulur; UNIQUE
--         index. Okuma yolları DEĞİŞMEZ (hâlâ session_token) — aşama 2/3 ayrı onayla.
--   D-10  auth_is_owner_admin(uuid): Owner (ana yönetici) kararı YALNIZ DB işaretine dayanır
--         (role='admin' AND active AND is_super_admin IS TRUE). E-posta/admin_level yedeği YOK.
--         İleride cihaz onayı vb. Owner yetkili RPC'ler bunu kullanır.
--
-- GÜVENLİK: SECURITY DEFINER + search_path='' + yalnız service_role (yeni/yenilenen fonksiyonlar).
-- VERİ: DELETE yok. Tek UPDATE: token_hash IS NULL satırlarına özet yazımı (oturum durumu,
--   süre, kanal, rol DEĞİŞMEZ; user_sessions_policy_guard bu UPDATE'e izin verir).
-- İMZALAR: touch_active_session ve create_session_v2 imzaları AYNI (eski kod uyumlu).
--   Eski kod android için p_expires_at=NULL verir → davranış eskisiyle aynı kalır (geçiş güvenli).
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ROLLBACK (yalnız gerekirse; veri kaybı yok):
--   touch_active_session + create_session_v2 → 20271003200000 tanımlarına geri yükle;
--   DROP TRIGGER IF EXISTS user_sessions_token_hash_trg ON public.user_sessions;
--   DROP FUNCTION IF EXISTS public.user_sessions_token_hash_fill();
--   DROP FUNCTION IF EXISTS public.auth_is_owner_admin(uuid);
--   (token_hash kolonu/indeksi zararsızdır; bırakılabilir.)
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 0;
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

-- ── 1) token_hash (D-02 aşama 1) ─────────────────────────────────────────────
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS token_hash text;

COMMENT ON COLUMN public.user_sessions.token_hash IS
  'sha256(session_token) hex — F2-A aşama 1 (geriye uyumlu). Okuma yolları henüz session_token kullanır.';

CREATE OR REPLACE FUNCTION public.user_sessions_token_hash_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.session_token IS NULL THEN
    NEW.token_hash := NULL;
  ELSE
    NEW.token_hash := encode(pg_catalog.sha256(convert_to(NEW.session_token, 'UTF8')), 'hex');
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.user_sessions_token_hash_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_sessions_token_hash_trg ON public.user_sessions;
CREATE TRIGGER user_sessions_token_hash_trg
  BEFORE INSERT OR UPDATE OF session_token ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.user_sessions_token_hash_fill();

-- Mevcut satırlar: yalnız boş özet doldurulur (durum/süre/kanal/rol değişmez).
UPDATE public.user_sessions
   SET token_hash = encode(pg_catalog.sha256(convert_to(session_token, 'UTF8')), 'hex')
 WHERE token_hash IS NULL
   AND session_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_token_hash
  ON public.user_sessions (token_hash)
  WHERE token_hash IS NOT NULL;

-- ── 2) touch_active_session (AYNI imza) ──────────────────────────────────────
--   Değişiklik (20271003200000'e göre):
--     (a) sahibi pasif kullanıcı → NULL (D-06);
--     (b) android_app + expires_at DOLU (yeni model) → expires_at ve p_idle_seconds uygulanır;
--         expires_at NULL (eski süresiz) android oturumu eskisi gibi süresiz kalır (D-01).
--   Diğer kanallarda davranış birebir aynı.
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
  v_active   boolean;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, s.created_at,
         lower(btrim(coalesce(u.role::text, ''))), coalesce(s.client_channel, ''), u.active
    INTO v_id, v_user, v_last, v_expires, v_created, v_role, v_channel, v_active
    FROM public.user_sessions s
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE s.session_token = p_token
     AND s.is_active = true
     AND s.session_state = 'active'
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- D-06: pasif (veya bulunamayan) kullanıcının oturumu hiçbir koşulda geçerli değildir.
  IF v_active IS DISTINCT FROM true THEN
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
  ELSIF coalesce(p_enforce, false) AND v_channel = 'android_app' AND v_expires IS NOT NULL THEN
    -- D-01: yeni model android oturumu — mutlak (expires_at) + uzman idle; admin web kuralları YOK.
    IF v_expires <= v_now THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'expired_absolute'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;
    IF p_idle_seconds IS NOT NULL AND p_idle_seconds > 0 AND v_last IS NOT NULL
       AND v_last <= v_now - make_interval(secs => p_idle_seconds)
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

-- ── 3) create_session_v2 (AYNI imza) ─────────────────────────────────────────
--   Değişiklik (20271003200000'e göre):
--     (a) INSERT expires_at = p_expires_at (android dahil; eski kod NULL verir → eskisiyle aynı);
--     (b) süre temizliği yeni model android oturumlarını da (expires_at DOLU) kapsar: mutlak
--         expires_at + uzman idle; admin web 24 sa / 2 sa kuralları android'e uygulanmaz.
--         Böylece süresi dolmuş admin android oturumu tek android yuvasını kilitlemez.
--   Limit, pending, istisna ve stale kuralları birebir aynı.
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

  -- (b) Süresi geçmiş (ama henüz dokunulmamış) oturumları kapat — sayım doğru olsun.
  --     Web: mevcut kurallar. Android: yalnız yeni model (expires_at DOLU) — mutlak + uzman idle.
  IF coalesce(p_enforce, false) THEN
    UPDATE public.user_sessions s
       SET is_active = false, ended_at = v_now,
           end_reason = CASE
             WHEN (s.expires_at IS NOT NULL AND s.expires_at <= v_now)
               OR (coalesce(s.client_channel, '') <> 'android_app'
                   AND v_role = 'admin' AND coalesce(p_admin_absolute_seconds, 0) > 0
                   AND s.created_at <= v_now - make_interval(secs => p_admin_absolute_seconds))
             THEN 'expired_absolute' ELSE 'expired_idle' END
     WHERE s.user_id = p_user_id
       AND s.is_active = true
       AND (
             (coalesce(s.client_channel, '') <> 'android_app'
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
                  ))
          OR (s.client_channel = 'android_app'
              AND s.expires_at IS NOT NULL
              AND (
                    s.expires_at <= v_now
                 OR (coalesce(p_expert_idle_seconds, 0) > 0
                     AND s.last_seen_at IS NOT NULL
                     AND s.last_seen_at <= v_now - make_interval(secs => p_expert_idle_seconds))
                  ))
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
     p_expires_at,
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

-- ── 4) auth_is_owner_admin (D-10) ────────────────────────────────────────────
--   Owner = role 'admin' + active + is_super_admin IS TRUE (kalıcı DB işareti, 20260913000000).
--   E-posta / admin_level yedeği YOK (admin_level canlıda her yeni admin için 'owner' varsayılır).
--   plpgsql: is_super_admin kolonu olmayan şemada çağrı hata verir → fail-closed (false değil HATA).
CREATE OR REPLACE FUNCTION public.auth_is_owner_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = p_user_id
       AND lower(btrim(coalesce(u.role::text, ''))) = 'admin'
       AND u.active IS TRUE
       AND u.is_super_admin IS TRUE
  );
END $$;

REVOKE ALL ON FUNCTION public.auth_is_owner_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_owner_admin(uuid) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 0 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
