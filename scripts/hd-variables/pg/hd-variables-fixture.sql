-- HD VARIABLES kalıcı depo fixture: production'daki human_design_charts ile aynı temel kolonlar (tenant_id NULL olabilir,
-- UNIQUE (tenant_id, id) YOK). Supabase varsayılanı gibi yeni tablolara anon/authenticated yetkisi verilir (migration REVOKE etmeli).
-- Yalnız yerel embedded-postgres; SENTETİK veri; prod'a temas YOK.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
CREATE TABLE IF NOT EXISTS public.human_design_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  client_id uuid,
  source text DEFAULT 'manual',
  input jsonb,
  input_hash text,
  computed_result jsonb
);
INSERT INTO public.human_design_charts (id, tenant_id, source, input_hash, computed_result) VALUES
  ('d0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'computed', 'ih-a', '{"x":1}'),
  ('d0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'computed', 'ih-b', '{"x":2}'),
  ('d0000000-0000-4000-8000-00000000000c', NULL, 'computed', 'ih-legacy', '{"x":3}')
ON CONFLICT (id) DO NOTHING;
