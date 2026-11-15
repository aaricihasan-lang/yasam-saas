-- =============================================================================
-- 20280103000200_auth_session_insert_lock_f2b.sql
--
-- GİRİŞ GÜVENLİĞİ F2-B — B/2: oturum yazım KİLİDİ (KISITLAYICI).
-- BAĞIMLILIK: 20280103000100_auth_mfa_core_f2b.sql + bu PR'ın uygulama kodu PRODUCTION'DA olmalı.
--
-- SIRA ZORUNLU: 000100 → (F2-B kodu deploy) → 000200. Bu migration ESKİ kod çalışırken uygulanırsa
--   admin web girişi (eski kodun doğrudan INSERT'i) 42501 ile REDDEDİLİR — atlatma değil kesinti
--   (fail-closed). Geri dönüş GRANT ile mümkündür ama MFA'lı kullanıcı varken YAPILMAMALI.
--
--   * service_role artık user_sessions'a doğrudan INSERT YAPAMAZ: oturumlar yalnız SECURITY DEFINER
--     fonksiyonlardan (create_session_v2, create_session_admin_web, auth_finalize_login) doğar.
--     UPDATE/SELECT/DELETE yetkileri DEĞİŞMEZ (çıkış, iptal, admin araçları çalışır).
--   * Kullanılmayan eski oturum/parola RPC'leri service_role'den alınır:
--       create_session_within_limits (uygulama kodu çağırmıyor; MFA'sız eski yol),
--       login_user (F2-A ile kod yedeği kaldırıldı; throttle'sız doğrulama).
--
-- VERİ: hiçbir satır değişmez. İDEMPOTENT: REVOKE tekrar güvenlidir.
-- ROLLBACK (yalnız MFA'lı kullanıcı YOKKEN ve Owner onayıyla):
--   GRANT INSERT ON public.user_sessions TO service_role;
--   GRANT EXECUTE ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.login_user(text,text) TO service_role;
-- =============================================================================

BEGIN;

REVOKE INSERT ON TABLE public.user_sessions FROM service_role, anon, authenticated, PUBLIC;

DO $$
BEGIN
  IF to_regprocedure('public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
  IF to_regprocedure('public.login_user(text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.login_user(text,text) FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $$;

COMMIT;
