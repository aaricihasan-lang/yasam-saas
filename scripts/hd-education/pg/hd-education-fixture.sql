-- HD Eğitim Kataloğu — migration test fixture (yalnız yerel embedded-postgres; SENTETİK kullanıcılar; prod'a temas YOK).
-- Prod users / tenants / admin_audit_log kolonlarının test için gereken alt kümesi.
CREATE TABLE IF NOT EXISTS public.tenants (id uuid PRIMARY KEY, name text);
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY, email text, role text, active boolean DEFAULT false, approval_status text DEFAULT 'pending',
  module_permissions jsonb DEFAULT '{}'::jsonb, admin_level text, tenant_id uuid,
  is_super_admin boolean NOT NULL DEFAULT false, is_demo_account boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_admin_id uuid, target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Supabase varsayılanı gibi: yeni tablolar anon/authenticated'a açık doğar (migration kapatmalı).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

INSERT INTO public.tenants (id, name) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'ZZ_EDU_T1'), ('a0000000-0000-4000-8000-000000000002', 'ZZ_EDU_T2')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, role, active, approval_status, module_permissions, admin_level, tenant_id, is_super_admin, is_demo_account) VALUES
  -- owner
  ('b0000000-0000-4000-8000-000000000001', 'zz.owner@example.test',  'admin',  true,  'approved', '{}',                       'owner', 'a0000000-0000-4000-8000-000000000001', true,  false),
  -- admin (owner değil) — admin_level 'owner' YANILTICI
  ('b0000000-0000-4000-8000-000000000002', 'zz.admin@example.test',  'admin',  true,  'approved', '{}',                       'owner', 'a0000000-0000-4000-8000-000000000001', false, false),
  -- uygun uzman A / B
  ('b0000000-0000-4000-8000-000000000003', 'zz.ea@example.test',     'expert', true,  'approved', '{"human_design": true}',   NULL,    'a0000000-0000-4000-8000-000000000001', false, false),
  ('b0000000-0000-4000-8000-000000000004', 'zz.eb@example.test',     'expert', true,  'approved', '{"human_design": true}',   NULL,    'a0000000-0000-4000-8000-000000000002', false, false),
  -- HD'siz uzman, demo uzman, pasif uzman
  ('b0000000-0000-4000-8000-000000000005', 'zz.nohd@example.test',   'expert', true,  'approved', '{"human_design": false}',  NULL,    'a0000000-0000-4000-8000-000000000001', false, false),
  ('b0000000-0000-4000-8000-000000000006', 'zz.demo@example.test',   'expert', true,  'approved', '{"human_design": true}',   NULL,    'a0000000-0000-4000-8000-000000000001', false, true),
  ('b0000000-0000-4000-8000-000000000007', 'zz.pasif@example.test',  'expert', false, 'approved', '{"human_design": true}',   NULL,    'a0000000-0000-4000-8000-000000000002', false, false)
ON CONFLICT (id) DO NOTHING;
