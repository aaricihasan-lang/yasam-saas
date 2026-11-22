-- =============================================================================
-- 20280103000400_auth_email_otp_f2d.sql
--
-- GİRİŞ GÜVENLİĞİ F2-D — e-posta OTP (sağlayıcıdan bağımsız; ilk sağlayıcı Google Workspace / Gmail API).
-- BAĞIMLILIK: 000000 (F2-A) → 000100/000200 (F2-B) → 000300 (F2-C). EKLEYİCİ.
--
--   * auth_email_otps: 6 haneli kodun YALNIZ HMAC özeti (uygulama sunucusu AUTH_OTP_PEPPER ile hesaplar;
--     düz kod DB'ye/loga YAZILMAZ). Kod challenge'a (giriş) veya kullanıcıya (e-posta doğrulama) bağlı;
--     3 dk; en fazla 5 yanlış deneme (sonra kilit + giriş challenge'ı kalıcı red); tek kullanım; yeni kod
--     eskisini geçersiz kılar; yeniden gönderim 60 sn bekleme, challenge başına ≤3, kullanıcı başına saatte ≤6;
--     kullanıcı başına kayan 24 saatte toplam ≤10 yanlış deneme (sonra yeni kod verilmez).
--   * auth_email_deliveries: gönderim denetim kaydı — alıcı adresi YOK (yalnız özet), kod YOK, sağlayıcı
--     hata KODU (mesaj değil). Kayan 24 saat kota sayacı buradan.
--   * Gönderilemeyen kodla doğrulama YAPILAMAZ (gönderim sonucu kaydedilene kadar kod 'pending');
--     e-posta hatası MFA'yı atlatmaz.
--   * users.email_verified_at: e-posta kutusuna sahiplik kanıtı (başarılı OTP ile). Giriş OTP'si yalnız
--     doğrulanmış adrese gönderilir. auth_mfa_user_has_method: aktif cihaz VEYA doğrulanmış e-posta.
--   * Owner Bildirim Zili: 'eposta_uyari' (kota eşiği, kota doldu, OAuth / sağlayıcı hatası).
--
-- GÜVENLİK: SECURITY DEFINER + search_path=''; tablolar RLS açık, policy yok, yalnız postgres.
-- VERİ: mevcut satır değişmez (email_verified_at NULL başlar). Kimse zorunlu yapılmaz.
-- ROLLBACK (yalnız e-posta yöntemine bağlı MFA'lı kullanıcı YOKKEN): DROP FUNCTION auth_email_*;
--   auth_mfa_user_has_method → 000300 tanımı; zil CHECK'leri 000300 listesine.
-- =============================================================================

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 400;
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

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.auth_email_deliveries (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  purpose             text NOT NULL CHECK (purpose IN ('login', 'verify_email', 'owner_test')),
  challenge_id        uuid,
  provider            text NOT NULL CHECK (provider IN ('gmail', 'synthetic')),
  to_hash             text NOT NULL CHECK (to_hash ~ '^[0-9a-f]{64}$'),
  state               text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'sent', 'failed')),
  error_code          text CHECK (error_code IS NULL OR error_code ~ '^[a-z_]{2,40}$'),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  created_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_auth_email_deliveries_created ON public.auth_email_deliveries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_email_deliveries_user ON public.auth_email_deliveries (user_id, created_at DESC);
ALTER TABLE public.auth_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_email_deliveries FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.auth_email_otps (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN ('login', 'verify_email')),
  challenge_id uuid REFERENCES public.auth_mfa_challenges(id) ON DELETE CASCADE,
  code_hash    text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  delivery_id  bigint REFERENCES public.auth_email_deliveries(id) ON DELETE SET NULL,
  state        text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'used', 'superseded', 'locked', 'expired', 'failed')),
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  CONSTRAINT auth_email_otps_ttl_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CONSTRAINT auth_email_otps_purpose_chk CHECK ((purpose = 'login') = (challenge_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_auth_email_otps_scope ON public.auth_email_otps (user_id, purpose, challenge_id, created_at DESC);
ALTER TABLE public.auth_email_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_email_otps FROM PUBLIC, anon, authenticated, service_role;

-- Challenge red nedeni: OTP kilidi.
ALTER TABLE public.auth_mfa_challenges DROP CONSTRAINT IF EXISTS auth_mfa_challenges_match_chk;
ALTER TABLE public.auth_mfa_challenges ADD CONSTRAINT auth_mfa_challenges_match_chk
  CHECK ((match_code IS NULL OR match_code ~ '^[0-9]{2}$')
     AND (qr_nonce_hash IS NULL OR qr_nonce_hash ~ '^[0-9a-f]{64}$')
     AND (denied_reason IS NULL OR denied_reason IN ('user_denied', 'wrong_match', 'device_revoked', 'otp_locked')));

-- ── Owner Bildirim Zili: 'eposta_uyari' (tablo varsa; 000300 listeleri + yeni tip) ──
DO $$
BEGIN
  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_type_check;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_type_check
      CHECK (type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti','cihaz_eslesme','eposta_uyari']));
    ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_type;
    ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_type
      CHECK ((kind = 'info' AND type = ANY (ARRAY['deneme_basladi','deneme_bitti']))
          OR (kind = 'action' AND type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','cihaz_eslesme','eposta_uyari'])));
  END IF;
END $$;

-- Bildirim geçmişi tür filtresi: 'cihaz_eslesme' (F2-C) ve 'eposta_uyari' seçilebilir olsun (aksi halde
-- AN400 'gecersiz filtre'). Gövde 20280101000400 ile AYNI; yalnız izinli tür listesi genişledi. İmza ve
-- yetkiler değişmez (CREATE OR REPLACE GRANT'leri korur).
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
                    'cihaz_eslesme','eposta_uyari')
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

CREATE OR REPLACE FUNCTION public.auth_email_notify(p_reason text, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF to_regclass('public.admin_notifications') IS NULL THEN
    RETURN;
  END IF;
  -- Hedef = Owner: admin_notifications_reconcile hedefsiz (target_user_id NULL) açık kararları
  -- "kayit_silindi" diye kapattığından uyarı Owner'a bağlanır.
  SELECT u.id INTO v_owner FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE
   ORDER BY u.id LIMIT 1;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  -- Aynı anda TEK açık uyarı (tür+hedef kısmi UNIQUE; ek nedenler durum sayfasında görünür); gün+neden
  -- anahtarı kapatılmış uyarının aynı gün tekrar açılmasını önler. Payload'da adres / kod YOK.
  EXECUTE 'INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id, occurred_at, payload)
           VALUES ($1, ''action'', ''eposta_uyari'', $3, now(), $2) ON CONFLICT DO NOTHING'
    USING 'eposta_uyari:' || p_reason || ':' || to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD'),
          jsonb_build_object('reason', p_reason) || coalesce(p_detail, '{}'::jsonb), v_owner;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auth_email_notify: [%] %', SQLSTATE, SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.auth_email_notify(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ── Yöntem varlığı: aktif cihaz VEYA doğrulanmış e-posta ─────────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_user_has_method(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = p_user_id AND d.state = 'active')
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.email_verified_at IS NOT NULL
                   AND coalesce(btrim(u.email), '') <> '');
$$;
REVOKE ALL ON FUNCTION public.auth_mfa_user_has_method(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_user_has_method(uuid) TO service_role;

-- Kullanıcının kullanılabilir yöntem bilgisi (giriş ekranı için; adres maskesi uygulamada).
CREATE OR REPLACE FUNCTION public.auth_mfa_user_methods(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'has_device', EXISTS (SELECT 1 FROM public.auth_trusted_devices d WHERE d.user_id = p_user_id AND d.state = 'active'),
    'email_verified', coalesce((SELECT u.email_verified_at IS NOT NULL FROM public.users u WHERE u.id = p_user_id), false));
$$;
REVOKE ALL ON FUNCTION public.auth_mfa_user_methods(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) TO service_role;

-- ── Kod üretimi (rezervasyon) ────────────────────────────────────────────────
--   Kod uygulama sunucusunda üretilir ve e-postayla gönderilir; buraya yalnız HMAC özeti gelir.
--   Sonuç: { ok, otp_id, delivery_id, expires_at } | { ok:false, reason, retry_after? }
CREATE OR REPLACE FUNCTION public.auth_email_otp_issue(
  p_user_id       uuid,
  p_purpose       text,
  p_challenge_id  uuid,
  p_code_hash     text,
  p_to_hash       text,
  p_provider      text,
  p_daily_limit   integer,
  p_warn_at       integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   timestamptz := now();
  v_user  public.users%ROWTYPE;
  v_ch    public.auth_mfa_challenges%ROWTYPE;
  v_last  timestamptz;
  v_n     integer;
  v_24h   integer;
  v_del   bigint;
  v_otp   bigint;
BEGIN
  IF p_user_id IS NULL OR p_purpose NOT IN ('login', 'verify_email') OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_to_hash !~ '^[0-9a-f]{64}$' OR p_provider NOT IN ('gmail', 'synthetic') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-otp:' || p_user_id::text, 0));

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true OR coalesce(btrim(v_user.email), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  IF p_purpose = 'login' THEN
    SELECT * INTO v_ch FROM public.auth_mfa_challenges WHERE id = p_challenge_id FOR UPDATE;
    IF NOT FOUND OR v_ch.user_id <> p_user_id OR v_ch.state <> 'pending' OR v_ch.expires_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    -- Giriş kodu yalnız sahipliği kanıtlanmış adrese.
    IF v_user.email_verified_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'email_unverified');
    END IF;
  ELSIF p_challenge_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;

  -- Yeniden gönderim: son koddan ≥60 sn; challenge başına ≤3; kullanıcı başına saatte ≤6.
  SELECT max(created_at) INTO v_last FROM public.auth_email_otps
   WHERE user_id = p_user_id AND purpose = p_purpose AND challenge_id IS NOT DISTINCT FROM p_challenge_id;
  IF v_last IS NOT NULL AND v_last > v_now - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown',
                              'retry_after', ceil(extract(epoch FROM (v_last + interval '60 seconds' - v_now)))::int);
  END IF;
  IF p_purpose = 'login' THEN
    SELECT count(*) INTO v_n FROM public.auth_email_otps WHERE challenge_id = p_challenge_id;
    IF v_n >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
    END IF;
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_email_otps WHERE user_id = p_user_id AND created_at > v_now - interval '1 hour';
  IF v_n >= 6 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retry_after', 3600);
  END IF;
  -- Kaba kuvvet tavanı: kullanıcı başına kayan 24 saatte toplam ≤10 yanlış deneme (tüm kodlar). Aşılınca
  -- yeni kod YOK (QR yöntemi etkilenmez). 10 tahmin / 10^6 olasılık / gün.
  SELECT coalesce(sum(attempts), 0) INTO v_n FROM public.auth_email_otps
   WHERE user_id = p_user_id AND created_at > v_now - interval '24 hours';
  IF v_n >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retry_after', 3600);
  END IF;

  -- Sağlayıcı kotası (kayan 24 saat; rezerve + gönderilen). Kota dolarsa gönderim YOK (MFA atlanmaz).
  SELECT count(*) INTO v_24h FROM public.auth_email_deliveries
   WHERE created_at > v_now - interval '24 hours' AND state IN ('reserved', 'sent');
  IF p_daily_limit IS NOT NULL AND v_24h >= p_daily_limit THEN
    PERFORM public.auth_email_notify('kota_doldu', jsonb_build_object('son_24_saat', v_24h, 'sinir', p_daily_limit));
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exhausted');
  END IF;
  IF p_warn_at IS NOT NULL AND v_24h + 1 >= p_warn_at THEN
    PERFORM public.auth_email_notify('kota_esigi', jsonb_build_object('son_24_saat', v_24h + 1, 'esik', p_warn_at));
  END IF;

  -- Önceki aktif/bekleyen kodlar geçersiz.
  UPDATE public.auth_email_otps SET state = 'superseded'
   WHERE user_id = p_user_id AND purpose = p_purpose AND challenge_id IS NOT DISTINCT FROM p_challenge_id
     AND state IN ('pending', 'active');

  INSERT INTO public.auth_email_deliveries (user_id, purpose, challenge_id, provider, to_hash, state, created_at)
  VALUES (p_user_id, p_purpose, p_challenge_id, p_provider, p_to_hash, 'reserved', v_now)
  RETURNING id INTO v_del;
  INSERT INTO public.auth_email_otps (user_id, purpose, challenge_id, code_hash, delivery_id, state, created_at, expires_at)
  VALUES (p_user_id, p_purpose, p_challenge_id, p_code_hash, v_del, 'pending', v_now, v_now + interval '3 minutes')
  RETURNING id INTO v_otp;

  RETURN jsonb_build_object('ok', true, 'otp_id', v_otp, 'delivery_id', v_del, 'expires_at', v_now + interval '3 minutes');
END $$;
REVOKE ALL ON FUNCTION public.auth_email_otp_issue(uuid, text, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_otp_issue(uuid, text, uuid, text, text, text, integer, integer) TO service_role;

-- ── Gönderim sonucu ──────────────────────────────────────────────────────────
--   Başarılı → kod 'active' (doğrulanabilir). Başarısız → kod 'failed' (DOĞRULANAMAZ; MFA atlanmaz).
CREATE OR REPLACE FUNCTION public.auth_email_delivery_result(
  p_delivery_id bigint, p_ok boolean, p_error_code text, p_provider_message_id text
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_err text := CASE WHEN p_error_code ~ '^[a-z_]{2,40}$' THEN p_error_code ELSE 'unknown' END;
BEGIN
  UPDATE public.auth_email_deliveries
     SET state = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         error_code = CASE WHEN p_ok THEN NULL ELSE v_err END,
         provider_message_id = CASE WHEN p_ok THEN left(p_provider_message_id, 200) END,
         finished_at = now()
   WHERE id = p_delivery_id AND state = 'reserved';
  UPDATE public.auth_email_otps
     SET state = CASE WHEN p_ok THEN 'active' ELSE 'failed' END
   WHERE delivery_id = p_delivery_id AND state = 'pending';
  IF NOT p_ok AND v_err IN ('oauth_invalid_grant', 'oauth_error', 'quota', 'provider_down', 'not_configured') THEN
    PERFORM public.auth_email_notify(v_err, '{}'::jsonb);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.auth_email_delivery_result(bigint, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_delivery_result(bigint, boolean, text, text) TO service_role;

-- ── Doğrulama (atomik; tek kullanım; 5 yanlış → kilit + giriş challenge'ı red) ──
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
BEGIN
  IF p_user_id IS NULL OR p_purpose NOT IN ('login', 'verify_email') OR p_code_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
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

-- ── Owner: gönderim durumu (adres / kod YOK) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_email_status(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, false);
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'last_24h', (SELECT jsonb_build_object(
        'sent', count(*) FILTER (WHERE state = 'sent'),
        'failed', count(*) FILTER (WHERE state = 'failed'),
        'reserved', count(*) FILTER (WHERE state = 'reserved'))
      FROM public.auth_email_deliveries WHERE created_at > now() - interval '24 hours'),
    'last_failure', (SELECT jsonb_build_object('code', error_code, 'at', finished_at)
      FROM public.auth_email_deliveries WHERE state = 'failed' ORDER BY id DESC LIMIT 1),
    'last_success_at', (SELECT max(finished_at) FROM public.auth_email_deliveries WHERE state = 'sent'),
    'verified_users', (SELECT count(*) FROM public.users WHERE email_verified_at IS NOT NULL),
    'open_alerts', CASE WHEN to_regclass('public.admin_notifications') IS NULL THEN '[]'::jsonb ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object('reason', n.payload->>'reason', 'at', n.occurred_at) ORDER BY n.occurred_at DESC), '[]'::jsonb)
        FROM public.admin_notifications n
       WHERE n.type = 'eposta_uyari' AND n.kind = 'action' AND n.resolved_at IS NULL) END);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_status(text) TO service_role;

-- Owner: açık e-posta uyarılarını kapatır (sorun giderildikten sonra). Aynı gün aynı neden yeniden açılmaz
-- (event_key); farklı neden veya ertesi gün yeni uyarı düşer.
CREATE OR REPLACE FUNCTION public.auth_email_alerts_ack(p_actor_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, false);
  v_n integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    EXECUTE 'UPDATE public.admin_notifications SET resolved_at = now(), resolution = ''kapandi''
              WHERE type = ''eposta_uyari'' AND kind = ''action'' AND resolved_at IS NULL';
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'closed', v_n);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_alerts_ack(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_alerts_ack(text) TO service_role;

-- Owner test gönderimi kaydı (yalnız Owner'ın kendi adresine; kod yok).
CREATE OR REPLACE FUNCTION public.auth_email_owner_test_reserve(p_actor_token text, p_to_hash text, p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.auth_session_actor(p_actor_token, false);
  v_id bigint;
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF (SELECT count(*) FROM public.auth_email_deliveries WHERE purpose = 'owner_test' AND created_at > now() - interval '1 hour') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;
  INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state)
  VALUES (v_actor, 'owner_test', p_provider, p_to_hash, 'reserved') RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', v_id, 'actor_id', v_actor);
END $$;
REVOKE ALL ON FUNCTION public.auth_email_owner_test_reserve(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_owner_test_reserve(text, text, text) TO service_role;

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 400 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
