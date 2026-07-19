-- ============================================================
-- 20260719010000_aromatherapy_plant_taxa.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2B
-- Tablo: public.aromatherapy_plant_taxa (kanonik, kabul edilmiş botanik kimlik)
--
-- Tek sorumluluk: yalnız bu tablo.
-- Doğuştan-kilitli (satır güvenliği açık + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- canonical_name üretilmiş (GENERATED STORED) kolondur: parça alanlardan deterministik
--   biçimde türetilir, elle yazılamaz, yazar bilgisini içermez.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; idempotent-atlama veya
--   nesne düşürme yoktur (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
-- ============================================================

CREATE TABLE public.aromatherapy_plant_taxa (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  genus                  text        NOT NULL,
  species                text        NOT NULL,
  taxon_rank             text        NOT NULL,
  infraspecific_epithet  text,
  is_hybrid              boolean     NOT NULL DEFAULT false,
  author_citation        text,
  canonical_name         text        GENERATED ALWAYS AS (
                           genus
                           || CASE WHEN is_hybrid THEN ' × ' ELSE ' ' END
                           || species
                           || CASE taxon_rank
                                WHEN 'subspecies' THEN ' subsp. ' || infraspecific_epithet
                                WHEN 'variety'    THEN ' var. '   || infraspecific_epithet
                                WHEN 'forma'      THEN ' f. '      || infraspecific_epithet
                                ELSE ''
                              END
                         ) STORED NOT NULL,
  family                 text        NOT NULL,
  status                 text        NOT NULL DEFAULT 'draft',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aromatherapy_plant_taxa_genus_chk CHECK (
    genus = btrim(genus) AND genus <> ''
  ),
  CONSTRAINT aromatherapy_plant_taxa_species_chk CHECK (
    species = btrim(species) AND species <> ''
  ),
  CONSTRAINT aromatherapy_plant_taxa_family_chk CHECK (
    family = btrim(family) AND family <> ''
  ),
  CONSTRAINT aromatherapy_plant_taxa_rank_chk CHECK (
    taxon_rank IN ('species', 'subspecies', 'variety', 'forma')
  ),
  CONSTRAINT aromatherapy_plant_taxa_status_chk CHECK (
    status IN ('draft', 'verified', 'approved')
  ),
  CONSTRAINT aromatherapy_plant_taxa_infraspecific_chk CHECK (
    (taxon_rank = 'species' AND infraspecific_epithet IS NULL)
    OR (
      taxon_rank IN ('subspecies', 'variety', 'forma')
      AND infraspecific_epithet IS NOT NULL
      AND infraspecific_epithet = btrim(infraspecific_epithet)
      AND infraspecific_epithet <> ''
    )
  ),
  CONSTRAINT aromatherapy_plant_taxa_author_chk CHECK (
    author_citation IS NULL OR btrim(author_citation) <> ''
  )
);

-- Tenant içi, case-insensitive kanonik kimlik tekilliği (dedup + arama).
-- Öncü sütun tenant_id olduğundan tenant filtreleme için ayrıca index gerekmez.
CREATE UNIQUE INDEX aromatherapy_plant_taxa_canonical_uidx
  ON public.aromatherapy_plant_taxa (tenant_id, lower(canonical_name));

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_plant_taxa_updated_at
  BEFORE UPDATE ON public.aromatherapy_plant_taxa
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_plant_taxa ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_plant_taxa FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_plant_taxa TO service_role;
