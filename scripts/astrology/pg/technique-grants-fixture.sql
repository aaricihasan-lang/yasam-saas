-- Gökyüzü Atlası teknik izinleri (20271230000000) — prod şemasının minimal kopyası: users + admin_audit_log.
-- admin_audit_action_chk prod listesiyle AYNI (20271006000000; prod salt-okunur kontrol 2026-11-03) → migration yeni eylem eklemez.
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  role text, active boolean, is_super_admin boolean NOT NULL DEFAULT false, is_demo_account boolean NOT NULL DEFAULT false,
  tenant_id uuid, module_permissions jsonb
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid NOT NULL, actor_is_main_admin boolean NOT NULL DEFAULT false,
  target_user_id uuid, action text NOT NULL,
  old_value jsonb, new_value jsonb, result jsonb, context jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_action_chk CHECK (action IN (
    'user_created','user_activated','user_deactivated','user_approved','user_rejected','password_changed_by_admin',
    'all_sessions_terminated','single_session_terminated','desktop_limit_changed','mobile_limit_changed','tablet_limit_changed',
    'total_session_limit_changed','module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
    'user_deleted','user_archived','main_admin_critical_action','library_transfer_completed','library_transfer_failed',
    'library_transfer_retried','user_profile_updated','license_settings_changed','security_exempt_changed',
    'admin_web_login_pending','admin_web_login_approved','admin_web_login_denied','admin_mobile_login_rejected',
    'own_session_terminated','pricing_phase_changed'))
);
INSERT INTO public.users (id, role, active, is_super_admin, tenant_id, module_permissions) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin',  true,  true,  'f0000000-0000-4000-8000-000000000001', '{}'),
  ('a0000000-0000-4000-8000-000000000002', 'admin',  false, false, 'f0000000-0000-4000-8000-000000000001', '{}'),
  ('a0000000-0000-4000-8000-000000000003', 'admin',  true,  false, 'f0000000-0000-4000-8000-000000000001', '{}'),
  -- E1: Astroloji AÇIK (mevcut ücretli uzman) → backfill "all"
  ('e0000000-0000-4000-8000-000000000001', 'expert', true,  false, 'f0000000-0000-4000-8000-000000000011', '{"astrology": true, "astrology_provider_interp": true, "numerology": true}'),
  -- E2: Astroloji KAPALI (false) → backfill YOK
  ('e0000000-0000-4000-8000-000000000002', 'expert', true,  false, 'f0000000-0000-4000-8000-000000000012', '{"astrology": false, "numerology": true, "stones": true}'),
  -- E3: astrology anahtarı hiç yok → backfill YOK
  ('e0000000-0000-4000-8000-000000000003', 'expert', true,  false, 'f0000000-0000-4000-8000-000000000013', '{"clients": true}'),
  -- E4: "Expert" büyük harf + string "true" (fail-closed: boolean true değil) → backfill YOK
  ('e0000000-0000-4000-8000-000000000004', 'Expert', true,  false, 'f0000000-0000-4000-8000-000000000014', '{"astrology": "true"}'),
  -- E5: Astroloji AÇIK, rol büyük harf → backfill "all"
  ('e0000000-0000-4000-8000-000000000005', 'EXPERT', true,  false, 'f0000000-0000-4000-8000-000000000015', '{"astrology": true}'),
  -- A4: admin + astrology true → backfill YOK (yalnız uzman)
  ('a0000000-0000-4000-8000-000000000004', 'admin',  true,  false, 'f0000000-0000-4000-8000-000000000001', '{"astrology": true}'),
  -- E6: module_permissions NULL
  ('e0000000-0000-4000-8000-000000000006', 'expert', true,  false, 'f0000000-0000-4000-8000-000000000016', NULL);
