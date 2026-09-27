-- DY-A minimal fixture (yalnız yerel embedded-postgres; prod DEĞİL)
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ad text, soyad text, gorusme text,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_id_id_key') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  notlar text, saglik_notu text, adres text, oneriler text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  selected_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.yh_report_snapshot_prevent_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable'; END; $$;
DROP TRIGGER IF EXISTS trg_yhrs_no_update ON public.yasam_hafizasi_report_snapshots;
CREATE TRIGGER trg_yhrs_no_update BEFORE UPDATE ON public.yasam_hafizasi_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.yh_report_snapshot_prevent_update();
INSERT INTO public.clients (id, tenant_id, ad, soyad) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ayşe', 'YILMAZ'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Can', 'DEMİR')
ON CONFLICT DO NOTHING;
INSERT INTO public.client_notes (tenant_id, client_id, notlar)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '[]'
WHERE NOT EXISTS (SELECT 1 FROM public.client_notes);
INSERT INTO public.yasam_hafizasi_report_snapshots (tenant_id, client_id, selected_text)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'örnek'
WHERE NOT EXISTS (SELECT 1 FROM public.yasam_hafizasi_report_snapshots);
