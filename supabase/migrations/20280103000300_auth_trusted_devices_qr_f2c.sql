-- =============================================================================
-- 20280103000300_auth_trusted_devices_qr_f2c.sql
--
-- GİRİŞ GÜVENLİĞİ F2-C — güvenilir Android cihazı + QR giriş onayı (EKLEYİCİ).
-- BAĞIMLILIK: 20280103000000 (F2-A) → 20280103000100 (F2-B çekirdek). 000200 ile sırası serbest.
-- Protokol: docs/giris-guvenligi/f2c-qr-protokol.md (v1).
--
--   * auth_trusted_devices: cihazın Keystore açık anahtarı (SPKI). Durum: pending_owner →
--     owner_approved → active (cihazın KENDİ imzasıyla) · rejected · revoked · expired.
--     Owner onayı tek başına cihazı aktif ETMEZ ve oturum AÇMAZ.
--   * auth_device_owner_decide: yalnız is_super_admin Owner + MFA'lı Owner oturumu; Owner kendi
--     cihazını onaylayamaz; onay için parmak izi teyidi + doğrulama kanalı zorunlu; karar kaydı değişmez.
--   * auth_owner_bootstrap_issue: Owner'ın İLK cihazı için SQL konsolundan (service_role'e KAPALI)
--     15 dk / tek kullanımlık kod.
--   * QR: auth_mfa_begin artık challenge'a QR nonce (yalnız özet saklanır) + 2 haneli eşleştirme
--     kodu + 2 yanıltıcı kod üretir. auth_qr_decide: cihaz aktif + challenge ile AYNI kullanıcı +
--     nonce eşleşmesi + doğru eşleştirme kodu → auth_mfa_mark_verified. Yanlış kod / ret → kalıcı red.
--   * İMZA doğrulaması (ECDSA P-256) uygulama sunucusunda yapılır (lib/auth/deviceSignature.ts);
--     bu fonksiyonlar yalnız imzası doğrulanmış istekte çağrılır (service_role).
--   * auth_mfa_user_has_method: aktif güvenilir cihaz VARSA true (F2-B'deki "her zaman false" yerine).
--   * Owner Bildirim Zili: yeni 'cihaz_eslesme' (action) tipi + 'cihaz_onaylandi'/'cihaz_reddedildi'/
--     'cihaz_iptal' çözüm değerleri (tablo varsa; mevcut kayıtlar DEĞİŞMEZ).
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; tablolar RLS açık, policy yok, yalnız postgres.
-- VERİ: mevcut satır değişmez (yalnız admin_notifications CHECK'leri genişler). Kimse zorunlu yapılmaz.
-- ROLLBACK (yalnız güvenilir cihaz / MFA'lı kullanıcı YOKKEN): DROP FUNCTION auth_device_*, auth_qr_*,
--   auth_owner_bootstrap_issue; auth_mfa_begin + auth_mfa_user_has_method → 20280103000100 tanımı;
--   admin_notifications CHECK'leri eski listeye (önce cihaz_eslesme satırı olmadığını doğrula).
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 300;
  v_known   constant integer := 1300;
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
      (1200, to_regprocedure('public.auth_email_provider_allowed(text)') IS NOT NULL),
      (1300, to_regprocedure('public.auth_owner_kit_locked_count(uuid)') IS NOT NULL)
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

-- ── 1) Tablolar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_trusted_devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  public_key_spki       text NOT NULL CHECK (length(public_key_spki) BETWEEN 80 AND 400),
  -- Protokol v1.1: kullanıcı doğrulaması GEREKTİRMEYEN "varlık" anahtarı — yalnız QR isteğini OKUMA (fetch)
  -- imzası için. Onay (decide) her zaman yukarıdaki kullanıcı doğrulamalı anahtarla. NULL → v1 istemci.
  presence_key_spki     text CHECK (presence_key_spki IS NULL OR length(presence_key_spki) BETWEEN 80 AND 400),
  key_fingerprint       text NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  display_code          text NOT NULL CHECK (display_code ~ '^[A-Z2-7]{4}-[A-Z2-7]{4}$'),
  key_alg               text NOT NULL DEFAULT 'ES256' CHECK (key_alg = 'ES256'),
  attestation_level     text NOT NULL DEFAULT 'unverified' CHECK (attestation_level IN ('unverified', 'software', 'tee', 'strongbox')),
  device_model          text CHECK (device_model IS NULL OR length(device_model) <= 80),
  android_api           integer CHECK (android_api IS NULL OR android_api BETWEEN 21 AND 99),
  app_version           text CHECK (app_version IS NULL OR length(app_version) <= 32),
  enroll_ip_hash        text,
  via_bootstrap         boolean NOT NULL DEFAULT false,
  state                 text NOT NULL DEFAULT 'pending_owner'
                        CHECK (state IN ('pending_owner', 'owner_approved', 'active', 'rejected', 'revoked', 'expired')),
  activation_nonce      text,
  activation_expires_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  decided_at            timestamptz,
  decided_by            uuid,
  activated_at          timestamptz,
  last_used_at          timestamptz,
  revoked_at            timestamptz,
  revoked_by            uuid,
  revoke_reason         text CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 300),
  CONSTRAINT auth_trusted_devices_activation_chk
    CHECK (state <> 'owner_approved' OR (activation_nonce IS NOT NULL AND activation_expires_at IS NOT NULL)),
  CONSTRAINT auth_trusted_devices_active_chk CHECK (state <> 'active' OR activated_at IS NOT NULL)
);
-- Kullanıcı başına TEK bekleyen eşleştirme; aynı anahtar iki canlı kayıtta olamaz.
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_trusted_devices_one_pending
  ON public.auth_trusted_devices (user_id) WHERE state IN ('pending_owner', 'owner_approved');
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_trusted_devices_live_key
  ON public.auth_trusted_devices (key_fingerprint) WHERE state IN ('pending_owner', 'owner_approved', 'active');
CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_user_state ON public.auth_trusted_devices (user_id, state);
ALTER TABLE public.auth_trusted_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_trusted_devices FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_device_decisions (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id             uuid NOT NULL REFERENCES public.auth_trusted_devices(id) ON DELETE CASCADE,
  actor_id              uuid NOT NULL,
  decision              text NOT NULL CHECK (decision IN ('approve', 'reject', 'revoke', 'bootstrap')),
  verification_method   text CHECK (verification_method IS NULL OR verification_method IN ('telefon', 'yuz_yuze', 'sql_bootstrap', 'kullanici')),
  fingerprint_confirmed boolean NOT NULL DEFAULT false,
  note                  text CHECK (note IS NULL OR length(note) <= 500),
  created_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_device_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_device_decisions FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_device_decisions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'auth_device_decisions yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_device_decisions_append_only() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_device_decisions_append_only_trg ON public.auth_device_decisions;
CREATE TRIGGER auth_device_decisions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.auth_device_decisions
  FOR EACH ROW EXECUTE FUNCTION public.auth_device_decisions_append_only();

CREATE TABLE IF NOT EXISTS public.auth_owner_bootstrap_codes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  device_id  uuid,
  CONSTRAINT auth_owner_bootstrap_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
ALTER TABLE public.auth_owner_bootstrap_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_owner_bootstrap_codes FROM PUBLIC, anon, authenticated, service_role;

-- ── 2) Challenge'a QR alanları ───────────────────────────────────────────────
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS qr_nonce_hash text;
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS match_code text;
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS match_options text[];
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS approved_device_id uuid;
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS denied_reason text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_mfa_challenges_match_chk'
                 AND conrelid = 'public.auth_mfa_challenges'::regclass) THEN
    ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_match_chk
      CHECK ((match_code IS NULL OR match_code ~ '^[0-9]{2}$')
         AND (qr_nonce_hash IS NULL OR qr_nonce_hash ~ '^[0-9a-f]{64}$')
         AND (denied_reason IS NULL OR denied_reason IN ('user_denied', 'wrong_match', 'device_revoked')));
  END IF;
END $$;

-- ── 3) Owner Bildirim Zili: yeni tip + çözümler (tablo varsa) ────────────────
DO $$
BEGIN
  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_type_check;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_type_check
      CHECK (type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti','cihaz_eslesme']));
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_type;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_type
      CHECK ((kind = 'info' AND type = ANY (ARRAY['deneme_basladi','deneme_bitti']))
          OR (kind = 'action' AND type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','cihaz_eslesme'])));
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_resolution_check;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_resolution_check
      CHECK (resolution IS NULL OR resolution = ANY (ARRAY['deneme_onaylandi','pro_onaylandi','reddedildi','pro_gecirildi',
        'talep_kapatildi','inceleme_kaldirildi','deneme_durduruldu','pasife_alindi','odeme_durumu_guncellendi','kayit_silindi','kapandi',
        'cihaz_onaylandi','cihaz_reddedildi','cihaz_iptal']));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auth_device_notify(p_device_id uuid, p_user_id uuid, p_resolution text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.admin_notifications') IS NULL THEN
    RETURN;
  END IF;
  IF p_resolution IS NULL THEN
    EXECUTE 'INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at, payload)
             VALUES ($1, ''action'', ''cihaz_eslesme'', $2, now(), jsonb_build_object(''device_id'', $3))
             ON CONFLICT DO NOTHING'
      USING 'cihaz_eslesme:' || p_device_id::text, p_user_id, p_device_id;
  ELSE
    EXECUTE 'UPDATE public.admin_notifications SET resolved_at = now(), resolution = $1
              WHERE event_key = $2 AND resolved_at IS NULL'
      USING p_resolution, 'cihaz_eslesme:' || p_device_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Bildirim yazılamaması güvenlik kararını DEĞİŞTİRMEZ (onay/ret ayrıca auth_device_decisions'ta).
  RAISE WARNING 'auth_device_notify: [%] %', SQLSTATE, SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.auth_device_notify(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 4) Aktör çözümü (oturum token'ı) ─────────────────────────────────────────
--   MFA'lı (mfa_method dolu) aktif oturum mu ve sahibi kim? Owner kararları MFA'lı oturum ister.
CREATE OR REPLACE FUNCTION public.auth_session_actor(p_token text, p_require_mfa boolean)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.user_id FROM public.user_sessions s
    JOIN public.users u ON u.id = s.user_id AND u.active IS TRUE
   WHERE s.session_token = p_token
     AND s.is_active = true AND s.session_state = 'active'
     AND (s.expires_at IS NULL OR s.expires_at > now())
     AND (NOT p_require_mfa OR s.mfa_method IS NOT NULL)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_session_actor(text, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- ── 5) Yöntem varlığı: aktif güvenilir cihaz ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_user_has_method(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = p_user_id AND d.state = 'active');
$$;
REVOKE ALL ON FUNCTION public.auth_mfa_user_has_method(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_user_has_method(uuid) TO service_role;

-- ── 6) auth_mfa_begin (AYNI imza) + QR alanları ──────────────────────────────
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

  -- QR nonce: 192 bit, base64url; yalnız özeti saklanır. Eşleştirme: 3 farklı 2 haneli kod (1 doğru).
  v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  WHILE coalesce(array_length(v_codes, 1), 0) < 3 LOOP
    v_c := lpad(((get_byte(extensions.gen_random_bytes(1), 0) * 100) / 256)::text, 2, '0');
    IF NOT (v_c = ANY (v_codes)) THEN
      v_codes := v_codes || v_c;
    END IF;
  END LOOP;
  v_match := v_codes[1 + (get_byte(extensions.gen_random_bytes(1), 0) % 3)];

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

-- ── 7) Cihaz eşleştirme başlatma (parola + anahtara sahiplik ÇAĞIRANDA doğrulandı) ──
CREATE OR REPLACE FUNCTION public.auth_device_enroll_begin(
  p_user_id          uuid,
  p_public_key_spki  text,
  p_key_fingerprint  text,
  p_display_code     text,
  p_device_model     text,
  p_android_api      integer,
  p_app_version      text,
  p_ip_hash          text,
  p_bootstrap_hash   text,
  p_presence_key_spki text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now    timestamptz := now();
  v_user   public.users%ROWTYPE;
  v_active integer;
  v_boot   public.auth_owner_bootstrap_codes%ROWTYPE;
  v_id     uuid;
  v_state  text := 'pending_owner';
  v_nonce  text;
BEGIN
  IF p_user_id IS NULL OR p_public_key_spki IS NULL OR p_key_fingerprint IS NULL OR p_display_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('device:' || p_user_id::text, 0));

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  -- Süresi geçen aktivasyon pencereleri kapanır.
  UPDATE public.auth_trusted_devices SET state = 'expired', activation_nonce = NULL
   WHERE user_id = p_user_id AND state = 'owner_approved' AND activation_expires_at <= v_now;

  IF EXISTS (SELECT 1 FROM public.auth_trusted_devices WHERE user_id = p_user_id AND state IN ('pending_owner', 'owner_approved')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pending_exists');
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_trusted_devices WHERE key_fingerprint = p_key_fingerprint AND state IN ('pending_owner', 'owner_approved', 'active')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'key_in_use');
  END IF;
  SELECT count(*) INTO v_active FROM public.auth_trusted_devices WHERE user_id = p_user_id AND state = 'active';
  IF v_active >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_limit');
  END IF;

  IF p_bootstrap_hash IS NOT NULL THEN
    -- Owner İLK cihazı: SQL konsolundan üretilmiş, süreli, tek kullanımlık kod; yalnız Owner hesabına.
    IF NOT public.auth_is_owner_admin(p_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'bootstrap_invalid');
    END IF;
    SELECT * INTO v_boot FROM public.auth_owner_bootstrap_codes
     WHERE owner_id = p_user_id AND code_hash = p_bootstrap_hash AND used_at IS NULL AND expires_at > v_now
     ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'bootstrap_invalid');
    END IF;
    v_state := 'owner_approved';
    v_nonce := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  END IF;

  INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, presence_key_spki, key_fingerprint, display_code, device_model,
      android_api, app_version, enroll_ip_hash, via_bootstrap, state, activation_nonce, activation_expires_at,
      decided_at, decided_by, created_at)
  VALUES (p_user_id, p_public_key_spki, p_presence_key_spki, p_key_fingerprint, p_display_code, left(p_device_model, 80),
      p_android_api, left(p_app_version, 32), left(p_ip_hash, 128), p_bootstrap_hash IS NOT NULL, v_state,
      v_nonce, CASE WHEN v_nonce IS NULL THEN NULL ELSE v_now + interval '15 minutes' END,
      CASE WHEN v_nonce IS NULL THEN NULL ELSE v_now END, CASE WHEN v_nonce IS NULL THEN NULL ELSE p_user_id END, v_now)
  RETURNING id INTO v_id;

  IF p_bootstrap_hash IS NOT NULL THEN
    UPDATE public.auth_owner_bootstrap_codes SET used_at = v_now, device_id = v_id WHERE id = v_boot.id;
    INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed)
    VALUES (v_id, p_user_id, 'bootstrap', 'sql_bootstrap', false);
  ELSE
    PERFORM public.auth_device_notify(v_id, p_user_id, NULL);
  END IF;

  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user_id, 'device_enroll_requested', 'medium',
          CASE WHEN p_bootstrap_hash IS NULL THEN 'Güvenilir cihaz eşleştirme isteği' ELSE 'Owner ilk cihaz (bootstrap) eşleştirmesi' END,
          jsonb_build_object('device_id', v_id, 'display_code', p_display_code, 'model', left(p_device_model, 80)));

  RETURN jsonb_build_object('ok', true, 'device_id', v_id, 'state', v_state);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_enroll_begin(uuid,text,text,text,text,integer,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_enroll_begin(uuid,text,text,text,text,integer,text,text,text,text) TO service_role;

-- ── 8) Cihaz durumu (aktivasyon nonce'u yalnız owner_approved iken) ──────────
CREATE OR REPLACE FUNCTION public.auth_device_status(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.auth_trusted_devices%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  IF v.state = 'owner_approved' AND v.activation_expires_at <= now() THEN
    UPDATE public.auth_trusted_devices SET state = 'expired', activation_nonce = NULL WHERE id = v.id AND state = 'owner_approved';
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  IF v.state = 'owner_approved' THEN
    RETURN jsonb_build_object('state', v.state, 'activation_nonce', v.activation_nonce, 'activation_expires_at', v.activation_expires_at);
  END IF;
  RETURN jsonb_build_object('state', v.state);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_status(uuid) TO service_role;

-- İmza doğrulaması için açık anahtar (yalnız canlı kayıtlar; iptal/ret edilmiş → NULL).
CREATE OR REPLACE FUNCTION public.auth_device_public_key(p_device_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('public_key_spki', d.public_key_spki, 'presence_key_spki', d.presence_key_spki,
                            'state', d.state, 'user_id', d.user_id)
    FROM public.auth_trusted_devices d
   WHERE d.id = p_device_id AND d.state IN ('owner_approved', 'active');
$$;
REVOKE ALL ON FUNCTION public.auth_device_public_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_public_key(uuid) TO service_role;

-- ── 9) Aktivasyon (cihaz imzası ÇAĞIRANDA doğrulandı) ────────────────────────
CREATE OR REPLACE FUNCTION public.auth_device_activate(p_device_id uuid, p_nonce text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.auth_trusted_devices%ROWTYPE;
  v_active integer;
BEGIN
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v.state <> 'owner_approved' OR p_nonce IS NULL OR v.activation_nonce IS DISTINCT FROM p_nonce THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v.activation_expires_at <= now() THEN
    UPDATE public.auth_trusted_devices SET state = 'expired', activation_nonce = NULL WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  SELECT count(*) INTO v_active FROM public.auth_trusted_devices WHERE user_id = v.user_id AND state = 'active';
  IF v_active >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_limit');
  END IF;
  UPDATE public.auth_trusted_devices
     SET state = 'active', activated_at = now(), activation_nonce = NULL, activation_expires_at = NULL, last_used_at = now()
   WHERE id = v.id;
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, 'device_activated', 'medium', 'Güvenilir cihaz aktifleşti',
          jsonb_build_object('device_id', v.id, 'display_code', v.display_code, 'bootstrap', v.via_bootstrap));
  RETURN jsonb_build_object('ok', true, 'state', 'active');
END $$;
REVOKE ALL ON FUNCTION public.auth_device_activate(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_activate(uuid, text) TO service_role;

-- ── 10) Owner kararı (yalnız MFA'lı Owner oturumu; kendi cihazı YASAK) ───────
CREATE OR REPLACE FUNCTION public.auth_device_owner_decide(
  p_actor_token           text,
  p_device_id             uuid,
  p_decision              text,
  p_fingerprint_confirmed boolean,
  p_verification_method   text,
  p_note                  text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v public.auth_trusted_devices%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_decision');
  END IF;
  v_actor := public.auth_session_actor(p_actor_token, true);
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v.user_id = v_actor THEN
    RETURN jsonb_build_object('ok', false, 'code', 'self_approval_forbidden');
  END IF;
  IF v.state <> 'pending_owner' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_pending', 'state', v.state);
  END IF;
  IF p_decision = 'approve' AND (p_fingerprint_confirmed IS DISTINCT FROM true OR p_verification_method NOT IN ('telefon', 'yuz_yuze')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'verification_required');
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE public.auth_trusted_devices
       SET state = 'owner_approved', decided_at = now(), decided_by = v_actor,
           activation_nonce = translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_'),
           activation_expires_at = now() + interval '15 minutes'
     WHERE id = v.id;
  ELSE
    UPDATE public.auth_trusted_devices SET state = 'rejected', decided_at = now(), decided_by = v_actor WHERE id = v.id;
  END IF;
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed, note)
  VALUES (v.id, v_actor, p_decision, CASE WHEN p_verification_method IN ('telefon', 'yuz_yuze') THEN p_verification_method END,
          coalesce(p_fingerprint_confirmed, false), left(nullif(btrim(coalesce(p_note, '')), ''), 500));
  PERFORM public.auth_device_notify(v.id, v.user_id, CASE WHEN p_decision = 'approve' THEN 'cihaz_onaylandi' ELSE 'cihaz_reddedildi' END);
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, CASE WHEN p_decision = 'approve' THEN 'device_owner_approved' ELSE 'device_owner_rejected' END, 'high',
          CASE WHEN p_decision = 'approve' THEN 'Owner cihaz eşleştirmesini onayladı (aktivasyon cihaz imzasıyla)' ELSE 'Owner cihaz eşleştirmesini reddetti' END,
          jsonb_build_object('device_id', v.id, 'actor_id', v_actor, 'method', p_verification_method));
  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_decision = 'approve' THEN 'owner_approved' ELSE 'rejected' END);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_owner_decide(text, uuid, text, boolean, text, text) TO service_role;

-- ── 11) Bekleyen eşleştirmeler (Owner) / kullanıcının cihazları ─────────────
CREATE OR REPLACE FUNCTION public.auth_device_list(p_actor_token text, p_scope text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_owner boolean;
BEGIN
  v_actor := public.auth_session_actor(p_actor_token, false);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  v_owner := public.auth_is_owner_admin(v_actor);
  IF p_scope = 'pending' THEN
    IF NOT v_owner OR public.auth_session_actor(p_actor_token, true) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
    END IF;
    RETURN jsonb_build_object('ok', true, 'devices', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id, 'email', u.email,
               'name', coalesce(nullif(u.full_name, ''), u.name), 'display_code', d.display_code, 'model', d.device_model,
               'android_api', d.android_api, 'app_version', d.app_version, 'attestation', d.attestation_level,
               'created_at', d.created_at) ORDER BY d.created_at)
        FROM public.auth_trusted_devices d JOIN public.users u ON u.id = d.user_id
       WHERE d.state = 'pending_owner'), '[]'::jsonb));
  END IF;
  IF p_scope = 'user' THEN
    IF p_user_id IS NULL OR (p_user_id <> v_actor AND NOT v_owner) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
    END IF;
    RETURN jsonb_build_object('ok', true, 'devices', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_code', d.display_code, 'model', d.device_model,
               'state', d.state, 'created_at', d.created_at, 'activated_at', d.activated_at,
               'last_used_at', d.last_used_at, 'revoked_at', d.revoked_at) ORDER BY d.created_at DESC)
        FROM public.auth_trusted_devices d WHERE d.user_id = p_user_id), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('ok', false, 'code', 'bad_scope');
END $$;
REVOKE ALL ON FUNCTION public.auth_device_list(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_list(text, text, uuid) TO service_role;

-- ── 12) Cihaz iptali (Owner: herkesinki; kullanıcı: kendi) ──────────────────
--   İptal: cihaz bir daha hiçbir uçta kabul edilmez; bu cihazın onayladığı oturumlar kapanır;
--   bu cihazla doğrulanmış ama tüketilmemiş challenge'lar reddedilir.
CREATE OR REPLACE FUNCTION public.auth_device_revoke(p_actor_token text, p_device_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v public.auth_trusted_devices%ROWTYPE;
  v_sessions integer := 0;
BEGIN
  v_actor := public.auth_session_actor(p_actor_token, false);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR (v.user_id <> v_actor AND NOT public.auth_is_owner_admin(v_actor)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v.state IN ('revoked', 'rejected', 'expired') THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'state', v.state);
  END IF;
  UPDATE public.auth_trusted_devices
     SET state = 'revoked', revoked_at = now(), revoked_by = v_actor, activation_nonce = NULL,
         revoke_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
   WHERE id = v.id;
  UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'device_revoked'
   WHERE approved_device_id = v.id AND state = 'verified';
  UPDATE public.user_sessions s
     SET is_active = false, ended_at = now(), end_reason = 'device_revoked'
   WHERE s.is_active = true
     AND s.mfa_challenge_id IN (SELECT c.id FROM public.auth_mfa_challenges c WHERE c.approved_device_id = v.id);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, note)
  VALUES (v.id, v_actor, 'revoke', CASE WHEN v_actor = v.user_id THEN 'kullanici' END, left(nullif(btrim(coalesce(p_reason, '')), ''), 500));
  PERFORM public.auth_device_notify(v.id, v.user_id, 'cihaz_iptal');
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, 'device_revoked', 'high', 'Güvenilir cihaz iptal edildi',
          jsonb_build_object('device_id', v.id, 'actor_id', v_actor, 'sessions_closed', v_sessions));
  RETURN jsonb_build_object('ok', true, 'changed', true, 'sessions_closed', v_sessions);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_revoke(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_revoke(text, uuid, text) TO service_role;

-- ── 13) QR: isteği okuma / karar (cihaz imzası ÇAĞIRANDA doğrulandı) ─────────
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
                            'client_channel', v_ch.client_channel, 'created_at', v_ch.created_at, 'expires_at', v_ch.expires_at);
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
  SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
  SELECT * INTO v_dev FROM public.auth_trusted_devices WHERE id = p_device_id AND state = 'active' FOR SHARE;
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

-- ── 14) auth_finalize_login: cihaz finalize anında hâlâ aktif olmalı ─────────
--   (Doğrulandıktan sonra iptal edilen cihazın onayı oturuma dönüşmez — auth_device_revoke bu
--    challenge'ları 'denied' yapar; finalize 'verified' dışını reddeder. Ek savunma gerekmez.)

-- ── 15) Owner İLK cihaz kodu (yalnız SQL konsolu / postgres; service_role'e KAPALI) ─
CREATE OR REPLACE FUNCTION public.auth_owner_bootstrap_issue()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_n integer;
  v_code text;
BEGIN
  SELECT count(*) INTO v_n FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'auth_owner_bootstrap_issue: tam olarak 1 aktif Owner bekleniyor (%)', v_n;
  END IF;
  SELECT u.id INTO v_owner FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE;
  UPDATE public.auth_owner_bootstrap_codes SET expires_at = least(expires_at, now())
   WHERE owner_id = v_owner AND used_at IS NULL AND expires_at > now();
  -- 20 karakter base32 (100 bit).
  v_code := upper(translate(left(rtrim(encode(extensions.gen_random_bytes(15), 'base64'), '='), 20), '+/0O1Il', 'XYZWQRK'));
  INSERT INTO public.auth_owner_bootstrap_codes (owner_id, code_hash, created_at, expires_at)
  VALUES (v_owner, encode(sha256(convert_to('yasam-bootstrap:' || v_code, 'UTF8')), 'hex'), now(), now() + interval '15 minutes');
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_owner, 'owner_bootstrap_issued', 'high', 'Owner ilk cihaz kodu üretildi (SQL konsolu)', '{}'::jsonb);
  RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_bootstrap_issue() FROM PUBLIC, anon, authenticated, service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 300 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
