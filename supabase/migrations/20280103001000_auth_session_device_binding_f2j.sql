-- GİRİŞ GÜVENLİĞİ F2-J — Android yönetici oturumu CİHAZ KANITI + kanal tutarlılığı + eski süresiz oturum geçiş altyapısı.
-- F2-A…F2-I'ya bağımlı, EKLEYİCİ. Owner kararı (17.11.2026, B seçeneği): uzun yönetici oturumu YALNIZ güvenilir cihaz
-- anahtarının sunucuda doğrulanan kriptografik kanıtıyla verilir; HTTP başlıkları (User-Agent, X-Requested-With,
-- x-yasam-client) kanıt DEĞİLDİR.
--
--   J1  auth_finalize_login: oturum kanalı challenge'ın KAYITLI kanalıdır (giriş başlangıcında belirlenen); tamamlama
--       isteğindeki kanal farklıysa giriş reddedilir ('channel_mismatch'), challenge tüketilmez.
--   J2  touch_active_session: android_app kanalındaki YÖNETİCİ oturumu
--         · cihaza bağlı değilse → web yönetici sınırları (mutlak p_admin_absolute_seconds, boşta p_admin_idle_seconds);
--         · bağlıysa ve cihaz kanıtı ≤ 24 saat ise → Android sınırları (expires_at + uzman boşta süresi);
--         · bağlı ama kanıt 24 saatten eski → oturum SONLANDIRILMAZ, yalnız geçersiz döner (yeniden cihaz kanıtı ister);
--         · bağlı olduğu cihaz iptal edilmiş / başka kullanıcıya ait → oturum 'device_revoked' ile sonlanır.
--       Uzman oturumlarının davranışı DEĞİŞMEZ.
--   J3  auth_session_device_bind_begin / auth_session_device_bind: oturuma bağlı, tek kullanımlık, 120 sn geçerli nonce;
--       cihaz imzası (YS-SESSION-BIND-V1, cihazın ANA anahtarı — her kullanımda biyometri / cihaz kilidi) sunucu kodunda
--       doğrulanır, bu fonksiyon nonce↔oturum↔cihaz↔kullanıcı bağını ve cihazın etkin olduğunu doğrular.
--   J4  Eski süresiz Android oturumları (expires_at NULL): varsayılan politika 'kapali' → davranış BUGÜNKÜYLE AYNI
--       (yayın hiçbir oturumu kapatmaz). Owner, taze MFA'lı oturumla 'kademeli' politikayı ≥ 7 gün sonraki bir son
--       tarihle açabilir: o tarihe kadar oturum geçerli (boşta süresi politikanın açıldığı andan itibaren sayılır), son
--       tarihte 'legacy_deadline' ile sonlanır. Gerçek oturumlara bu migration HİÇBİR değer yazmaz.

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 1000;
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

-- ── J0) user_sessions: cihaz bağı kolonları (yalnız J3 fonksiyonu yazar) ──────────
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS bound_device_id uuid;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS device_bound_at timestamptz;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS device_proof_at timestamptz;

CREATE OR REPLACE FUNCTION public.user_sessions_device_bind_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('yasam.session_bind', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.bound_device_id IS NOT NULL OR NEW.device_bound_at IS NOT NULL OR NEW.device_proof_at IS NOT NULL THEN
        RAISE EXCEPTION 'user_sessions: cihaz bağı yalnız auth_session_device_bind ile kurulur' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.bound_device_id IS DISTINCT FROM OLD.bound_device_id
       OR NEW.device_bound_at IS DISTINCT FROM OLD.device_bound_at
       OR NEW.device_proof_at IS DISTINCT FROM OLD.device_proof_at THEN
      RAISE EXCEPTION 'user_sessions: cihaz bağı yalnız auth_session_device_bind ile değişir' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.user_sessions_device_bind_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_user_sessions_device_bind_guard ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_device_bind_guard
  BEFORE INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.user_sessions_device_bind_guard();

-- ── J3) Cihaz kanıtı nonce'ları ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_session_device_proofs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL,
  user_id     uuid NOT NULL,
  nonce_hash  text NOT NULL UNIQUE CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  state       text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'consumed', 'expired')),
  device_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_auth_session_device_proofs_session ON public.auth_session_device_proofs (session_id, created_at);
ALTER TABLE public.auth_session_device_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_session_device_proofs FROM PUBLIC, anon, authenticated, service_role;

-- ── J4) Eski süresiz Android oturumları — geçiş politikası (tek satır; varsayılan 'kapali') ─────
CREATE TABLE IF NOT EXISTS public.auth_legacy_session_policy (
  id        integer PRIMARY KEY CHECK (id = 1),
  mode      text NOT NULL DEFAULT 'kapali' CHECK (mode IN ('kapali', 'kademeli')),
  deadline  timestamptz,
  set_at    timestamptz,
  set_by    uuid,
  CHECK (mode = 'kapali' OR (deadline IS NOT NULL AND set_at IS NOT NULL AND deadline >= set_at + interval '7 days'))
);
INSERT INTO public.auth_legacy_session_policy (id, mode) VALUES (1, 'kapali') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.auth_legacy_session_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_legacy_session_policy FROM PUBLIC, anon, authenticated, service_role;

-- ── J2) touch_active_session (imza aynı; çağıranlar değişmez) ───────────────────
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
  v_proof_ok constant interval := interval '24 hours';  -- J2: cihaz kanıtı tazelik penceresi
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
  v_bound    uuid;
  v_proof    timestamptz;
  v_dev_ok   boolean;
  v_rule     text;      -- 'web' | 'android' | 'legacy'
  v_pol      public.auth_legacy_session_policy%ROWTYPE;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, s.created_at,
         lower(btrim(coalesce(u.role::text, ''))), coalesce(s.client_channel, ''), u.active,
         s.bound_device_id, s.device_proof_at
    INTO v_id, v_user, v_last, v_expires, v_created, v_role, v_channel, v_active, v_bound, v_proof
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

  v_is_admin := (v_role = 'admin');

  -- J2: cihaza bağlı oturumun cihazı hâlâ bu kullanıcının etkin güvenilir cihazı mı? (iptal → oturum biter)
  IF v_bound IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.auth_trusted_devices d
                    WHERE d.id = v_bound AND d.user_id = v_user AND d.state = 'active') INTO v_dev_ok;
    IF NOT v_dev_ok THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'device_revoked'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;
  END IF;

  IF NOT coalesce(p_enforce, false) THEN
    v_rule := 'none';
  ELSIF v_channel <> 'android_app' THEN
    v_rule := 'web';
  ELSIF v_expires IS NULL THEN
    v_rule := 'legacy';
  ELSIF v_is_admin AND v_bound IS NULL THEN
    v_rule := 'web';       -- J2: kanıtsız Android yönetici oturumu = web yönetici sınırları
  ELSE
    v_rule := 'android';
  END IF;

  IF v_rule = 'web' THEN
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
  ELSIF v_rule = 'android' THEN
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
    -- Yönetici: kanıt 24 saatten eskiyse oturum SONLANMAZ ama kullanılamaz; yalnız yeniden cihaz kanıtı kabul edilir.
    IF v_is_admin AND (v_proof IS NULL OR v_proof <= v_now - v_proof_ok) THEN
      RETURN NULL;
    END IF;
  ELSIF v_rule = 'legacy' THEN
    SELECT * INTO v_pol FROM public.auth_legacy_session_policy WHERE id = 1;
    IF FOUND AND v_pol.mode = 'kademeli' THEN
      IF v_now >= v_pol.deadline THEN
        UPDATE public.user_sessions
           SET is_active = false, ended_at = v_now, end_reason = 'legacy_deadline'
         WHERE id = v_id AND is_active = true;
        RETURN NULL;
      END IF;
      -- Boşta süresi politikanın açıldığı andan itibaren sayılır (önceden uzun süre kullanılmamış oturum anında kapanmaz).
      IF p_idle_seconds IS NOT NULL AND p_idle_seconds > 0
         AND greatest(coalesce(v_last, v_pol.set_at), v_pol.set_at) <= v_now - make_interval(secs => p_idle_seconds)
      THEN
        UPDATE public.user_sessions
           SET is_active = false, ended_at = v_now, end_reason = 'expired_idle'
         WHERE id = v_id AND is_active = true;
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  IF v_last IS NULL
     OR v_last < v_now - make_interval(secs => greatest(coalesce(p_touch_after_seconds, 0), 0))
  THEN
    UPDATE public.user_sessions
       SET last_seen_at = v_now
     WHERE id = v_id
       AND is_active = true;
  END IF;

  RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  TO service_role;

-- ── J3a) Kanıt başlatma: yalnız android_app YÖNETİCİ oturumu; ilk bağlama web sınırları içinde, yeniden kanıt
--        bağlı oturumun Android sınırları içinde. Oturum başına 10 dakikada en çok 5 nonce. ────────────────
CREATE OR REPLACE FUNCTION public.auth_session_device_bind_begin(
  p_token                  text,
  p_idle_seconds           integer,
  p_admin_idle_seconds     integer,
  p_admin_absolute_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_s     public.user_sessions%ROWTYPE;
  v_role  text;
  v_act   boolean;
  v_n     integer;
  v_nonce text;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_s FROM public.user_sessions WHERE session_token = p_token AND is_active = true AND session_state = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT lower(btrim(coalesce(u.role::text, ''))), u.active INTO v_role, v_act FROM public.users u WHERE u.id = v_s.user_id;
  IF v_act IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF coalesce(v_s.client_channel, '') <> 'android_app' OR v_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_required');
  END IF;
  IF v_s.bound_device_id IS NULL THEN
    -- İlk bağlama: oturum web yönetici sınırları içinde olmalı (kanıtsız oturum hiçbir zaman bu sınırı aşamaz).
    IF (v_s.expires_at IS NOT NULL AND v_s.expires_at <= v_now)
       OR (coalesce(p_admin_absolute_seconds, 0) > 0 AND v_s.created_at <= v_now - make_interval(secs => p_admin_absolute_seconds))
       OR (coalesce(p_admin_idle_seconds, 0) > 0 AND v_s.last_seen_at IS NOT NULL
           AND v_s.last_seen_at <= v_now - make_interval(secs => p_admin_idle_seconds))
       OR (v_s.expires_at IS NULL AND v_s.mfa_method IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;
  ELSE
    -- Yeniden kanıt: Android sınırları içinde ve cihaz hâlâ etkin.
    IF (v_s.expires_at IS NOT NULL AND v_s.expires_at <= v_now)
       OR (coalesce(p_idle_seconds, 0) > 0 AND v_s.last_seen_at IS NOT NULL
           AND v_s.last_seen_at <= v_now - make_interval(secs => p_idle_seconds))
       OR NOT EXISTS (SELECT 1 FROM public.auth_trusted_devices d
                       WHERE d.id = v_s.bound_device_id AND d.user_id = v_s.user_id AND d.state = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_session_device_proofs
   WHERE session_id = v_s.id AND created_at > v_now - interval '10 minutes';
  IF v_n >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retry_after', 600);
  END IF;
  UPDATE public.auth_session_device_proofs SET state = 'expired' WHERE session_id = v_s.id AND state = 'pending';
  v_nonce := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.auth_session_device_proofs (session_id, user_id, nonce_hash, expires_at)
  VALUES (v_s.id, v_s.user_id, encode(pg_catalog.sha256(convert_to(v_nonce, 'UTF8')), 'hex'), v_now + interval '120 seconds');
  RETURN jsonb_build_object('ok', true, 'session_id', v_s.id, 'nonce', v_nonce, 'expires_in', 120,
                            'bound_device_id', v_s.bound_device_id);
END $$;
REVOKE ALL ON FUNCTION public.auth_session_device_bind_begin(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_session_device_bind_begin(text, integer, integer, integer) TO service_role;

-- ── J3b) Kanıtı tamamla. ÇAĞIRAN SUNUCU KODU cihaz imzasını (YS-SESSION-BIND-V1, cihazın ana anahtarı) ÖNCE doğrular;
--        bu fonksiyon nonce (tek kullanım, 120 sn, oturuma bağlı), cihaz (etkin, oturum sahibine ait) ve oturum
--        uygunluğunu satır kilitleriyle doğrular. Bağlı oturum başka cihaza geçirilemez. ─────────────────────
CREATE OR REPLACE FUNCTION public.auth_session_device_bind(
  p_session_id             uuid,
  p_nonce                  text,
  p_device_id              uuid,
  p_idle_seconds           integer,
  p_admin_idle_seconds     integer,
  p_admin_absolute_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_p    public.auth_session_device_proofs%ROWTYPE;
  v_s    public.user_sessions%ROWTYPE;
  v_role text;
  v_act  boolean;
  v_first boolean;
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_p FROM public.auth_session_device_proofs
   WHERE nonce_hash = encode(pg_catalog.sha256(convert_to(p_nonce, 'UTF8')), 'hex') FOR UPDATE;
  IF NOT FOUND OR v_p.session_id <> p_session_id OR v_p.state <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_p.expires_at <= v_now THEN
    UPDATE public.auth_session_device_proofs SET state = 'expired' WHERE id = v_p.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  -- Nonce bu noktadan sonra her sonuçta tüketilir (tek deneme; yanlış cihaz denemesi tekrar edilemez).
  UPDATE public.auth_session_device_proofs SET state = 'consumed', consumed_at = v_now, device_id = p_device_id WHERE id = v_p.id;

  SELECT * INTO v_s FROM public.user_sessions WHERE id = v_p.session_id AND is_active = true AND session_state = 'active' FOR UPDATE;
  IF NOT FOUND OR v_s.user_id <> v_p.user_id OR coalesce(v_s.client_channel, '') <> 'android_app' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT lower(btrim(coalesce(u.role::text, ''))), u.active INTO v_role, v_act FROM public.users u WHERE u.id = v_s.user_id;
  IF v_act IS DISTINCT FROM true OR v_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_trusted_devices d
                  WHERE d.id = p_device_id AND d.user_id = v_s.user_id AND d.state = 'active') THEN
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (v_s.user_id, 'session_device_bind_rejected', 'high', 'Oturum cihaz kanıtı reddedildi: cihaz etkin değil veya başka kullanıcıya ait',
            jsonb_build_object('session_id', v_s.id, 'device_id', p_device_id));
    RETURN jsonb_build_object('ok', false, 'reason', 'device_invalid');
  END IF;
  IF v_s.bound_device_id IS NOT NULL AND v_s.bound_device_id <> p_device_id THEN
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (v_s.user_id, 'session_device_bind_rejected', 'high', 'Oturum başka cihaza bağlı; cihaz değişimi reddedildi',
            jsonb_build_object('session_id', v_s.id, 'device_id', p_device_id));
    RETURN jsonb_build_object('ok', false, 'reason', 'device_mismatch');
  END IF;
  v_first := v_s.bound_device_id IS NULL;
  -- Uygunluk (begin ile aynı kurallar; nonce ile tamamlama arasında süre dolmuş olabilir).
  IF v_first AND ((v_s.expires_at IS NOT NULL AND v_s.expires_at <= v_now)
       OR (coalesce(p_admin_absolute_seconds, 0) > 0 AND v_s.created_at <= v_now - make_interval(secs => p_admin_absolute_seconds))
       OR (coalesce(p_admin_idle_seconds, 0) > 0 AND v_s.last_seen_at IS NOT NULL
           AND v_s.last_seen_at <= v_now - make_interval(secs => p_admin_idle_seconds))
       OR (v_s.expires_at IS NULL AND v_s.mfa_method IS NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF NOT v_first AND ((v_s.expires_at IS NOT NULL AND v_s.expires_at <= v_now)
       OR (coalesce(p_idle_seconds, 0) > 0 AND v_s.last_seen_at IS NOT NULL
           AND v_s.last_seen_at <= v_now - make_interval(secs => p_idle_seconds))) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  PERFORM set_config('yasam.session_bind', 'on', true);
  UPDATE public.user_sessions
     SET bound_device_id = p_device_id, device_bound_at = coalesce(device_bound_at, v_now), device_proof_at = v_now,
         last_seen_at = v_now
   WHERE id = v_s.id;
  PERFORM set_config('yasam.session_bind', 'off', true);
  UPDATE public.auth_trusted_devices SET last_used_at = v_now WHERE id = p_device_id;
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_s.user_id, CASE WHEN v_first THEN 'session_device_bound' ELSE 'session_device_reproof' END, 'medium',
          CASE WHEN v_first THEN 'Yönetici oturumu güvenilir cihaza bağlandı' ELSE 'Yönetici oturumu cihaz kanıtı yenilendi' END,
          jsonb_build_object('session_id', v_s.id, 'device_id', p_device_id));
  RETURN jsonb_build_object('ok', true, 'first', v_first, 'proof_valid_until', v_now + interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION public.auth_session_device_bind(uuid, text, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_session_device_bind(uuid, text, uuid, integer, integer, integer) TO service_role;

-- ── J4b) Eski süresiz oturum politikası: yalnız Owner, taze MFA'lı oturumla; son tarih ≥ 7 gün sonra. ─────
CREATE OR REPLACE FUNCTION public.auth_legacy_session_policy_set(p_actor_token text, p_mode text, p_deadline timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_actor uuid := public.auth_session_fresh_mfa(p_actor_token, 30);
  v_n     integer;
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_fresh_mfa_required');
  END IF;
  IF p_mode NOT IN ('kapali', 'kademeli') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_mode = 'kademeli' AND (p_deadline IS NULL OR p_deadline < v_now + interval '7 days') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadline_too_soon');
  END IF;
  UPDATE public.auth_legacy_session_policy
     SET mode = p_mode, deadline = CASE WHEN p_mode = 'kademeli' THEN p_deadline END,
         set_at = CASE WHEN p_mode = 'kademeli' THEN v_now END, set_by = v_actor
   WHERE id = 1;
  SELECT count(*) INTO v_n FROM public.user_sessions
   WHERE is_active = true AND client_channel = 'android_app' AND expires_at IS NULL;
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_actor, 'legacy_session_policy_set', 'high', 'Eski süresiz Android oturum politikası değişti',
          jsonb_build_object('mode', p_mode, 'deadline', p_deadline, 'affected_sessions', v_n));
  RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'deadline', p_deadline, 'affected_sessions', v_n);
END $$;
REVOKE ALL ON FUNCTION public.auth_legacy_session_policy_set(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_legacy_session_policy_set(text, text, timestamptz) TO service_role;

-- Bildirim için: oturum eski süresiz model mi ve son tarih ne? (yalnız kendi oturumu; kişisel veri döndürmez)
CREATE OR REPLACE FUNCTION public.auth_session_legacy_info(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('legacy', true, 'mode', p.mode, 'deadline', p.deadline)
      FROM public.user_sessions s CROSS JOIN public.auth_legacy_session_policy p
     WHERE p.id = 1 AND p_token IS NOT NULL AND s.session_token = p_token AND s.is_active = true
       AND s.client_channel = 'android_app' AND s.expires_at IS NULL), jsonb_build_object('legacy', false));
$$;
REVOKE ALL ON FUNCTION public.auth_session_legacy_info(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_session_legacy_info(text) TO service_role;

-- ── J5) Savunma derinliği (D2): sunucu rolü (service_role) oturum satırlarında YALNIZ sonlandırma kolonlarını
--        güncelleyebilir (uygulama ve geri dönüş hedefi kod yalnız bunları yazar; token / created_at / expires_at /
--        mfa_* / kanal / cihaz bağı yalnız SECURITY DEFINER fonksiyonlarla değişir). Güvenlik olay kayıtları sunucu rolü
--        için yalnız EKLEME + OKUMA (imha / anonimleştirme yalnız F2-H fonksiyonlarıyla).
REVOKE UPDATE ON public.user_sessions FROM service_role;
GRANT UPDATE (is_active, ended_at, end_reason) ON public.user_sessions TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.security_events FROM service_role;

-- ── J7) E-posta kodu doğrulaması: 24 saatlik tavan + kullanıcı kilidi (L2) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_email_otp_verify(
  p_user_id uuid, p_purpose text, p_challenge_id uuid, p_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v public.auth_email_otps%ROWTYPE;
  v_ch public.auth_mfa_challenges%ROWTYPE;
  v_n  integer;
BEGIN
  IF p_user_id IS NULL OR p_purpose NOT IN ('login', 'verify_email') OR p_code_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- F2-J (L2): kod üretimiyle AYNI kullanıcı kilidi (aynı sıra: kilit → challenge → kod) — paralel doğrulamalar sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtextextended('email-otp:' || p_user_id::text, 0));
  IF p_purpose = 'login' THEN
    SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
    IF NOT FOUND OR v_ch.user_id <> p_user_id OR v_ch.state <> 'pending' OR v_ch.expires_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
  END IF;
  SELECT * INTO v FROM public.auth_email_otps
   WHERE user_id = p_user_id AND purpose = p_purpose AND challenge_id IS NOT DISTINCT FROM p_challenge_id
     AND state = 'active'
   ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;
  IF v.expires_at <= v_now THEN
    UPDATE public.auth_email_otps SET state = 'expired' WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  -- F2-J (L2): kayan 24 saatte toplam ≤10 yanlış deneme tavanı DOĞRULAMADA da (yalnız üretimde değil): birden çok açık
  -- kodla tavan aşılamaz. Tavan dolunca kod KARŞILAŞTIRILMAZ (doğru kod da kabul edilmez → tahmin kahini yok); kod
  -- kilitlenir, giriş isteği kapanır. QR / kurtarma yöntemleri etkilenmez.
  SELECT coalesce(sum(attempts), 0) INTO v_n FROM public.auth_email_otps
   WHERE user_id = p_user_id AND created_at > v_now - interval '24 hours';
  IF v_n >= 10 THEN
    UPDATE public.auth_email_otps SET state = 'locked' WHERE id = v.id;
    IF p_purpose = 'login' THEN
      UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'otp_locked' WHERE id = v_ch.id;
    END IF;
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (p_user_id, 'mfa_email_otp_daily_cap', 'high', 'E-posta kodu 24 saatlik yanlış deneme tavanına ulaştı',
            jsonb_build_object('purpose', p_purpose, 'challenge_id', p_challenge_id, 'attempts_24h', v_n));
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;
  IF v.code_hash <> p_code_hash THEN
    UPDATE public.auth_email_otps
       SET attempts = attempts + 1, state = CASE WHEN attempts + 1 >= 5 THEN 'locked' ELSE state END
     WHERE id = v.id;
    IF v.attempts + 1 >= 5 THEN
      IF p_purpose = 'login' THEN
        UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'otp_locked' WHERE id = v_ch.id;
      END IF;
      INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
      VALUES (p_user_id, 'mfa_email_otp_locked', 'high', 'E-posta doğrulama kodu 5 kez yanlış girildi',
              jsonb_build_object('purpose', p_purpose, 'challenge_id', p_challenge_id));
      RETURN jsonb_build_object('ok', false, 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', 4 - v.attempts);
  END IF;

  UPDATE public.auth_email_otps SET state = 'used', used_at = v_now WHERE id = v.id;
  -- Başarılı OTP = e-posta kutusuna sahiplik kanıtı.
  UPDATE public.users SET email_verified_at = coalesce(email_verified_at, v_now) WHERE id = p_user_id;
  IF p_purpose = 'login' THEN
    IF NOT public.auth_mfa_mark_verified(v_ch.id, 'email_otp') THEN
      RAISE EXCEPTION 'auth_email_otp_verify: challenge işaretlenemedi' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_otp_verify(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_otp_verify(uuid, text, uuid, text) TO service_role;


-- ── J1) auth_finalize_login: kanal = challenge'ın kayıtlı kanalı ────────────────
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
  v_now     timestamptz := now();
  v_ch      public.auth_mfa_challenges%ROWTYPE;
  v_user    public.users%ROWTYPE;
  v_role    text;
  v_res     jsonb;
  v_sid     uuid;
  v_channel text;
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
  -- J1: kanal giriş başlangıcında belirlenir; tamamlama isteği kanalı değiştiremez.
  v_channel := coalesce(v_ch.client_channel, 'unknown');
  IF p_client_channel IS DISTINCT FROM v_channel THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'channel_mismatch');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_ch.user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;
  v_role := lower(btrim(coalesce(v_user.role::text, '')));

  PERFORM set_config('yasam.mfa_finalize', 'on', true);
  IF v_role = 'admin' AND v_channel <> 'android_app' THEN
    v_res := public.create_session_admin_web(v_ch.user_id, p_session_token, p_ip, p_country, p_city,
               p_user_agent, p_platform, v_channel, p_replace_token, p_expires_at);
  ELSE
    v_res := public.create_session_v2(v_ch.user_id, p_session_token, p_ip, p_country, p_city,
               p_user_agent, p_platform, v_channel, p_replace_token, p_expires_at, p_high_risk,
               p_enforce, p_expert_idle_seconds, p_admin_idle_seconds, p_admin_absolute_seconds,
               p_expert_stale_seconds, p_admin_web_cap, p_pending_ttl_seconds);
  END IF;

  IF coalesce((v_res->>'inserted')::boolean, false) IS NOT TRUE THEN
    PERFORM set_config('yasam.mfa_finalize', 'off', true);
    RETURN jsonb_build_object('ok', true) || v_res;  -- challenge tüketilmez (limit vb. → tekrar)
  END IF;

  v_sid := (v_res->>'session_id')::uuid;
  IF v_sid IS NULL OR coalesce(v_res->>'state', 'active') <> 'active' THEN
    RAISE EXCEPTION 'auth_finalize_login: beklenmeyen oturum durumu' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.user_sessions
     SET mfa_method = v_ch.method, mfa_challenge_id = v_ch.id
   WHERE id = v_sid;
  UPDATE public.auth_mfa_challenges
     SET state = 'consumed', consumed_at = v_now, session_id = v_sid
   WHERE id = v_ch.id;
  PERFORM set_config('yasam.mfa_finalize', 'off', true);

  -- TRIAL7: deneme penceresi oturumla AYNI işlemde başlar (değişmedi).
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
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 1000 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
