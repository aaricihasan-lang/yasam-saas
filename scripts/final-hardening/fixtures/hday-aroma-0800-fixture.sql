-- HDAY / migration 0800 fixture — minimal Aromaterapi kaynak + referans tabloları.
-- Kaynak: 20260719000000_aromatherapy_sources, 20260721000000_aromatherapy_claim_sources,
-- 20260724000000_aromatherapy_source_passages, 20260912000000 (method series) DDL'lerinin
-- yalnız bu RPC için gerekli kolon/FK alt kümesi. Audit/tombstone tabloları GERÇEK
-- 20260830000000 migration'ı ile (ayrı --fixture) kurulur. YEREL embedded-postgres; prod YOK.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE public.aromatherapy_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  source_type       text        NOT NULL,
  title             text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  authors           text,
  organization      text,
  publication_year  integer,
  doi               text,
  pmid              text,
  isbn              text,
  url               text,
  document_no       text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aromatherapy_sources_tenant_id_unique UNIQUE (tenant_id, id)
);
CREATE TRIGGER trg_aromatherapy_sources_updated_at
  BEFORE UPDATE ON public.aromatherapy_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.aromatherapy_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_sources FROM anon, authenticated, PUBLIC, service_role;
GRANT SELECT ON TABLE public.aromatherapy_sources TO service_role;

CREATE TABLE public.aromatherapy_source_passages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  source_id  uuid NOT NULL,
  CONSTRAINT aromatherapy_source_passages_source_fk
    FOREIGN KEY (tenant_id, source_id) REFERENCES public.aromatherapy_sources (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.aromatherapy_claim_sources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  source_id  uuid NOT NULL,
  CONSTRAINT aromatherapy_claim_sources_source_fk
    FOREIGN KEY (tenant_id, source_id) REFERENCES public.aromatherapy_sources (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.aromatherapy_preparation_method_series (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  source_id  uuid,
  CONSTRAINT aromatherapy_prep_method_series_source_fk
    FOREIGN KEY (tenant_id, source_id) REFERENCES public.aromatherapy_sources (tenant_id, id) ON DELETE RESTRICT
);

-- Tenant A: s1 referanssız, s2 pasajlı + claim'li, s3 method series'li. Tenant B: sb.
INSERT INTO public.aromatherapy_sources (id, tenant_id, source_type, title, notes) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'book', 'Kullanılmayan Kaynak', 'not'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'book', 'Atıflı Kaynak', NULL),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'monograph', 'Yöntem Kaynağı', NULL),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'book', 'Başka Tenant', NULL);
INSERT INTO public.aromatherapy_source_passages (tenant_id, source_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.aromatherapy_claim_sources (tenant_id, source_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.aromatherapy_preparation_method_series (tenant_id, source_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333');
