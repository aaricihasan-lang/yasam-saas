-- ============================================================
-- 20260719000000_aromatherapy_sources.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2A
-- Tablo: public.aromatherapy_sources (kanonik kaynak/künye çekirdeği)
--
-- Tek sorumluluk: yalnız aromatherapy_sources tablosu.
-- Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; idempotent-atlama veya
--   nesne düşürme yoktur (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- Kapsam dışı (bilinçli, ileri aşamalara additif): kaynak-içi konum kaydı, tanımlayıcı
--   benzersizlik kısıtı, eski yağ tablosu bağı, görünürlük/hesaplanabilirlik bayrakları,
--   denetim-kullanıcı alanları ve ek künye alanları — bu tabloda yer almaz.
-- ============================================================

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

  CONSTRAINT aromatherapy_sources_source_type_chk CHECK (
    source_type IN (
      'book',
      'journal_article',
      'regulatory_document',
      'monograph',
      'standard',
      'database_record',
      'website',
      'other'
    )
  ),
  CONSTRAINT aromatherapy_sources_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  ),
  CONSTRAINT aromatherapy_sources_title_chk CHECK (
    btrim(title) <> ''
  ),
  CONSTRAINT aromatherapy_sources_pub_year_chk CHECK (
    publication_year IS NULL OR publication_year BETWEEN 1400 AND 2100
  )
);

-- Tenant filtreleme için tek secondary index.
CREATE INDEX aromatherapy_sources_tenant_idx
  ON public.aromatherapy_sources (tenant_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse.
CREATE TRIGGER trg_aromatherapy_sources_updated_at
  BEFORE UPDATE ON public.aromatherapy_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. RLS ENABLE (policy yok, FORCE yok).
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role açık yetkiye sahip
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_sources FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_sources TO service_role;
