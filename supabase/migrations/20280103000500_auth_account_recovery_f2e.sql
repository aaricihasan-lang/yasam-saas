-- =============================================================================
-- 20280103000500_auth_account_recovery_f2e.sql
--
-- GİRİŞ GÜVENLİĞİ F2-E — güvenli hesap kurtarma (EKLEYİCİ; F2-A/B/C/D sözleşmeleri korunur).
-- BAĞIMLILIK: 000000 (F2-A) → 000100 (F2-B çekirdek) → 000300 (F2-C) → 000400 (F2-D).
--   000200 (F2-B INSERT kilidi) ile sırası SERBEST: bu dosya user_sessions'a doğrudan INSERT yapmaz.
--
--   A) Kurtarma kodları (auth_recovery_codes): kullanıcı başına 10 kod, ≥128 bit (uygulama 28 karakter
--      base32 = 140 bit üretir). DB'de YALNIZ sha256('yasam-recovery-v1:' ‖ user_id ‖ ':' ‖ kod) özeti;
--      düz kod DB'ye / loga / yedeğe girmez. Kod YALNIZ parola sonrası açılan MFA challenge'ında,
--      auth_recovery_code_verify → auth_mfa_mark_verified('recovery_code') → mevcut auth_finalize_login
--      yoluyla oturuma dönüşür (ayrı oturum açma yolu YOK). Tek kullanım (satır kilidi), yenileyince eski
--      kodlar iptal, challenge başına 5 / kullanıcı başına kayan 24 saatte 10 yanlış deneme sınırı.
--   B/C) Cihaz: iptal F2-C'deki gibi. Telefon değişimi (auth_device_replacements): eski telefonla QR
--      onaylı TAZE oturumdan "değişim" işareti → yeni cihaz yine Owner onayı + cihaz imzasıyla aktifleşir;
--      aktifleştiği anda eski cihaz otomatik iptal edilir. Owner eşleştirme listesinde değişim görünür.
--   D) E-posta değişikliği (auth_email_change_requests): yalnız QR veya kurtarma koduyla açılmış oturum
--      + (uygulamada) parola + YENİ adrese gönderilen kod. Adres HERHANGİ bir yoldan değişirse (Owner
--      paneli dahil) email_verified_at sıfırlanır ve bekleyen e-posta kodları geçersizleşir (tetikleyici)
--      → e-posta yöntemi doğrulanmamış adrese ASLA gitmez.
--   E) Bütün yöntemleri kaybeden kullanıcı (auth_recovery_cases): yalnız MFA'lı Owner oturumu, kimlik
--      doğrulama yöntemi + açıklama zorunlu; 72 saat bekleme (CHECK ile DB'de); bekleme süresinde
--      kullanıcının kendisi iptal edebilir; kullanıcı açılıştan sonra MFA'lı giriş yaptıysa yürütme RED.
--      Yürütme TEK işlemde: cihazlar iptal, oturumlar kapalı, açık challenge'lar red, eski kurtarma kodları
--      iptal, e-posta doğrulaması sıfır, tek kullanımlık 24 saatlik kurtarma bileti (yine parola şart).
--      users.mfa_required ASLA değiştirilmez.
--   F) Owner çevrimdışı kurtarma kiti (kind 'owner_offline'): YALNIZ SQL konsolundan
--      (auth_owner_offline_kit_issue; service_role'e KAPALI), 5 kod / 140 bit. Owner girişinde kurtarma
--      kodu gibi kullanılır; kullanıldığında Owner'ın diğer bütün oturumları kapanır. Bu taze (≤30 dk)
--      oturumdan, oturum başına bir kez, yeni Owner telefonu için 15 dk'lık eşleştirme kodu üretilebilir
--      (auth_owner_offline_bootstrap) — SQL konsoluna erişim gerekmeden.
--   Denetim: auth_recovery_events YALNIZ EKLENEBİLİR (UPDATE/DELETE tetikleyiciyle red; kullanıcıya FK yok
--   → hesap silme zinciri kırılmaz). Önemli olaylar ayrıca security_events'e yazılır.
--   Owner Bildirim Zili: 'hesap_kurtarma' (action) + 'kurtarma_tamamlandi'/'kurtarma_iptal'/'kurtarma_reddedildi'.
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; tablolar RLS açık, policy yok, yalnız postgres.
-- VERİ: mevcut satır DEĞİŞMEZ (yalnız CHECK listeleri genişler). Kimsenin zorunluluğu açılmaz/kapanmaz.
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
-- ROLLBACK (yalnız kurtarma kodu / dava / değişim kaydı YOKKEN): DROP FUNCTION auth_recovery_*,
--   auth_email_change_*, auth_device_replace_*, auth_owner_offline_*; users_email_change_* tetikleyicileri;
--   auth_device_activate / auth_device_list / auth_mfa_user_methods / auth_mfa_mark_verified → 000300/000400
--   tanımları; CHECK listeleri eski hâline (önce 'recovery_code' satırı olmadığını doğrula).
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 500;
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

-- ── 1) Yöntem / red nedeni listeleri ─────────────────────────────────────────
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_mfa_method_chk;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_mfa_method_chk
  CHECK (mfa_method IS NULL OR mfa_method IN ('qr_device', 'email_otp', 'recovery_code'));

-- 000100'deki satır içi CHECK (otomatik ad) yerine adlı kısıt.
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_method_check;
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_method_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_method_chk
  CHECK (method IS NULL OR method IN ('qr_device', 'email_otp', 'recovery_code'));
ALTER TABLE public.auth_mfa_challenges ADD COLUMN IF NOT EXISTS recovery_code_id bigint;

ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_match_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_match_chk
  CHECK ((match_code IS NULL OR match_code ~ '^[0-9]{2}$')
     AND (qr_nonce_hash IS NULL OR qr_nonce_hash ~ '^[0-9a-f]{64}$')
     AND (denied_reason IS NULL OR denied_reason IN ('user_denied', 'wrong_match', 'device_revoked', 'otp_locked',
                                                      'recovery_locked', 'account_recovery')));

-- E-posta: adres değişikliği kodu + güvenlik bildirimi kaydı.
ALTER TABLE public.auth_email_otps DROP CONSTRAINT IF EXISTS auth_email_otps_purpose_check;
ALTER TABLE public.auth_email_otps DROP CONSTRAINT IF EXISTS auth_email_otps_purpose_list_chk;
ALTER TABLE public.auth_email_otps ADD CONSTRAINT auth_email_otps_purpose_list_chk
  CHECK (purpose IN ('login', 'verify_email', 'change_email'));
ALTER TABLE public.auth_email_deliveries DROP CONSTRAINT IF EXISTS auth_email_deliveries_purpose_check;
ALTER TABLE public.auth_email_deliveries DROP CONSTRAINT IF EXISTS auth_email_deliveries_purpose_list_chk;
ALTER TABLE public.auth_email_deliveries ADD CONSTRAINT auth_email_deliveries_purpose_list_chk
  CHECK (purpose IN ('login', 'verify_email', 'owner_test', 'change_email', 'security_notice'));

-- ── 2) auth_mfa_mark_verified: + 'recovery_code' (service_role'e YİNE KAPALI) ─
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
  IF p_method IS NULL OR p_method NOT IN ('qr_device', 'email_otp', 'recovery_code') THEN
    RETURN false;
  END IF;
  UPDATE public.auth_mfa_challenges
     SET state = 'verified', method = p_method, verified_at = now()
   WHERE id = p_challenge_id AND state = 'pending' AND expires_at > now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.auth_mfa_mark_verified(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3) Tablolar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_recovery_codes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('user', 'owner_offline', 'case_ticket')),
  batch_id          uuid NOT NULL,
  code_hash         text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'used', 'revoked')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  used_at           timestamptz,
  used_challenge_id uuid,
  revoked_at        timestamptz,
  revoke_reason     text CHECK (revoke_reason IS NULL OR revoke_reason ~ '^[a-z_]{2,40}$'),
  CONSTRAINT auth_recovery_codes_used_chk CHECK (state <> 'used' OR (used_at IS NOT NULL AND used_challenge_id IS NOT NULL)),
  CONSTRAINT auth_recovery_codes_ticket_chk CHECK ((kind = 'case_ticket') = (expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_recovery_codes_hash ON public.auth_recovery_codes (code_hash);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_codes_user ON public.auth_recovery_codes (user_id, kind, state);
ALTER TABLE public.auth_recovery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_recovery_codes FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_recovery_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge_id uuid,
  ok           boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_attempts_user ON public.auth_recovery_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_attempts_challenge ON public.auth_recovery_attempts (challenge_id);
ALTER TABLE public.auth_recovery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_recovery_attempts FROM PUBLIC, anon, authenticated, service_role;

-- Denetim kaydı: yalnız eklenebilir. user_id'ye FK YOK (hesap silindiğinde cascade DELETE bu tabloya
-- ulaşıp silmeyi kırmasın); detayda adres / kod / özet YOK.
CREATE TABLE IF NOT EXISTS public.auth_recovery_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL,
  actor_id   uuid,
  event      text NOT NULL CHECK (event IN (
               'codes_generated', 'code_used', 'code_wrong', 'code_locked', 'owner_offline_used',
               'owner_offline_kit_issued', 'owner_offline_bootstrap', 'case_opened', 'case_cancelled',
               'case_rejected', 'case_executed', 'case_expired', 'email_change_requested', 'email_changed',
               'device_replace_requested', 'device_replaced', 'device_replace_cancelled')),
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_events_user ON public.auth_recovery_events (user_id, created_at DESC);
ALTER TABLE public.auth_recovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_recovery_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'auth_recovery_events yalnız eklenebilir' USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_events_append_only() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_recovery_events_append_only_trg ON public.auth_recovery_events;
CREATE TRIGGER auth_recovery_events_append_only_trg
  BEFORE UPDATE OR DELETE ON public.auth_recovery_events
  FOR EACH ROW EXECUTE FUNCTION public.auth_recovery_events_append_only();

CREATE TABLE IF NOT EXISTS public.auth_recovery_cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  opened_by           uuid NOT NULL,
  verification_method text NOT NULL CHECK (verification_method IN ('telefon', 'yuz_yuze', 'kimlik_belgesi')),
  verification_note   text NOT NULL CHECK (length(btrim(verification_note)) BETWEEN 10 AND 500),
  state               text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'executed', 'cancelled', 'rejected', 'expired')),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  not_before          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  closed_at           timestamptz,
  closed_by           uuid,
  close_reason        text CHECK (close_reason IS NULL OR length(close_reason) <= 300),
  -- 72 saat bekleme VERİTABANINDA zorunlu: hiçbir fonksiyon / panel kısaltamaz.
  CONSTRAINT auth_recovery_cases_wait_chk CHECK (not_before >= opened_at + interval '72 hours'),
  CONSTRAINT auth_recovery_cases_window_chk CHECK (expires_at > not_before AND expires_at <= not_before + interval '7 days'),
  CONSTRAINT auth_recovery_cases_closed_chk CHECK ((state = 'waiting') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_recovery_cases_open ON public.auth_recovery_cases (user_id) WHERE state = 'waiting';
ALTER TABLE public.auth_recovery_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_recovery_cases FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_email_change_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  new_email  text NOT NULL CHECK (length(new_email) BETWEEN 6 AND 254),
  otp_id     bigint REFERENCES public.auth_email_otps(id) ON DELETE SET NULL,
  state      text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'superseded', 'expired', 'locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  done_at    timestamptz,
  CONSTRAINT auth_email_change_requests_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS idx_auth_email_change_requests_user ON public.auth_email_change_requests (user_id, created_at DESC);
ALTER TABLE public.auth_email_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_email_change_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_device_replacements (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_device_id uuid NOT NULL REFERENCES public.auth_trusted_devices(id) ON DELETE CASCADE,
  new_device_id uuid,
  state         text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'done', 'cancelled', 'expired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  closed_at     timestamptz,
  CONSTRAINT auth_device_replacements_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_device_replacements_open ON public.auth_device_replacements (user_id) WHERE state = 'waiting';
ALTER TABLE public.auth_device_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_device_replacements FROM PUBLIC, anon, authenticated, service_role;

-- ── 4) Owner Bildirim Zili: 'hesap_kurtarma' (tablo varsa; 000300/000400 listeleri + yeni değerler) ──
DO $$
BEGIN
  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_type_check;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_type_check
      CHECK (type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti',
                               'cihaz_eslesme','eposta_uyari','hesap_kurtarma']));
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_type;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_type
      CHECK ((kind = 'info' AND type = ANY (ARRAY['deneme_basladi','deneme_bitti']))
          OR (kind = 'action' AND type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','cihaz_eslesme',
                                                     'eposta_uyari','hesap_kurtarma'])));
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_resolution_check;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_resolution_check
      CHECK (resolution IS NULL OR resolution = ANY (ARRAY['deneme_onaylandi','pro_onaylandi','reddedildi','pro_gecirildi',
        'talep_kapatildi','inceleme_kaldirildi','deneme_durduruldu','pasife_alindi','odeme_durumu_guncellendi','kayit_silindi','kapandi',
        'cihaz_onaylandi','cihaz_reddedildi','cihaz_iptal','kurtarma_tamamlandi','kurtarma_iptal','kurtarma_reddedildi']));
  END IF;
END $$;

-- Bildirim geçmişi tür filtresi: + 'hesap_kurtarma'. Gövde 000400 ile AYNI; yalnız izinli tür listesi genişledi.
DO $do$
BEGIN
  IF to_regprocedure('public.admin_notification_history(uuid, text, text, text, timestamptz, timestamptz, integer, integer)') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.admin_notification_history(
  p_actor uuid, p_q text, p_type text, p_status text, p_from timestamptz, p_to timestamptz,
  p_limit integer, p_offset integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q      text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_type   text := coalesce(nullif(p_type, ''), 'all');
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  PERFORM public.admin_notif_assert_owner(p_actor);
  IF v_type NOT IN ('all','basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti',
                    'cihaz_eslesme','eposta_uyari','hesap_kurtarma')
     OR v_status NOT IN ('all','open','resolved','unread','read') THEN
    RAISE EXCEPTION 'admin_notification_history: gecersiz filtre' USING ERRCODE = 'AN400';
  END IF;
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_');
  END IF;
  WITH base AS (
    SELECT n.*, coalesce(nullif(btrim(u.full_name), ''), u.email) AS full_name, u.email,
           EXISTS (SELECT 1 FROM public.admin_notification_reads r WHERE r.notification_id = n.id AND r.admin_id = p_actor) AS is_read
      FROM public.admin_notifications n LEFT JOIN public.users u ON u.id = n.target_user_id
     WHERE (v_type = 'all' OR n.type = v_type)
       AND (p_from IS NULL OR n.occurred_at >= p_from)
       AND (p_to IS NULL OR n.occurred_at < p_to)
       AND (v_q IS NULL OR lower(coalesce(u.full_name, '')) LIKE '%' || v_q || '%' ESCAPE '\'
                        OR lower(coalesce(u.email, '')) LIKE '%' || v_q || '%' ESCAPE '\')
  ), filtered AS (
    SELECT * FROM base
     WHERE CASE v_status
             WHEN 'open'     THEN kind = 'action' AND resolved_at IS NULL
             WHEN 'resolved' THEN kind = 'action' AND resolved_at IS NOT NULL
             WHEN 'unread'   THEN kind = 'info' AND NOT is_read
             WHEN 'read'     THEN kind = 'info' AND is_read
             ELSE true END
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'kind', f.kind, 'type', f.type, 'target_user_id', f.target_user_id,
               'full_name', f.full_name, 'email', f.email, 'occurred_at', f.occurred_at,
               'resolved_at', f.resolved_at, 'resolution', f.resolution, 'read', f.is_read)
               ORDER BY f.occurred_at DESC, f.id DESC)
               FROM (SELECT * FROM filtered ORDER BY occurred_at DESC, id DESC LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered))
  INTO v_out;
  RETURN v_out;
END;
$$;
  $fn$;
END $do$;

CREATE OR REPLACE FUNCTION public.auth_recovery_notify(p_case_id uuid, p_user_id uuid, p_resolution text)
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
             VALUES ($1, ''action'', ''hesap_kurtarma'', $2, now(), jsonb_build_object(''case_id'', $3))
             ON CONFLICT DO NOTHING'
      USING 'hesap_kurtarma:' || p_case_id::text, p_user_id, p_case_id;
  ELSE
    EXECUTE 'UPDATE public.admin_notifications SET resolved_at = now(), resolution = $1
              WHERE event_key = $2 AND resolved_at IS NULL'
      USING p_resolution, 'hesap_kurtarma:' || p_case_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Bildirim yazılamaması kurtarma kararını DEĞİŞTİRMEZ (karar auth_recovery_events'te).
  RAISE WARNING 'auth_recovery_notify: [%] %', SQLSTATE, SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_notify(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 5) İç yardımcılar (service_role'e KAPALI) ────────────────────────────────
-- Kod özeti — uygulama (lib/auth/recoveryCodes.ts) ile birebir aynı biçim. Kod ≥128 bit olduğundan
-- tuzsuz/biberiz sha256 kaba kuvvete karşı yeterlidir; kullanıcı kimliği kapsamı kodu hesaba bağlar.
CREATE OR REPLACE FUNCTION public.auth_recovery_hash(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to('yasam-recovery-v1:' || p_user_id::text || ':' || p_code, 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION public.auth_recovery_hash(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- 28 karakter RFC 4648 base32 (A–Z, 2–7) = 140 bit; byte & 31 → 256/32 eşit dağılım (sapma yok).
CREATE OR REPLACE FUNCTION public.auth_recovery_random_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_alpha constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_bytes bytea := extensions.gen_random_bytes(28);
  v_out   text := '';
BEGIN
  FOR i IN 0..27 LOOP
    v_out := v_out || substr(v_alpha, (get_byte(v_bytes, i) & 31) + 1, 1);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_random_code() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_log(p_user_id uuid, p_actor_id uuid, p_event text, p_detail jsonb)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.auth_recovery_events (user_id, actor_id, event, detail)
  VALUES (p_user_id, p_actor_id, p_event, coalesce(p_detail, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.auth_recovery_log(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Oturum token'ının MFA kanıtı (yöntem + challenge + oluşturulma). Yalnız aktif, süresi geçmemiş oturum.
CREATE OR REPLACE FUNCTION public.auth_session_mfa(p_token text)
RETURNS TABLE (session_id uuid, user_id uuid, mfa_method text, challenge_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.user_id, s.mfa_method, s.mfa_challenge_id, s.created_at
    FROM public.user_sessions s
    JOIN public.users u ON u.id = s.user_id AND u.active IS TRUE
   WHERE p_token IS NOT NULL AND btrim(p_token) <> ''
     AND s.session_token = p_token
     AND s.is_active = true AND s.session_state = 'active'
     AND (s.expires_at IS NULL OR s.expires_at > now())
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_session_mfa(text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 6) Yöntem bilgisi: + kullanılabilir kurtarma kodu sayısı ─────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_user_methods(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'has_device', EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = p_user_id AND d.state = 'active'),
    'email_verified', coalesce((SELECT u.email_verified_at IS NOT NULL FROM public.users u WHERE u.id = p_user_id), false),
    'recovery_codes', (SELECT count(*) FROM public.auth_recovery_codes c
                        WHERE c.user_id = p_user_id AND c.state = 'active'
                          AND (c.expires_at IS NULL OR c.expires_at > now())
                          AND (c.kind <> 'owner_offline' OR public.auth_is_owner_admin(p_user_id))));
$$;
REVOKE ALL ON FUNCTION public.auth_mfa_user_methods(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) TO service_role;

-- ── 7) A — Kurtarma kodu üretimi (MFA'lı oturum; parola yeniden doğrulaması uygulamada) ─
CREATE OR REPLACE FUNCTION public.auth_recovery_codes_generate(p_actor_token text, p_code_hashes text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := public.auth_session_actor(p_actor_token, true);
  v_user    public.users%ROWTYPE;
  v_n       integer;
  v_revoked integer;
  v_batch   uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || v_actor::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v_actor;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_code_hashes IS NULL OR cardinality(p_code_hashes) <> 10
     OR (SELECT count(DISTINCT h) FROM unnest(p_code_hashes) h WHERE h ~ '^[0-9a-f]{64}$') <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_recovery_events
   WHERE user_id = v_actor AND event = 'codes_generated' AND created_at > now() - interval '24 hours';
  IF v_n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 3600);
  END IF;

  UPDATE public.auth_recovery_codes
     SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated'
   WHERE user_id = v_actor AND kind = 'user' AND state = 'active';
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
  SELECT v_actor, 'user', v_batch, h FROM unnest(p_code_hashes) h;

  PERFORM public.auth_recovery_log(v_actor, v_actor, 'codes_generated', jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_actor, 'recovery_codes_generated', 'high',
          CASE WHEN v_revoked > 0 THEN 'Kurtarma kodları yenilendi (eski kodlar geçersiz)' ELSE 'Kurtarma kodları oluşturuldu' END,
          jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked));
  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'count', 10, 'revoked', v_revoked);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_codes_generate(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_codes_generate(text, text[]) TO service_role;

-- ── 8) Kullanıcının kurtarma durumu (kod / dava / oturum yöntemi; özet DÖNMEZ) ─
CREATE OR REPLACE FUNCTION public.auth_recovery_status(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s     record;
  v_owner boolean;
  v_kind  text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  v_owner := public.auth_is_owner_admin(v_s.user_id);
  -- Süresi geçmiş bekleyen dava → expired (yalnız bu kullanıcınınki).
  UPDATE public.auth_recovery_cases SET state = 'expired', closed_at = now()
   WHERE user_id = v_s.user_id AND state = 'waiting' AND expires_at <= now();
  IF v_s.mfa_method = 'recovery_code' THEN
    SELECT rc.kind INTO v_kind FROM public.auth_mfa_challenges c
      JOIN public.auth_recovery_codes rc ON rc.id = c.recovery_code_id
     WHERE c.id = v_s.challenge_id;
  END IF;
  RETURN jsonb_build_object('ok', true,
    'is_owner', v_owner,
    'session_method', v_s.mfa_method,
    'session_recovery_kind', v_kind,
    'owner_bootstrap_available', coalesce(v_owner AND v_kind = 'owner_offline' AND v_s.created_at > now() - interval '30 minutes'
        AND NOT EXISTS (SELECT 1 FROM public.auth_recovery_events e
                         WHERE e.user_id = v_s.user_id AND e.event = 'owner_offline_bootstrap'
                           AND e.detail->>'session_id' = v_s.session_id::text), false),
    'codes_active', (SELECT count(*) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind = 'user' AND state = 'active'),
    'codes_generated_at', (SELECT max(created_at) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind = 'user' AND state = 'active'),
    'codes_last_used_at', (SELECT max(used_at) FROM public.auth_recovery_codes WHERE user_id = v_s.user_id AND kind IN ('user', 'case_ticket')),
    'owner_offline_active', CASE WHEN v_owner THEN (SELECT count(*) FROM public.auth_recovery_codes
                                                     WHERE user_id = v_s.user_id AND kind = 'owner_offline' AND state = 'active') END,
    'open_case', (SELECT jsonb_build_object('id', c.id, 'opened_at', c.opened_at, 'not_before', c.not_before)
                    FROM public.auth_recovery_cases c WHERE c.user_id = v_s.user_id AND c.state = 'waiting' LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_status(text) TO service_role;

-- ── 9) A/F — Girişte kurtarma kodu doğrulaması (parola sonrası challenge; atomik) ─
--   Sonuç: { ok:true, kind, remaining } | { ok:false, reason:'invalid'|'wrong'|'locked'|'rate_limited', attempts_left? }
CREATE OR REPLACE FUNCTION public.auth_recovery_code_verify(
  p_challenge_id uuid, p_browser_secret_hash text, p_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now    timestamptz := now();
  v_ch     public.auth_mfa_challenges%ROWTYPE;
  v_user   public.users%ROWTYPE;
  v_code   public.auth_recovery_codes%ROWTYPE;
  v_owner  boolean;
  v_n      integer;
  v_closed integer := 0;
BEGIN
  IF p_challenge_id IS NULL OR p_browser_secret_hash IS NULL OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- Aynı challenge'a paralel istekler bu kilitte sıraya girer (ikincisi 'verified' görür → invalid).
  SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND OR v_ch.browser_secret_hash <> p_browser_secret_hash OR v_ch.purpose <> 'login' OR v_ch.state <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_ch.expires_at <= v_now THEN
    UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE id = v_ch.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = v_ch.user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true OR v_user.mfa_required IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- Kaba kuvvet tavanı (savunma derinliği; kod 140 bit): kullanıcı başına kayan 24 saatte 10 yanlış.
  SELECT count(*) INTO v_n FROM public.auth_recovery_attempts
   WHERE user_id = v_ch.user_id AND ok = false AND created_at > v_now - interval '24 hours';
  IF v_n >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retry_after', 3600);
  END IF;

  v_owner := public.auth_is_owner_admin(v_ch.user_id);
  -- Aynı kod iki challenge'da paralel: satır kilidi + state='active' yeniden değerlendirmesi → yalnız biri.
  SELECT * INTO v_code FROM public.auth_recovery_codes
   WHERE user_id = v_ch.user_id AND code_hash = p_code_hash AND state = 'active'
     AND (expires_at IS NULL OR expires_at > v_now)
     AND (kind <> 'owner_offline' OR v_owner)
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.auth_recovery_attempts (user_id, challenge_id, ok, created_at) VALUES (v_ch.user_id, v_ch.id, false, v_now);
    SELECT count(*) INTO v_n FROM public.auth_recovery_attempts WHERE challenge_id = v_ch.id AND ok = false;
    IF v_n >= 5 THEN
      UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'recovery_locked' WHERE id = v_ch.id;
      PERFORM public.auth_recovery_log(v_ch.user_id, NULL, 'code_locked', jsonb_build_object('challenge_id', v_ch.id));
      INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
      VALUES (v_ch.user_id, 'recovery_code_locked', 'high', 'Kurtarma kodu 5 kez yanlış girildi; giriş isteği kapatıldı',
              jsonb_build_object('challenge_id', v_ch.id));
      RETURN jsonb_build_object('ok', false, 'reason', 'locked');
    END IF;
    PERFORM public.auth_recovery_log(v_ch.user_id, NULL, 'code_wrong', jsonb_build_object('challenge_id', v_ch.id));
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', 5 - v_n);
  END IF;

  UPDATE public.auth_recovery_codes SET state = 'used', used_at = v_now, used_challenge_id = v_ch.id WHERE id = v_code.id;
  INSERT INTO public.auth_recovery_attempts (user_id, challenge_id, ok, created_at) VALUES (v_ch.user_id, v_ch.id, true, v_now);
  IF NOT public.auth_mfa_mark_verified(v_ch.id, 'recovery_code') THEN
    RAISE EXCEPTION 'auth_recovery_code_verify: challenge işaretlenemedi' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.auth_mfa_challenges SET recovery_code_id = v_code.id WHERE id = v_ch.id;

  IF v_code.kind = 'owner_offline' THEN
    -- Owner telefonunu/e-postasını kaybetti: kayıp cihazdaki (ör. Android) açık oturumlar dahil HEPSİ kapanır.
    UPDATE public.user_sessions
       SET is_active = false, ended_at = v_now, end_reason = 'owner_offline_recovery'
     WHERE user_id = v_ch.user_id AND is_active = true;
    GET DIAGNOSTICS v_closed = ROW_COUNT;
    PERFORM public.auth_recovery_log(v_ch.user_id, v_ch.user_id, 'owner_offline_used',
                                     jsonb_build_object('challenge_id', v_ch.id, 'sessions_closed', v_closed));
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (v_ch.user_id, 'owner_offline_code_used', 'critical',
            'Owner çevrimdışı kurtarma koduyla giriş doğrulandı; diğer bütün oturumlar kapatıldı',
            jsonb_build_object('challenge_id', v_ch.id, 'sessions_closed', v_closed));
  ELSE
    PERFORM public.auth_recovery_log(v_ch.user_id, v_ch.user_id, 'code_used',
                                     jsonb_build_object('challenge_id', v_ch.id, 'kind', v_code.kind));
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (v_ch.user_id, 'recovery_code_used', 'high',
            CASE WHEN v_code.kind = 'case_ticket' THEN 'Hesap kurtarma biletiyle giriş doğrulandı' ELSE 'Kurtarma koduyla giriş doğrulandı' END,
            jsonb_build_object('challenge_id', v_ch.id, 'kind', v_code.kind));
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', v_code.kind,
    'remaining', (SELECT count(*) FROM public.auth_recovery_codes WHERE user_id = v_ch.user_id AND kind = 'user' AND state = 'active'));
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_code_verify(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_code_verify(uuid, text, text) TO service_role;

-- ── 10) F — Owner çevrimdışı kurtarma kiti (YALNIZ SQL konsolu / postgres) ───
--   select * from public.auth_owner_offline_kit_issue();  → 5 kod (bir kez gösterilir; kâğıda yazılıp
--   kasada saklanır). Önceki kit iptal edilir.
CREATE OR REPLACE FUNCTION public.auth_owner_offline_kit_issue()
RETURNS SETOF text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_n     integer;
  v_batch uuid := gen_random_uuid();
  v_code  text;
  v_rev   integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'auth_owner_offline_kit_issue: tam olarak 1 aktif Owner bekleniyor (%)', v_n;
  END IF;
  SELECT u.id INTO v_owner FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE;
  UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated'
   WHERE user_id = v_owner AND kind = 'owner_offline' AND state = 'active';
  GET DIAGNOSTICS v_rev = ROW_COUNT;
  FOR i IN 1..5 LOOP
    v_code := public.auth_recovery_random_code();
    INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
    VALUES (v_owner, 'owner_offline', v_batch, public.auth_recovery_hash(v_owner, v_code));
    RETURN NEXT substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4) || '-' ||
                substr(v_code, 13, 4) || '-' || substr(v_code, 17, 4) || '-' || substr(v_code, 21, 4) || '-' || substr(v_code, 25, 4);
  END LOOP;
  PERFORM public.auth_recovery_log(v_owner, NULL, 'owner_offline_kit_issued', jsonb_build_object('batch_id', v_batch, 'revoked', v_rev));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_owner, 'owner_offline_kit_issued', 'critical', 'Owner çevrimdışı kurtarma kiti üretildi (SQL konsolu)',
          jsonb_build_object('batch_id', v_batch, 'revoked', v_rev));
  RETURN;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_offline_kit_issue() FROM PUBLIC, anon, authenticated, service_role;

-- F — Çevrimdışı kodla açılmış TAZE Owner oturumundan yeni telefon için eşleştirme (bootstrap) kodu.
--   Koşullar: oturum = recovery_code + kod türü owner_offline + Owner + oturum ≤30 dk + oturum başına 1 kez.
--   Uygulama ayrıca parolayı yeniden doğrular. Kod 15 dk, tek kullanım (F2-C bootstrap tablosu/akışı).
CREATE OR REPLACE FUNCTION public.auth_owner_offline_bootstrap(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s    record;
  v_kind text;
  v_code text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL OR v_s.mfa_method IS DISTINCT FROM 'recovery_code' OR NOT public.auth_is_owner_admin(v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT rc.kind INTO v_kind FROM public.auth_mfa_challenges c
    JOIN public.auth_recovery_codes rc ON rc.id = c.recovery_code_id
   WHERE c.id = v_s.challenge_id AND rc.user_id = v_s.user_id;
  IF v_kind IS DISTINCT FROM 'owner_offline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v_s.created_at <= now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_session');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-bootstrap:' || v_s.user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.auth_recovery_events e
              WHERE e.user_id = v_s.user_id AND e.event = 'owner_offline_bootstrap' AND e.detail->>'session_id' = v_s.session_id::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_issued');
  END IF;
  UPDATE public.auth_owner_bootstrap_codes SET expires_at = least(expires_at, now())
   WHERE owner_id = v_s.user_id AND used_at IS NULL AND expires_at > now();
  v_code := substr(public.auth_recovery_random_code(), 1, 20);
  INSERT INTO public.auth_owner_bootstrap_codes (owner_id, code_hash, created_at, expires_at)
  VALUES (v_s.user_id, encode(sha256(convert_to('yasam-bootstrap:' || v_code, 'UTF8')), 'hex'), now(), now() + interval '15 minutes');
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'owner_offline_bootstrap', jsonb_build_object('session_id', v_s.session_id));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_s.user_id, 'owner_bootstrap_issued', 'critical', 'Owner ilk cihaz kodu üretildi (çevrimdışı kurtarma oturumu)',
          jsonb_build_object('session_id', v_s.session_id));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', now() + interval '15 minutes');
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_offline_bootstrap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_offline_bootstrap(text) TO service_role;

-- ── 11) D — E-posta adresi değişikliği ───────────────────────────────────────
-- Adres herhangi bir yoldan değişirse (Owner paneli, veri düzeltme vb.) kutu sahipliği kanıtı düşer.
-- YALNIZ auth_email_change_confirm (yeni adrese gönderilmiş doğru kod) yeni adresi doğrulanmış yazar.
CREATE OR REPLACE FUNCTION public.users_email_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.email, '')))
     AND coalesce(current_setting('yasam.email_change', true), '') <> 'on' THEN
    NEW.email_verified_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.users_email_change_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS users_email_change_guard_trg ON public.users;
CREATE TRIGGER users_email_change_guard_trg
  BEFORE UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_email_change_guard();

CREATE OR REPLACE FUNCTION public.users_email_changed_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.email, ''))) THEN
    -- Eski adrese gitmiş / bekleyen kodlar ve değişiklik istekleri geçersiz.
    UPDATE public.auth_email_otps SET state = 'superseded' WHERE user_id = NEW.id AND state IN ('pending', 'active');
    UPDATE public.auth_email_change_requests SET state = 'superseded' WHERE user_id = NEW.id AND state = 'pending';
    PERFORM public.auth_recovery_log(NEW.id, NULL, 'email_changed',
      jsonb_build_object('verified', coalesce(current_setting('yasam.email_change', true), '') = 'on'));
    INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
    VALUES (NEW.id, 'email_changed', 'high',
            CASE WHEN coalesce(current_setting('yasam.email_change', true), '') = 'on'
                 THEN 'E-posta adresi kullanıcı tarafından doğrulanarak değiştirildi'
                 ELSE 'E-posta adresi değiştirildi; e-posta doğrulaması sıfırlandı' END,
            '{}'::jsonb);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.users_email_changed_after() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS users_email_changed_after_trg ON public.users;
CREATE TRIGGER users_email_changed_after_trg
  AFTER UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_email_changed_after();

-- Değişiklik yalnız QR (güvenilir cihaz) veya kurtarma koduyla açılmış oturumdan: e-posta koduyla açılmış
-- oturum (kutuyu ele geçirmiş saldırgan) adresi değiştirip kalıcılaşamaz. Parola uygulamada yeniden sorulur.
CREATE OR REPLACE FUNCTION public.auth_email_change_begin(
  p_actor_token text, p_new_email text, p_code_hash text, p_to_hash text, p_provider text,
  p_daily_limit integer, p_warn_at integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_s     record;
  v_user  public.users%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_new_email, '')));
  v_n     integer;
  v_last  timestamptz;
  v_24h   integer;
  v_del   bigint;
  v_otp   bigint;
  v_req   uuid;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v_s.mfa_method IS NULL OR v_s.mfa_method NOT IN ('qr_device', 'recovery_code') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'strong_mfa_required');
  END IF;
  IF p_code_hash !~ '^[0-9a-f]{64}$' OR p_to_hash !~ '^[0-9a-f]{64}$' OR p_provider NOT IN ('gmail', 'synthetic')
     OR length(v_email) NOT BETWEEN 6 AND 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-otp:' || v_s.user_id::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v_s.user_id;
  IF lower(btrim(coalesce(v_user.email, ''))) = v_email THEN
    RETURN jsonb_build_object('ok', false, 'code', 'same_email');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(btrim(coalesce(u.email, ''))) = v_email AND u.id <> v_s.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_unavailable');
  END IF;
  SELECT max(created_at), count(*) FILTER (WHERE created_at > v_now - interval '24 hours')
    INTO v_last, v_n FROM public.auth_email_change_requests WHERE user_id = v_s.user_id;
  IF v_last IS NOT NULL AND v_last > v_now - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cooldown',
                              'retry_after', ceil(extract(epoch FROM (v_last + interval '60 seconds' - v_now)))::int);
  END IF;
  IF v_n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 3600);
  END IF;
  SELECT count(*) INTO v_24h FROM public.auth_email_deliveries
   WHERE created_at > v_now - interval '24 hours' AND state IN ('reserved', 'sent');
  IF p_daily_limit IS NOT NULL AND v_24h >= p_daily_limit THEN
    PERFORM public.auth_email_notify('kota_doldu', jsonb_build_object('son_24_saat', v_24h, 'sinir', p_daily_limit));
    RETURN jsonb_build_object('ok', false, 'code', 'quota_exhausted');
  END IF;
  IF p_warn_at IS NOT NULL AND v_24h + 1 >= p_warn_at THEN
    PERFORM public.auth_email_notify('kota_esigi', jsonb_build_object('son_24_saat', v_24h + 1, 'esik', p_warn_at));
  END IF;

  UPDATE public.auth_email_otps SET state = 'superseded'
   WHERE user_id = v_s.user_id AND purpose = 'change_email' AND state IN ('pending', 'active');
  UPDATE public.auth_email_change_requests SET state = 'superseded' WHERE user_id = v_s.user_id AND state = 'pending';
  INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state, created_at)
  VALUES (v_s.user_id, 'change_email', p_provider, p_to_hash, 'reserved', v_now) RETURNING id INTO v_del;
  INSERT INTO public.auth_email_otps (user_id, purpose, challenge_id, code_hash, delivery_id, state, created_at, expires_at)
  VALUES (v_s.user_id, 'change_email', NULL, p_code_hash, v_del, 'pending', v_now, v_now + interval '10 minutes')
  RETURNING id INTO v_otp;
  INSERT INTO public.auth_email_change_requests (user_id, new_email, otp_id, state, created_at, expires_at)
  VALUES (v_s.user_id, v_email, v_otp, 'pending', v_now, v_now + interval '10 minutes') RETURNING id INTO v_req;
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'email_change_requested', jsonb_build_object('request_id', v_req));
  RETURN jsonb_build_object('ok', true, 'request_id', v_req, 'delivery_id', v_del, 'expires_at', v_now + interval '10 minutes');
END $$;
REVOKE ALL ON FUNCTION public.auth_email_change_begin(text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_change_begin(text, text, text, text, text, integer, integer) TO service_role;

-- Sonuç: { ok:true, old_email } (eski adrese bildirim için; yalnız sunucuya) | { ok:false, code, attempts_left? }
CREATE OR REPLACE FUNCTION public.auth_email_change_confirm(p_actor_token text, p_request_id uuid, p_code_hash text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_s    record;
  v_req  public.auth_email_change_requests%ROWTYPE;
  v_otp  public.auth_email_otps%ROWTYPE;
  v_old  text;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v_s.mfa_method IS NULL OR v_s.mfa_method NOT IN ('qr_device', 'recovery_code') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'strong_mfa_required');
  END IF;
  SELECT * INTO v_req FROM public.auth_email_change_requests
   WHERE id = p_request_id AND user_id = v_s.user_id FOR UPDATE;
  IF NOT FOUND OR v_req.state <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  SELECT * INTO v_otp FROM public.auth_email_otps WHERE id = v_req.otp_id FOR UPDATE;
  IF NOT FOUND OR v_otp.state <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', CASE WHEN v_otp.state = 'pending' THEN 'not_sent' ELSE 'invalid' END);
  END IF;
  IF v_otp.expires_at <= v_now OR v_req.expires_at <= v_now THEN
    UPDATE public.auth_email_otps SET state = 'expired' WHERE id = v_otp.id;
    UPDATE public.auth_email_change_requests SET state = 'expired' WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF p_code_hash IS DISTINCT FROM v_otp.code_hash THEN
    UPDATE public.auth_email_otps
       SET attempts = attempts + 1, state = CASE WHEN attempts + 1 >= 5 THEN 'locked' ELSE state END
     WHERE id = v_otp.id;
    IF v_otp.attempts + 1 >= 5 THEN
      UPDATE public.auth_email_change_requests SET state = 'locked' WHERE id = v_req.id;
      RETURN jsonb_build_object('ok', false, 'code', 'locked');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'wrong', 'attempts_left', 4 - v_otp.attempts);
  END IF;

  SELECT email INTO v_old FROM public.users WHERE id = v_s.user_id FOR UPDATE;
  UPDATE public.auth_email_otps SET state = 'used', used_at = v_now WHERE id = v_otp.id;
  BEGIN
    PERFORM set_config('yasam.email_change', 'on', true);
    UPDATE public.users SET email = v_req.new_email, email_verified_at = v_now WHERE id = v_s.user_id;
    PERFORM set_config('yasam.email_change', 'off', true);
  EXCEPTION WHEN unique_violation THEN
    PERFORM set_config('yasam.email_change', 'off', true);
    UPDATE public.auth_email_change_requests SET state = 'superseded' WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', false, 'code', 'email_unavailable');
  END;
  UPDATE public.auth_email_change_requests SET state = 'done', done_at = v_now WHERE id = v_req.id;
  RETURN jsonb_build_object('ok', true, 'old_email', v_old);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_change_confirm(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_change_confirm(text, uuid, text) TO service_role;

-- Güvenlik bildirimi gönderim kaydı (adres YOK; yalnız özet). Kod İÇERMEYEN bildirimler içindir.
CREATE OR REPLACE FUNCTION public.auth_email_notice_reserve(p_user_id uuid, p_to_hash text, p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_user_id IS NULL OR p_to_hash !~ '^[0-9a-f]{64}$' OR p_provider NOT IN ('gmail', 'synthetic') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  -- Bildirim seli olmasın: kullanıcı başına saatte ≤10.
  IF (SELECT count(*) FROM public.auth_email_deliveries
       WHERE user_id = p_user_id AND purpose = 'security_notice' AND created_at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;
  INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state)
  VALUES (p_user_id, 'security_notice', p_provider, p_to_hash, 'reserved') RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_notice_reserve(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_notice_reserve(uuid, text, text) TO service_role;

-- ── 12) C — Telefon değişimi ─────────────────────────────────────────────────
-- Eski telefonla (QR) onaylanmış ≤30 dk'lık oturum = eski cihaza sahiplik kanıtı. Yeni cihaz yine
-- F2-C akışıyla eşleşir (Owner onayı + cihaz imzası); aktifleştiği anda eski cihaz otomatik iptal.
CREATE OR REPLACE FUNCTION public.auth_device_replace_begin(p_actor_token text, p_old_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s   record;
  v_dev uuid;
  v_id  bigint;
BEGIN
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  SELECT c.approved_device_id INTO v_dev FROM public.auth_mfa_challenges c
   WHERE c.id = v_s.challenge_id AND c.user_id = v_s.user_id AND c.method = 'qr_device';
  IF v_s.mfa_method IS DISTINCT FROM 'qr_device' OR v_dev IS DISTINCT FROM p_old_device_id
     OR v_s.created_at <= now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'old_device_proof_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_trusted_devices WHERE id = p_old_device_id AND user_id = v_s.user_id AND state = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('device:' || v_s.user_id::text, 0));
  UPDATE public.auth_device_replacements SET state = 'cancelled', closed_at = now()
   WHERE user_id = v_s.user_id AND state = 'waiting';
  INSERT INTO public.auth_device_replacements (user_id, old_device_id, state, created_at, expires_at)
  VALUES (v_s.user_id, p_old_device_id, 'waiting', now(), now() + interval '24 hours') RETURNING id INTO v_id;
  PERFORM public.auth_recovery_log(v_s.user_id, v_s.user_id, 'device_replace_requested',
                                   jsonb_build_object('old_device_id', p_old_device_id, 'replacement_id', v_id));
  RETURN jsonb_build_object('ok', true, 'expires_at', now() + interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION public.auth_device_replace_begin(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_replace_begin(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_device_replace_cancel(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, false);
  v_n integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  UPDATE public.auth_device_replacements SET state = 'cancelled', closed_at = now()
   WHERE user_id = v_actor AND state = 'waiting';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    PERFORM public.auth_recovery_log(v_actor, v_actor, 'device_replace_cancelled', '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'cancelled', v_n);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_replace_cancel(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_replace_cancel(text) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_device_replace_status(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, false);
  v_s record;
  v_dev uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  UPDATE public.auth_device_replacements SET state = 'expired', closed_at = now()
   WHERE user_id = v_actor AND state = 'waiting' AND expires_at <= now();
  SELECT * INTO v_s FROM public.auth_session_mfa(p_actor_token);
  IF v_s.mfa_method = 'qr_device' AND v_s.created_at > now() - interval '30 minutes' THEN
    SELECT c.approved_device_id INTO v_dev FROM public.auth_mfa_challenges c WHERE c.id = v_s.challenge_id;
  END IF;
  RETURN jsonb_build_object('ok', true,
    'proof_device_id', v_dev,
    'waiting', (SELECT jsonb_build_object('old_device_id', r.old_device_id, 'display_code', d.display_code,
                                          'model', d.device_model, 'expires_at', r.expires_at)
                  FROM public.auth_device_replacements r JOIN public.auth_trusted_devices d ON d.id = r.old_device_id
                 WHERE r.user_id = v_actor AND r.state = 'waiting' LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.auth_device_replace_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_replace_status(text) TO service_role;

-- Cihaz iptalinin ortak etkileri (F2-C auth_device_revoke ile AYNI sonuç; aktör/neden parametreli).
CREATE OR REPLACE FUNCTION public.auth_device_revoke_internal(p_device_id uuid, p_actor_id uuid, p_reason text, p_note text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.auth_trusted_devices%ROWTYPE;
  v_sessions integer := 0;
BEGIN
  SELECT * INTO v FROM public.auth_trusted_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v.state IN ('revoked', 'rejected', 'expired') THEN
    RETURN 0;
  END IF;
  UPDATE public.auth_trusted_devices
     SET state = 'revoked', revoked_at = now(), revoked_by = p_actor_id, activation_nonce = NULL,
         revoke_reason = left(p_reason, 300)
   WHERE id = v.id;
  UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'device_revoked'
   WHERE approved_device_id = v.id AND state = 'verified';
  UPDATE public.user_sessions s
     SET is_active = false, ended_at = now(), end_reason = 'device_revoked'
   WHERE s.is_active = true
     AND s.mfa_challenge_id IN (SELECT c.id FROM public.auth_mfa_challenges c WHERE c.approved_device_id = v.id);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  INSERT INTO public.auth_device_decisions (device_id, actor_id, decision, verification_method, note)
  VALUES (v.id, coalesce(p_actor_id, v.user_id), 'revoke', CASE WHEN p_actor_id = v.user_id THEN 'kullanici' END, left(p_note, 500));
  PERFORM public.auth_device_notify(v.id, v.user_id, 'cihaz_iptal');
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, 'device_revoked', 'high', 'Güvenilir cihaz iptal edildi',
          jsonb_build_object('device_id', v.id, 'actor_id', p_actor_id, 'sessions_closed', v_sessions, 'reason', left(p_reason, 60)));
  RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.auth_device_revoke_internal(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- auth_device_activate (AYNI imza, AYNI kurallar) + bekleyen telefon değişiminde eski cihazın iptali.
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
  v_rep public.auth_device_replacements%ROWTYPE;
  v_replaced boolean := false;
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

  -- F2-E: bekleyen telefon değişimi → eski cihaz iptal (yeni cihaz Owner onayı + kendi imzasıyla aktifleşti).
  SELECT * INTO v_rep FROM public.auth_device_replacements
   WHERE user_id = v.user_id AND state = 'waiting' FOR UPDATE;
  IF FOUND THEN
    IF v_rep.expires_at > now() AND v_rep.old_device_id <> v.id THEN
      PERFORM public.auth_device_revoke_internal(v_rep.old_device_id, v.user_id, 'Telefon değişimi', 'telefon_degisimi');
      UPDATE public.auth_device_replacements SET state = 'done', new_device_id = v.id, closed_at = now() WHERE id = v_rep.id;
      PERFORM public.auth_recovery_log(v.user_id, v.user_id, 'device_replaced',
                                       jsonb_build_object('old_device_id', v_rep.old_device_id, 'new_device_id', v.id));
      v_replaced := true;
    ELSE
      UPDATE public.auth_device_replacements SET state = 'expired', closed_at = now() WHERE id = v_rep.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', 'active', 'replaced', v_replaced);
END $$;
REVOKE ALL ON FUNCTION public.auth_device_activate(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_device_activate(uuid, text) TO service_role;

-- auth_device_list (AYNI imza/yetki) + Owner bekleyen listesinde telefon değişimi bilgisi.
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
               'created_at', d.created_at,
               'replaces', (SELECT jsonb_build_object('display_code', od.display_code, 'model', od.device_model)
                              FROM public.auth_device_replacements r JOIN public.auth_trusted_devices od ON od.id = r.old_device_id
                             WHERE r.user_id = d.user_id AND r.state = 'waiting' AND r.expires_at > now() LIMIT 1))
               ORDER BY d.created_at)
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

-- ── 13) E — Owner aracılı hesap kurtarma (72 saat) ───────────────────────────
CREATE OR REPLACE FUNCTION public.auth_recovery_case_open(
  p_actor_token text, p_user_id uuid, p_verification_method text, p_note text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, true);
  v_user  public.users%ROWTYPE;
  v_id    uuid;
  v_now   timestamptz := now();
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RETURN jsonb_build_object('ok', false, 'code', 'self_forbidden');
  END IF;
  IF p_verification_method IS NULL OR p_verification_method NOT IN ('telefon', 'yuz_yuze', 'kimlik_belgesi') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'verification_required');
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'note_required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || p_user_id::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF public.auth_is_owner_admin(p_user_id) THEN
    -- Owner'ın kurtarılması ayrı (çevrimdışı kit) yoldur.
    RETURN jsonb_build_object('ok', false, 'code', 'owner_target_forbidden');
  END IF;
  IF v_user.mfa_required IS DISTINCT FROM true THEN
    -- İkinci doğrulaması zorunlu olmayan hesapta kurtarma = mevcut parola sıfırlama akışı.
    RETURN jsonb_build_object('ok', false, 'code', 'mfa_not_required');
  END IF;
  UPDATE public.auth_recovery_cases SET state = 'expired', closed_at = v_now
   WHERE user_id = p_user_id AND state = 'waiting' AND expires_at <= v_now;
  IF EXISTS (SELECT 1 FROM public.auth_recovery_cases WHERE user_id = p_user_id AND state = 'waiting') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'case_exists');
  END IF;
  INSERT INTO public.auth_recovery_cases (user_id, opened_by, verification_method, verification_note, state,
                                          opened_at, not_before, expires_at)
  VALUES (p_user_id, v_actor, p_verification_method, btrim(p_note), 'waiting',
          v_now, v_now + interval '72 hours', v_now + interval '72 hours' + interval '7 days')
  RETURNING id INTO v_id;
  PERFORM public.auth_recovery_log(p_user_id, v_actor, 'case_opened',
                                   jsonb_build_object('case_id', v_id, 'method', p_verification_method));
  PERFORM public.auth_recovery_notify(v_id, p_user_id, NULL);
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user_id, 'account_recovery_opened', 'critical',
          'Hesap kurtarma talebi açıldı (72 saat bekleme). Siz başlatmadıysanız giriş yapıp talebi iptal edin.',
          jsonb_build_object('case_id', v_id, 'actor_id', v_actor));
  RETURN jsonb_build_object('ok', true, 'case_id', v_id, 'not_before', v_now + interval '72 hours');
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_open(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_open(text, uuid, text, text) TO service_role;

-- İptal (Owner veya hesabın KENDİSİ — erişimi olduğunu MFA'lı oturumla kanıtlar) / ret (yalnız Owner).
CREATE OR REPLACE FUNCTION public.auth_recovery_case_close(p_actor_token text, p_case_id uuid, p_action text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, true);
  v       public.auth_recovery_cases%ROWTYPE;
  v_owner boolean;
BEGIN
  IF v_actor IS NULL OR p_action NOT IN ('cancel', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  v_owner := public.auth_is_owner_admin(v_actor);
  SELECT * INTO v FROM public.auth_recovery_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR (v.user_id <> v_actor AND NOT v_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF p_action = 'reject' AND NOT v_owner THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF v.state <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_waiting', 'state', v.state);
  END IF;
  UPDATE public.auth_recovery_cases
     SET state = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'cancelled' END,
         closed_at = now(), closed_by = v_actor, close_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
   WHERE id = v.id;
  PERFORM public.auth_recovery_log(v.user_id, v_actor, CASE WHEN p_action = 'reject' THEN 'case_rejected' ELSE 'case_cancelled' END,
                                   jsonb_build_object('case_id', v.id, 'by_user', v_actor = v.user_id));
  PERFORM public.auth_recovery_notify(v.id, v.user_id, CASE WHEN p_action = 'reject' THEN 'kurtarma_reddedildi' ELSE 'kurtarma_iptal' END);
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, CASE WHEN p_action = 'reject' THEN 'account_recovery_rejected' ELSE 'account_recovery_cancelled' END, 'high',
          CASE WHEN p_action = 'reject' THEN 'Hesap kurtarma talebi reddedildi (kimlik doğrulanamadı)'
               WHEN v_actor = v.user_id THEN 'Hesap kurtarma talebi hesap sahibi tarafından iptal edildi'
               ELSE 'Hesap kurtarma talebi iptal edildi' END,
          jsonb_build_object('case_id', v.id, 'actor_id', v_actor));
  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'cancelled' END);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_close(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_close(text, uuid, text, text) TO service_role;

-- Yürütme: ≥72 saat sonra, yeniden kimlik teyidiyle, TEK işlemde. Bilet (≥128 bit, uygulamada üretilir)
-- yalnız özetiyle saklanır; 24 saat geçerli; YİNE parola ile birlikte kullanılır.
CREATE OR REPLACE FUNCTION public.auth_recovery_case_execute(
  p_actor_token text, p_case_id uuid, p_ticket_hash text, p_identity_reconfirmed boolean
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor    uuid := public.auth_session_actor(p_actor_token, true);
  v          public.auth_recovery_cases%ROWTYPE;
  v_user     public.users%ROWTYPE;
  v_now      timestamptz := now();
  v_dev      record;
  v_devices  integer := 0;
  v_sessions integer := 0;
  v_codes    integer := 0;
  v_req      boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_ticket_hash IS NULL OR p_ticket_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  SELECT * INTO v FROM public.auth_recovery_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v.state <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_waiting', 'state', v.state);
  END IF;
  IF v.expires_at <= v_now THEN
    UPDATE public.auth_recovery_cases SET state = 'expired', closed_at = v_now WHERE id = v.id;
    PERFORM public.auth_recovery_log(v.user_id, v_actor, 'case_expired', jsonb_build_object('case_id', v.id));
    PERFORM public.auth_recovery_notify(v.id, v.user_id, 'kurtarma_iptal');
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  IF v_now < v.not_before THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_early', 'not_before', v.not_before);
  END IF;
  IF p_identity_reconfirmed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'verification_required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || v.user_id::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v.user_id FOR UPDATE;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true OR public.auth_is_owner_admin(v.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  -- Hesap sahibi talep açıldıktan sonra MFA'lı giriş yaptıysa hâlâ erişimi var demektir → yürütme YOK
  -- (sosyal mühendislikle açılmış talep, gerçek sahibin hesabını elinden alamaz).
  IF EXISTS (SELECT 1 FROM public.user_sessions s
              WHERE s.user_id = v.user_id AND s.mfa_method IS NOT NULL AND s.created_at > v.opened_at) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'user_active_since_open');
  END IF;
  v_req := v_user.mfa_required;

  -- 1) Bütün cihazlar (bekleyen dahil) iptal.
  FOR v_dev IN SELECT id FROM public.auth_trusted_devices
                WHERE user_id = v.user_id AND state IN ('pending_owner', 'owner_approved', 'active') LOOP
    v_devices := v_devices + public.auth_device_revoke_internal(v_dev.id, v_actor, 'Hesap kurtarma', 'hesap_kurtarma');
  END LOOP;
  UPDATE public.auth_device_replacements SET state = 'cancelled', closed_at = v_now WHERE user_id = v.user_id AND state = 'waiting';
  -- 2) Açık giriş istekleri red, bütün oturumlar kapalı.
  UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'account_recovery'
   WHERE user_id = v.user_id AND state IN ('pending', 'verified');
  UPDATE public.user_sessions SET is_active = false, ended_at = v_now, end_reason = 'account_recovery'
   WHERE user_id = v.user_id AND is_active = true;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  -- 3) Eski kurtarma kodları / biletler iptal; e-posta kodları ve değişiklik istekleri geçersiz.
  UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = v_now, revoke_reason = 'account_recovery'
   WHERE user_id = v.user_id AND state = 'active';
  GET DIAGNOSTICS v_codes = ROW_COUNT;
  UPDATE public.auth_email_otps SET state = 'superseded' WHERE user_id = v.user_id AND state IN ('pending', 'active');
  UPDATE public.auth_email_change_requests SET state = 'superseded' WHERE user_id = v.user_id AND state = 'pending';
  -- 4) E-posta kutusu sahipliği kanıtı düşer (kullanıcı girişten sonra yeniden doğrular).
  UPDATE public.users SET email_verified_at = NULL WHERE id = v.user_id;
  -- 5) Tek kullanımlık 24 saatlik kurtarma bileti.
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash, expires_at)
  VALUES (v.user_id, 'case_ticket', v.id, p_ticket_hash, v_now + interval '24 hours');
  UPDATE public.auth_recovery_cases SET state = 'executed', closed_at = v_now, closed_by = v_actor WHERE id = v.id;

  IF (SELECT mfa_required FROM public.users WHERE id = v.user_id) IS DISTINCT FROM v_req THEN
    RAISE EXCEPTION 'auth_recovery_case_execute: MFA zorunluluğu değişmemeli' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.auth_recovery_log(v.user_id, v_actor, 'case_executed',
    jsonb_build_object('case_id', v.id, 'devices_revoked', v_devices, 'sessions_closed', v_sessions, 'codes_revoked', v_codes));
  PERFORM public.auth_recovery_notify(v.id, v.user_id, 'kurtarma_tamamlandi');
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v.user_id, 'account_recovery_executed', 'critical',
          'Hesap kurtarma yürütüldü: cihazlar iptal edildi, oturumlar kapatıldı, tek kullanımlık kurtarma bileti verildi',
          jsonb_build_object('case_id', v.id, 'actor_id', v_actor, 'devices_revoked', v_devices, 'sessions_closed', v_sessions));
  RETURN jsonb_build_object('ok', true, 'ticket_expires_at', v_now + interval '24 hours',
                            'devices_revoked', v_devices, 'sessions_closed', v_sessions, 'codes_revoked', v_codes);
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_execute(text, uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.auth_recovery_case_list(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, true);
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  UPDATE public.auth_recovery_cases SET state = 'expired', closed_at = now()
   WHERE state = 'waiting' AND expires_at <= now();
  RETURN jsonb_build_object('ok', true, 'now', now(), 'cases', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'user_id', c.user_id, 'email', u.email, 'name', coalesce(nullif(u.full_name, ''), u.name),
             'state', c.state, 'verification_method', c.verification_method, 'note', c.verification_note,
             'opened_at', c.opened_at, 'not_before', c.not_before, 'expires_at', c.expires_at,
             'closed_at', c.closed_at, 'close_reason', c.close_reason,
             'user_active_since_open', EXISTS (SELECT 1 FROM public.user_sessions s
                                                WHERE s.user_id = c.user_id AND s.mfa_method IS NOT NULL AND s.created_at > c.opened_at))
             ORDER BY (c.state = 'waiting') DESC, c.opened_at DESC)
      FROM (SELECT * FROM public.auth_recovery_cases ORDER BY opened_at DESC LIMIT 100) c
      JOIN public.users u ON u.id = c.user_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.auth_recovery_case_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_case_list(text) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 500 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
