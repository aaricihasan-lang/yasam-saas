-- AUTH-01 (AŞAMA 1) ek fixture: auth-fixture.sql'e prod'daki demo bayrağı + demo/owner kullanıcıları.
-- Yerel embedded-pg; prod'a temas YOK. (users.is_demo_account prod'da 20260622300000 ile mevcut.)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_demo_account boolean NOT NULL DEFAULT false;
INSERT INTO public.users (id, email, name, role, status, tenant_id, active, approval_status, password_hash, is_demo_account) VALUES
 ('00000000-0000-0000-0000-0000000000d1', 'demo@test.com', 'Demo', 'expert', 'active', '10000000-0000-0000-0000-0000000000d1', true, 'approved', extensions.crypt('demo-parola-1', extensions.gen_salt('bf', 4)), true),
 ('00000000-0000-0000-0000-0000000000b1', 'owner@test.com', 'Owner', 'admin', 'active', '10000000-0000-0000-0000-0000000000b1', true, 'approved', extensions.crypt('owner-parola-1', extensions.gen_salt('bf', 4)), false);
