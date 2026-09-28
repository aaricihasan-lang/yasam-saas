-- ANAMNEZ V1 fixture: minimal public.clients (composite unique YOK — migration idempotent eklemeli)
-- + storage'da bu bucket'a atıf yapan sahte bir anon policy (migration kaldırmalı) ve başka
-- bucket'a ait bir policy (DOKUNULMAMALI).
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  ad text,
  telefon text,
  kan text
);
INSERT INTO public.clients (id, tenant_id, ad, telefon, kan) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Danışan A1', '0500', 'A Rh+'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Danışan A2', '0501', NULL),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Danışan B1', '0502', NULL)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS anamnesis_leak_select ON storage.objects;
DROP POLICY IF EXISTS other_bucket_keep ON storage.objects;
CREATE POLICY anamnesis_leak_select ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'client-anamnesis-files');
CREATE POLICY other_bucket_keep ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stone-photos');
