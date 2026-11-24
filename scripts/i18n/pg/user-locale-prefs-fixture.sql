-- I18N-F1 — user_locale_prefs migration testi için SENTETİK minimum şema (gerçek veri YOK).
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  email text
);
INSERT INTO public.users (id, tenant_id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'uzman-a@ornek.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'uzman-b@ornek.invalid')
ON CONFLICT (id) DO NOTHING;
