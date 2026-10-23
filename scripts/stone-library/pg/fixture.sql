-- Doğaltaş Kütüphanesi F1 — test fikstürü (yalnız sentetik; PROD'a temas YOK).
-- Prod'da var olan bağımlılıkların minimal kopyası: public.users (+ mevcut Doğaltaş tablolarından örnekler:
-- migration'ın bunlara DOKUNMADIĞI hash ile kanıtlanır).
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY, email text, role text, active boolean DEFAULT false, approval_status text DEFAULT 'pending',
  module_permissions jsonb DEFAULT '{}'::jsonb, tenant_id uuid, is_super_admin boolean NOT NULL DEFAULT false,
  is_demo_account boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.stones (id uuid PRIMARY KEY, tenant_id uuid, stone_name text, chakras jsonb, assignments jsonb);
CREATE TABLE IF NOT EXISTS public.stone_sources (id uuid PRIMARY KEY, tenant_id uuid, stone_id uuid, source_name text);
CREATE TABLE IF NOT EXISTS public.stone_entries (id uuid PRIMARY KEY, tenant_id uuid, stone_id uuid, field_key text, content text);
CREATE TABLE IF NOT EXISTS public.client_stones (id uuid PRIMARY KEY, tenant_id uuid, stone_name text);
CREATE TABLE IF NOT EXISTS public.dogaltas_inventory (id uuid PRIMARY KEY, tenant_id uuid, name text);
INSERT INTO public.stones VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','ZZ AMETİST','["Taç Çakra"]','{"Burçlar":[["Balık"]]}') ON CONFLICT DO NOTHING;
INSERT INTO public.stone_sources VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','ZZ Kaynak') ON CONFLICT DO NOTHING;
INSERT INTO public.stone_entries VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','general_info','ZZ metin') ON CONFLICT DO NOTHING;
INSERT INTO public.client_stones VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-0000000000a1','ZZ AMETİST') ON CONFLICT DO NOTHING;
INSERT INTO public.dogaltas_inventory VALUES ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-0000000000a1','ZZ AMETİST') ON CONFLICT DO NOTHING;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text);
INSERT INTO public.users (id, email, role, active, approval_status, tenant_id, is_super_admin) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'zz.owner@example.test', 'admin', true, 'approved', '00000000-0000-4000-8000-0000000000a1', true)
ON CONFLICT DO NOTHING;
