-- ============================================================
-- 20261229000400_nutrition_sources.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Opsiyonel kaynak kataloğu. §F.5. Evidence Core YOK (claim/passage/verification/editorial YOK).
-- Kaynak girmek zorunlu değil; food/topic kaynak olmadan kaydedilebilir.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  title             text        NOT NULL,
  authors           text,
  organization      text,
  source_type       text,
  publication_year  integer,
  edition           text,
  page_range        text,
  chapter           text,
  url               text,
  reference_code    text,
  note              text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  search_tsv        tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.yh_immutable_unaccent(coalesce(title, ''))), 'A')
    || setweight(to_tsvector('simple', public.yh_immutable_unaccent(
         coalesce(authors, '') || ' ' || coalesce(organization, ''))), 'B')
  ) STORED,

  CONSTRAINT nutrition_sources_title_chk CHECK (btrim(title) <> ''),
  CONSTRAINT nutrition_sources_source_type_chk CHECK (
    source_type IS NULL OR source_type IN (
      'book', 'article', 'clinical_guide', 'official_institution',
      'web', 'education', 'traditional', 'other'
    )
  ),
  CONSTRAINT nutrition_sources_year_chk CHECK (
    publication_year IS NULL OR (publication_year BETWEEN 1000 AND 2200)
  ),

  CONSTRAINT nutrition_sources_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX nutrition_sources_tenant_idx
  ON public.nutrition_sources (tenant_id, is_active);

CREATE INDEX nutrition_sources_search_idx
  ON public.nutrition_sources USING gin (search_tsv);

CREATE FUNCTION public.nutrition_sources_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_sources identity columns (id, tenant_id, created_at) are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_sources_identity_guard
  BEFORE UPDATE ON public.nutrition_sources
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_sources_identity_guard();

CREATE TRIGGER trg_nutrition_sources_updated_at
  BEFORE UPDATE ON public.nutrition_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_sources FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_sources TO service_role;

COMMIT;
