-- P1-1 / M2 minimal fixture (yalnız yerel embedded-postgres; prod DEĞİL)
-- 6 client cohort tablosu (trigger bağlanabilmesi için) + yh_source_activation.
-- yasam_hafizasi_client_outbox tablosunu 20261218000200 (+ enqueued_active: 20261220000000) oluşturur.
CREATE TABLE IF NOT EXISTS public.yh_source_activation (
  source_key text PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT false,
  backfill_allowed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid,              -- NULLABLE: Ajanda "Genel" randevu
  title text,
  starts_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.client_stones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid, note text);
CREATE TABLE IF NOT EXISTS public.client_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid, note text);
CREATE TABLE IF NOT EXISTS public.client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid, note text);
CREATE TABLE IF NOT EXISTS public.client_homeworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid, note text);
CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, client_id uuid, note text);
INSERT INTO public.yh_source_activation (source_key, is_active) VALUES
  ('danisan:appointments', true), ('danisan:stones', false)
ON CONFLICT (source_key) DO NOTHING;
