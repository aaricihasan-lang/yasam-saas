-- =============================================================================
-- 20271003000100_admin_audit_session_actions.sql
--
-- OTURUM MODELİ v2 — admin_audit_log action CHECK süperseti (+5 action).
--   admin_web_login_pending      : admin ikinci/riskli web girişi onaya düştü
--   admin_web_login_approved     : owner bekleyen web girişini onayladı
--   admin_web_login_denied       : owner bekleyen web girişini reddetti
--   admin_mobile_login_rejected  : ikinci admin Android girişi reddedildi
--   own_session_terminated       : admin kendi oturumunu kapattı (kayıp cihaz vb.)
-- Mevcut 26 action AYNEN korunur (lib/admin/adminAudit.ts ADMIN_AUDIT_ACTIONS ile birebir).
-- Veri değişmez. İdempotent (DROP IF EXISTS + ADD). ROLLBACK: önceki CHECK
-- (20270129235900_admin_member_phase1_hardening.sql) yeniden uygulanır — yeni action'lı satır
-- varsa geri alma öncesi o satırlar korunmalıdır (append-only; silinmez).
-- =============================================================================

BEGIN;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_action_chk;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created',
  'user_activated',
  'user_deactivated',
  'user_approved',
  'user_rejected',
  'password_changed_by_admin',
  'all_sessions_terminated',
  'single_session_terminated',
  'desktop_limit_changed',
  'mobile_limit_changed',
  'tablet_limit_changed',
  'total_session_limit_changed',
  'module_enabled',
  'module_disabled',
  'payment_status_changed',
  'role_changed',
  'workspace_viewed',
  'user_deleted',
  'user_archived',
  'main_admin_critical_action',
  'library_transfer_completed',
  'library_transfer_failed',
  'library_transfer_retried',
  'user_profile_updated',
  'license_settings_changed',
  'security_exempt_changed',
  'admin_web_login_pending',
  'admin_web_login_approved',
  'admin_web_login_denied',
  'admin_mobile_login_rejected',
  'own_session_terminated'
));

COMMIT;
