-- ASTROLOJİ AŞAMA 1 fixture: minimal public.clients (composite unique YOK — migration idempotent
-- eklemeli) + iki tenant'a ait danışanlar. Yalnız yerel embedded-postgres; prod'a temas YOK.
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  ad text,
  soyad text,
  dogum date
);
INSERT INTO public.clients (id, tenant_id, ad, soyad, dogum) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ali', 'A', '1990-07-15'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ayşe', 'B', NULL),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Başka', 'Tenant', NULL)
  ,('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X', 'Kişi', NULL),
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Y', 'Karşı taraf', NULL)
ON CONFLICT (id) DO NOTHING;
