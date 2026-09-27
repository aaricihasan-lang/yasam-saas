-- INFRA 0900 fixture: minimal public.clients (tenant_id, id) — composite unique YOK
-- (migration idempotent olarak eklemeli).
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ad text
);
INSERT INTO public.clients (id, tenant_id, ad) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Danışan A1'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Danışan A2'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Danışan B1')
ON CONFLICT (id) DO NOTHING;
