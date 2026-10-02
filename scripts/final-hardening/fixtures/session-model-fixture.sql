-- OTURUM MODELİ v2 fixture (yerel embedded-pg; prod'a temas YOK).
-- Prod şemasının minimal kopyası: users (+limit/güvenlik kolonları), user_sessions, admin_audit_log.

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text, name text, full_name text, role text, status text, tenant_id uuid,
  active boolean DEFAULT true, approval_status text,
  password text, password_hash text,
  allowed_locations integer DEFAULT 2,
  security_exempt boolean NOT NULL DEFAULT false,
  security_mode text DEFAULT 'normal',
  license_type text DEFAULT 'single',
  allowed_active_sessions integer DEFAULT -1,
  allowed_desktop_sessions integer DEFAULT -1,
  allowed_mobile_sessions integer DEFAULT -1,
  allowed_tablet_sessions integer DEFAULT -1,
  allowed_unknown_sessions integer DEFAULT -1
);

CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address text, country text, city text, user_agent text, device_fingerprint text,
  session_token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz, end_reason text, platform text, client_channel text
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid NOT NULL, actor_is_main_admin boolean NOT NULL DEFAULT false,
  target_user_id uuid, action text NOT NULL,
  old_value jsonb, new_value jsonb, result jsonb, context jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_action_chk CHECK (action IN ('user_created'))
);

-- 1 admin, uzmanlar: sınırsız / mobil=1 / exempt+1-0-0-0-0 (test istisnası adayı) / exempt sınırlı / pasif
INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, security_exempt,
  allowed_active_sessions, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions) VALUES
 ('00000000-0000-0000-0000-00000000a001', 'admin@test.local',  'admin',  '10000000-0000-0000-0000-000000000001', true, 'approved', true, -1, -1, -1, -1, -1),
 ('00000000-0000-0000-0000-00000000e001', 'free@test.local',   'expert', '10000000-0000-0000-0000-000000000002', true, 'approved', false, -1, -1, -1, -1, -1),
 ('00000000-0000-0000-0000-00000000e002', 'mob1@test.local',   'expert', '10000000-0000-0000-0000-000000000003', true, 'approved', false, 3, 2, 1, 0, 0),
 ('00000000-0000-0000-0000-00000000e003', 'exc@test.local',    'expert', '10000000-0000-0000-0000-000000000004', true, 'approved', true, 1, 0, 0, 0, 0),
 ('00000000-0000-0000-0000-00000000e004', 'exlim@test.local',  'expert', '10000000-0000-0000-0000-000000000005', true, 'approved', true, 1, 0, 0, 0, 0),
 ('00000000-0000-0000-0000-00000000e005', 'mob2@test.local',   'expert', '10000000-0000-0000-0000-000000000006', true, 'approved', false, 4, 2, 2, 0, 0),
 ('00000000-0000-0000-0000-00000000e006', 'off@test.local',    'expert', '10000000-0000-0000-0000-000000000007', false, 'approved', false, -1, -1, -1, -1, -1);

-- Mevcut (eski şema) oturumlar: kolonlar eklendiğinde session_state='active' varsayılanı almalı.
INSERT INTO public.user_sessions (user_id, session_token, is_active, created_at, last_seen_at, platform, client_channel) VALUES
 ('00000000-0000-0000-0000-00000000e001', 'legacy-web-1', true, now() - interval '1 day', now() - interval '1 hour', 'desktop', NULL),
 ('00000000-0000-0000-0000-00000000e003', 'legacy-exc-1', true, now() - interval '2 days', now() - interval '2 days', 'desktop', 'desktop_web'),
 ('00000000-0000-0000-0000-00000000e003', 'legacy-exc-2', true, now() - interval '3 days', now() - interval '3 days', 'desktop', NULL);
