-- 20280130000500_auth_owner_access_reset.sql — modül: giris-guvenligi
-- Numara merkezi defterden ayrıldı (npm run migration:numara -- yeni). Dosya adını / sürümü ELLE DEĞİŞTİRMEYİN.
-- SQL bitince commit edin ve PR'a bağlayın: npm run migration:numara -- bagla --surum 20280130000500 --pr <PR no>
-- (SQL her değiştiğinde commit + bagla tekrarlanır). Production'a yalnız uygulama kapısıyla (uygula-prod.mjs) uygulanır.
-- onkosul: to_regprocedure('public.auth_step_up_lock(text, text, uuid)') IS NOT NULL AND to_regprocedure('public.auth_device_revoke_internal(uuid, uuid, text, text)') IS NOT NULL
-- =============================================================================
-- GİRİŞ GÜVENLİĞİ — OWNER DESTEKLİ GİRİŞ ERİŞİMİ SIFIRLAMA (Owner kararı 28.11.2026; kurtarma kodu zorunluluğunun yerine)
-- =============================================================================
-- Kullanıcı bütün giriş yöntemlerine (e-posta kodu, Android onayı) erişimini kaybederse Owner kişiyi sistem DIŞINDA teyit eder
-- ve Üye Yönetimi panelinden YALNIZ o kişinin giriş erişimini sıfırlar:
--   • MFA zorunluluğu kalkar; güvenilir cihazlar (bekleyen dahil) iptal; bekleyen telefon değişimi iptal;
--   • açık giriş istekleri reddedilir; BÜTÜN oturumları kapanır; kullanılmamış kurtarma kodları ve e-posta kodları geçersiz.
--   • Kullanıcı verisi (danışan, not, analiz, rapor, arşiv …) DEĞİŞMEZ / SİLİNMEZ; parola ve e-posta adresi DEĞİŞMEZ
--     (gerekirse mevcut Owner işlevleriyle ayrıca: şifre sıfırlama; adres değişikliği → doğrulama DB tetikleyicisiyle düşer).
-- Yetki: yalnız Owner oturumu; kendi hesabı ve Owner hesabı hedeflenemez; gerekçe 10–500 karakter. Uygulama katmanı Owner
-- parolasını işlemden hemen önce yeniden doğrular (kilit / oran sınırlı). MFA KULLANAN Owner'da ek olarak mevcut F2-G kuralı:
-- son 30 dk içinde ikinci doğrulamalı oturum + hedefe bağlı tek kullanımlık işlem kanıtı ('mfa_disable'). Çalınmış sıradan bir
-- uzman oturumu ya da yalnız Owner çerezi (parolasız) bu işlemi yapamaz.
-- Denetim: security_events 'owner_access_reset' (critical; Owner kimliği, gerekçe, sayılar) — aynı işlemde.
-- DOKUNULMAYAN: mevcut fonksiyonlar, tablolar, kısıtlar (DML yalnız işlem anında hedef kullanıcının kendi giriş kayıtlarında).
-- GERİ ALMA: DROP FUNCTION public.auth_owner_access_reset(text, uuid, text);   (veri değişmez)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_owner_access_reset(p_actor_token text, p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_actor    uuid := public.auth_session_actor(p_actor_token, false);
  v_now      timestamptz := now();
  v_target   public.users%ROWTYPE;
  v_owner_mfa boolean;
  v_proof    uuid;
  v_dev      record;
  v_devices  integer := 0;
  v_sessions integer := 0;
  v_codes    integer := 0;
  v_was_req  boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.auth_is_owner_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR length(v_reason) < 10 OR length(v_reason) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;
  IF p_user_id = v_actor OR public.auth_is_owner_admin(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_forbidden');
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- MFA kullanan Owner: F2-G kuralı korunur (taze MFA + hedefe bağlı işlem kanıtı). MFA'sız Owner: parola (uygulama) yeterli.
  SELECT (u.mfa_required IS TRUE) OR EXISTS (SELECT 1 FROM public.user_sessions s
                                              WHERE s.session_token = p_actor_token AND s.mfa_method IS NOT NULL)
    INTO v_owner_mfa FROM public.users u WHERE u.id = v_actor;
  IF v_owner_mfa THEN
    IF public.auth_session_fresh_mfa(p_actor_token, 30) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'fresh_mfa_required');
    END IF;
    v_proof := public.auth_step_up_lock(p_actor_token, 'mfa_disable', p_user_id);
    IF v_proof IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'step_up_required', 'action', 'mfa_disable', 'target', p_user_id);
    END IF;
  END IF;

  v_was_req := v_target.mfa_required IS TRUE;

  -- 1) Güvenilir cihazlar (bekleyen dahil) iptal; bekleyen telefon değişimi iptal.
  FOR v_dev IN SELECT id FROM public.auth_trusted_devices
                WHERE user_id = p_user_id AND state IN ('pending_owner', 'owner_approved', 'active') LOOP
    v_devices := v_devices + public.auth_device_revoke_internal(v_dev.id, v_actor, 'Owner destekli giriş erişimi sıfırlama', 'hesap_kurtarma');
  END LOOP;
  UPDATE public.auth_device_replacements SET state = 'cancelled', closed_at = v_now WHERE user_id = p_user_id AND state = 'waiting';
  -- 2) Açık giriş istekleri red, bütün oturumlar kapalı.
  UPDATE public.auth_mfa_challenges SET state = 'denied', denied_reason = 'account_recovery'
   WHERE user_id = p_user_id AND state IN ('pending', 'verified');
  UPDATE public.user_sessions SET is_active = false, ended_at = v_now, end_reason = 'owner_access_reset'
   WHERE user_id = p_user_id AND is_active = true;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  -- 3) Kullanılmamış kurtarma kodları / biletler ve bekleyen e-posta kodları geçersiz.
  UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = v_now, revoke_reason = 'owner_access_reset'
   WHERE user_id = p_user_id AND state = 'active';
  GET DIAGNOSTICS v_codes = ROW_COUNT;
  UPDATE public.auth_email_otps SET state = 'superseded' WHERE user_id = p_user_id AND state IN ('pending', 'active');
  -- 4) MFA zorunluluğu kalkar (koruma tetikleyicisi yalnız bu işlem içinde açılır).
  IF v_was_req THEN
    PERFORM set_config('yasam.mfa_policy', 'on', true);
    UPDATE public.users SET mfa_required = false, mfa_required_at = NULL WHERE id = p_user_id;
    PERFORM set_config('yasam.mfa_policy', 'off', true);
  END IF;

  IF v_proof IS NOT NULL THEN
    PERFORM public.auth_step_up_consume(v_proof);
  END IF;
  INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
  VALUES (p_user_id, 'owner_access_reset', 'critical',
          'Owner destekli giriş erişimi sıfırlama: MFA zorunluluğu kaldırıldı, cihazlar iptal edildi, oturumlar kapatıldı',
          jsonb_build_object('actor_id', v_actor, 'reason', v_reason, 'mfa_required_before', v_was_req,
                             'devices_revoked', v_devices, 'sessions_closed', v_sessions, 'codes_revoked', v_codes,
                             'owner_step_up', v_proof IS NOT NULL));
  RETURN jsonb_build_object('ok', true, 'mfa_required_before', v_was_req, 'devices_revoked', v_devices,
                            'sessions_closed', v_sessions, 'codes_revoked', v_codes);
END $f$;
REVOKE ALL ON FUNCTION public.auth_owner_access_reset(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owner_access_reset(text, uuid, text) TO service_role;

COMMIT;
