-- GİRİŞ GÜVENLİĞİ F2-A fixture eki (yerel embedded-pg; prod'a temas YOK).
-- session-model-fixture.sql'den SONRA uygulanır. Prod şemasındaki kalıcı Owner işaretini
-- (users.is_super_admin, 20260913000000) ve sınama için ek hesapları ekler.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Owner = mevcut fixture admin'i (a001). Ek: Owner olmayan admin, bayrağı hatalı uzman, pasif Owner adayı.
UPDATE public.users SET is_super_admin = true WHERE id = '00000000-0000-0000-0000-00000000a001';

INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, security_exempt, is_super_admin) VALUES
 ('00000000-0000-0000-0000-00000000a002', 'admin2@test.local', 'admin',  '10000000-0000-0000-0000-000000000011', true,  'approved', false, false),
 ('00000000-0000-0000-0000-00000000e0f1', 'sa-exp@test.local', 'expert', '10000000-0000-0000-0000-000000000012', true,  'approved', false, true),
 ('00000000-0000-0000-0000-00000000a003', 'adminoff@test.local','admin', '10000000-0000-0000-0000-000000000013', false, 'approved', false, true),
 ('00000000-0000-0000-0000-00000000e0f2', 'f2a-exp@test.local','expert', '10000000-0000-0000-0000-000000000014', true,  'approved', false, false);
