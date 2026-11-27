-- =============================================================================
-- GİRİŞ GÜVENLİĞİ · F4 — MFA PİLOTU KİLİTLENME GÜVENLİĞİ (TASLAK; ayrı Owner onayı olmadan UYGULANMAZ)
-- =============================================================================
-- Sorun (Owner, 27.11.2026):
--   Risk A — kurtarma kodları yalnız MFA'lı oturumda üretilebiliyordu (auth_recovery_codes_generate → auth_session_actor(t, true)).
--            Zorunluluk açıldıktan sonra, ilk başarılı e-posta kodu girişine kadar e-posta kesilirse hesap kilitlenir.
--   Acil   — MFA'sız Owner başkasının zorunluluğunu panelden kaldıramaz (F2-G: taze MFA + işleme bağlı kanıt). Acil geri dönüş
--            yalnız elle SQL'di (SET LOCAL yasam.mfa_policy + UPDATE): hata yapmaya açık, denetim izi yok.
--
-- 1) auth_recovery_codes_setup(p_actor_token, p_code_hashes, p_otp_hash) — MFA ÖNCESİ kurtarma kodu kurulumu.
--    Yalnız zorunluluğu HENÜZ AÇILMAMIŞ, e-postası doğrulanmış, etkin, ONAYLI (approval_status='approved'), arşivde olmayan,
--    "Pasif" (access_restricted_at) olmayan, demo olmayan admin / uzman hesabında VE kontrollü MFA test listesinde ETKİN kaydı
--    olan (auth_mfa_is_test_account) hesapta. Uygulama katmanı aynı koşulları ayrıca denetler; bu fonksiyon API atlanıp doğrudan
--    (service_role) çağrılsa da AYNI kuralları uygular. Kapsam (test listesi) koşulu pilot dönemine özgüdür: MFA kapsamı test
--    listesinin dışına genişletilirse bu fonksiyon AYRI bir migration ile güncellenmelidir (o zamana kadar fail-closed). MFA'SIZ oturum
--    yeterli AMA kayıtlı adrese gönderilen tek kullanımlık kod (posta kutusu kanıtı) ŞART: yalnız parolayı bilen biri kod
--    ÜRETEMEZ (yoksa zorunluluk açıldıktan sonra parola + önceden hazırlanmış kodla MFA atlatılırdı).
--    Kod mevcut auth_email_otp_verify ile (purpose='verify_email', ayrı HMAC kapsamı uygulamada) aynı işlemde TÜKETİLİR; 3 dk,
--    5 yanlışta kilit, 24 sa yanlış tavanı aynen. Normal üretimle AYNI kurallar: 10 farklı özet, 24 sa'te en çok 3 üretim,
--    öncekiler iptal, auth_recovery_events 'codes_generated' (detail.setup=true) + security_events. Zorunluluk AÇIKSA reddedilir
--    (o durumda normal MFA'lı yol: auth_recovery_codes_generate).
-- 2) auth_mfa_emergency_disable(p_user_id, p_reason) — YALNIZ SQL konsolu (service_role / anon / authenticated KAPALI):
--    tek hesabın zorunluluğunu kaldırır; gerekçe 10–500 karakter; DİĞER hesapların (id, mfa_required) özeti işlem öncesi ve
--    sonrası karşılaştırılır, farklıysa İŞLEM GERİ ALINIR; security_events 'mfa_emergency_disabled' (critical) yazılır; sonuç
--    önce / sonra sayılarını döndürür (canlıda kanıt). Zorunluluğu AÇMAZ; yöntem / kod / oturum değiştirmez.
--
-- 3) auth_mfa_test_account_lapsed(p_user_id) — Risk B: kontrollü test listesindeki kaydı SÜRESİ DOLMUŞ (ve etkin kaydı olmayan)
--    hesap mı? Uygulama, zorunluluğu açık böyle bir hesapta asıl yöntemi korur (aksi hâlde 14 gün sonra kilitlenme). Listeye HİÇ
--    alınmamış hesaplar ve Owner'ın kaydı SİLDİĞİ hesaplar için false (yanlış kapsam ayarında yöntem açılmaz — #833 kuralı korunur).
--
-- DOKUNULMAYAN: mevcut fonksiyonların gövdeleri, tablolar, kısıtlar, mevcut satırlar (DML YOK).
-- ÖN KOŞUL: F2 zinciri (001300) — auth_session_actor, auth_email_otp_verify, auth_recovery_log, users.mfa_required + koruma.
-- DEPLOY SIRASI: bu migration → kod (kod, fonksiyon yoksa kurulum seçeneğini kapalı gösterir; fail-closed).
-- GERİ ALMA: DROP FUNCTION public.auth_recovery_codes_setup(text, text[], text);
--            DROP FUNCTION public.auth_mfa_emergency_disable(uuid, text);
--            DROP FUNCTION public.auth_mfa_test_account_lapsed(uuid);   (veri değişmez)
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.auth_session_actor(text, boolean)') IS NULL
     OR to_regprocedure('public.auth_email_otp_verify(uuid, text, uuid, text)') IS NULL
     OR to_regprocedure('public.auth_recovery_log(uuid, uuid, text, jsonb)') IS NULL
     OR to_regprocedure('public.users_mfa_policy_guard()') IS NULL
     OR to_regprocedure('public.auth_mfa_is_test_account(uuid)') IS NULL THEN
    RAISE EXCEPTION 'F4 ön koşul: F2 giriş güvenliği zinciri (001300) eksik';
  END IF;
  -- Hesap durumu kolonları (arşiv 20280101000600, pasif 20280126000000, onay): yoksa fonksiyon bu kuralları uygulayamaz → DUR.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name IN ('archived_at', 'access_restricted_at', 'approval_status')) <> 3 THEN
    RAISE EXCEPTION 'F4 ön koşul: users.archived_at / access_restricted_at / approval_status kolonları eksik';
  END IF;
END $pre$;

-- ── 1) MFA öncesi kurtarma kodu kurulumu ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_recovery_codes_setup(p_actor_token text, p_code_hashes text[], p_otp_hash text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $f4$
DECLARE
  v_actor   uuid := public.auth_session_actor(p_actor_token, false);
  v_user    public.users%ROWTYPE;
  v_n       integer;
  v_revoked integer;
  v_batch   uuid := gen_random_uuid();
  v_otp     jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  IF p_code_hashes IS NULL OR cardinality(p_code_hashes) <> 10
     OR (SELECT count(DISTINCT h) FROM unnest(p_code_hashes) h WHERE h ~ '^[0-9a-f]{64}$') <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  -- Normal üretimle AYNI kilit: aynı kullanıcı için eşzamanlı üretimler sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtextextended('recovery:' || v_actor::text, 0));
  SELECT * INTO v_user FROM public.users WHERE id = v_actor FOR UPDATE;
  IF NOT FOUND OR v_user.active IS DISTINCT FROM true OR v_user.is_demo_account IS TRUE
     OR lower(btrim(coalesce(v_user.role::text, ''))) NOT IN ('admin', 'expert') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  -- Hesap durumu: arşiv / "Pasif" (giriş açık, modüller kilitli) / onaysız hesap kurulum YAPAMAZ.
  IF v_user.archived_at IS NOT NULL OR v_user.access_restricted_at IS NOT NULL
     OR lower(btrim(coalesce(v_user.approval_status::text, ''))) <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'account_state');
  END IF;
  -- Kapsam: yalnız Owner'ın kontrollü MFA test listesine ETKİN olarak aldığı hesap (süresi dolmuş / silinmiş kayıt → kapalı).
  IF NOT public.auth_mfa_is_test_account(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_in_scope');
  END IF;
  IF v_user.mfa_required IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'mfa_session_required');
  END IF;
  IF v_user.email_verified_at IS NULL OR coalesce(btrim(v_user.email), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'email_unverified');
  END IF;
  SELECT count(*) INTO v_n FROM public.auth_recovery_events
   WHERE subject_user_id = v_actor AND event = 'codes_generated' AND created_at > now() - interval '24 hours';
  IF v_n >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 3600);
  END IF;

  -- Posta kutusu kanıtı: kayıtlı adrese giden tek kullanımlık kod BU işlemde tüketilir (yanlış deneme sayılır).
  v_otp := public.auth_email_otp_verify(v_actor, 'verify_email', NULL, p_otp_hash);
  IF coalesce((v_otp->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'otp_' || coalesce(v_otp->>'reason', 'invalid'),
                              'attempts_left', v_otp->'attempts_left');
  END IF;

  UPDATE public.auth_recovery_codes
     SET state = 'revoked', revoked_at = now(), revoke_reason = 'regenerated'
   WHERE user_id = v_actor AND kind = 'user' AND state = 'active';
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
  SELECT v_actor, 'user', v_batch, h FROM unnest(p_code_hashes) h;

  PERFORM public.auth_recovery_log(v_actor, v_actor, 'codes_generated',
    jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked, 'setup', true));
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (v_actor, 'recovery_codes_generated', 'high', 'Kurtarma kodları MFA öncesi kurulumda oluşturuldu (e-posta kodu ile)',
          jsonb_build_object('batch_id', v_batch, 'revoked', v_revoked, 'setup', true));
  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'count', 10, 'revoked', v_revoked);
END $f4$;
REVOKE ALL ON FUNCTION public.auth_recovery_codes_setup(text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_recovery_codes_setup(text, text[], text) TO service_role;

-- ── 2) Denetimli acil MFA kaldırma (YALNIZ SQL konsolu) ──────────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_emergency_disable(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $f4$
DECLARE
  v_reason        text := btrim(coalesce(p_reason, ''));
  v_req           boolean;
  v_total_before  integer;
  v_total_after   integer;
  v_others_before text;
  v_others_after  text;
BEGIN
  IF p_user_id IS NULL OR length(v_reason) < 10 OR length(v_reason) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request', 'hint', 'gerekçe 10–500 karakter');
  END IF;
  SELECT mfa_required INTO v_req FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_req IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;
  SELECT count(*) FILTER (WHERE mfa_required),
         md5(coalesce(string_agg(id::text || ':' || mfa_required::text, ',' ORDER BY id) FILTER (WHERE id <> p_user_id), ''))
    INTO v_total_before, v_others_before FROM public.users;

  PERFORM set_config('yasam.mfa_policy', 'on', true);
  UPDATE public.users SET mfa_required = false, mfa_required_at = NULL WHERE id = p_user_id;
  PERFORM set_config('yasam.mfa_policy', 'off', true);

  SELECT count(*) FILTER (WHERE mfa_required),
         md5(coalesce(string_agg(id::text || ':' || mfa_required::text, ',' ORDER BY id) FILTER (WHERE id <> p_user_id), ''))
    INTO v_total_after, v_others_after FROM public.users;
  IF v_others_after IS DISTINCT FROM v_others_before OR v_total_after <> v_total_before - 1 THEN
    RAISE EXCEPTION 'auth_mfa_emergency_disable: başka hesapların MFA durumu değişti — işlem geri alındı'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user_id, 'mfa_emergency_disabled', 'critical', 'MFA zorunluluğu SQL konsolundan acil olarak kaldırıldı',
          jsonb_build_object('reason', v_reason, 'mfa_required_before', v_total_before, 'mfa_required_after', v_total_after,
                             'executed_by', session_user));
  RETURN jsonb_build_object('ok', true, 'changed', true, 'mfa_required_before', v_total_before,
                            'mfa_required_after', v_total_after, 'others_unchanged', true);
END $f4$;
REVOKE ALL ON FUNCTION public.auth_mfa_emergency_disable(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3) Test listesi kaydı süresi dolmuş mu (Risk B) ─────────────────────────
CREATE OR REPLACE FUNCTION public.auth_mfa_test_account_lapsed(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $f4$
  SELECT EXISTS (SELECT 1 FROM public.auth_mfa_test_accounts t WHERE t.user_id = p_user_id AND t.expires_at <= now())
     AND NOT EXISTS (SELECT 1 FROM public.auth_mfa_test_accounts t WHERE t.user_id = p_user_id AND t.expires_at > now());
$f4$;
REVOKE ALL ON FUNCTION public.auth_mfa_test_account_lapsed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_mfa_test_account_lapsed(uuid) TO service_role;

COMMIT;
