-- ═══════════════════════════════════════════════════════════════════════════
-- USAGE360 NİHAİ KAPANIŞ — IP HARDENING (owner kararı)
--
-- user_sessions.ip_address ve security_events.ip_address ham IP'leri süresiz
-- saklanmaz: 90 günden ESKİ satırlarda ip_address → NULL. Satırın kendisi ve
-- güvenlik için gereken diğer alanlar (ülke/şehir, cihaz, olay türü, zaman) KALIR.
--
-- Güvenlik modeli etkisi: risk motoru ülke/şehir kullanır; login throttle ayrı
-- tabloda (auth_login_throttle, pepper'lı hash) tutulur → ip_address okuyan
-- güvenlik kararı YOK (kod taraması). Admin UI zaten maskeli IP alır.
--
-- ADDITIVE: yalnız bir fonksiyon eklenir. DROP/TRUNCATE/şema değişikliği YOK.
-- Süre SABİT 90 gün (parametre yok) → yanlış argümanla yeni IP'ler topluca
-- silinemez. Varsayılan dry-run (yalnız sayım).
--
-- Rollback: DROP FUNCTION public.security_ip_retention_purge(boolean);
-- (NULL'lanan eski IP'ler geri gelmez — bu kasıtlıdır.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.security_ip_retention_purge(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cut      timestamptz := now() - interval '90 days';
  v_sessions bigint;
  v_events   bigint;
BEGIN
  IF coalesce(p_dry_run, true) THEN
    SELECT count(*) INTO v_sessions FROM public.user_sessions
     WHERE ip_address IS NOT NULL AND created_at < v_cut;
    SELECT count(*) INTO v_events FROM public.security_events
     WHERE ip_address IS NOT NULL AND created_at < v_cut;
  ELSE
    UPDATE public.user_sessions SET ip_address = NULL
     WHERE ip_address IS NOT NULL AND created_at < v_cut;
    GET DIAGNOSTICS v_sessions = ROW_COUNT;
    UPDATE public.security_events SET ip_address = NULL
     WHERE ip_address IS NOT NULL AND created_at < v_cut;
    GET DIAGNOSTICS v_events = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object(
    'dry_run', coalesce(p_dry_run, true), 'retention_days', 90,
    'sessions', v_sessions, 'security_events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.security_ip_retention_purge(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_ip_retention_purge(boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
