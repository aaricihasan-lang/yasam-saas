-- 20261003000000_aromatherapy_search_normalization.sql
-- =============================================================================
-- AROMATERAPİ V2 — FAZ 1: Sunucu-tarafı TÜRKÇE arama normalizasyonu.
--
-- AMAÇ: Modern C3C okuma yüzeylerinde (plant_taxa, preparations, sources,
-- source_passages, glossary_terms, claims) arama; ham PostgREST `.ilike` yerine
-- Türkçe-katlanmış `search_norm` üzerinden yapılabilsin. Böylece
--   "İZMİR"↔"izmir", "biberiye"↔"BİBERİYE", "cay"↔"Çay", "gul"↔"Gül"
-- eşleşir.
--
-- KAPSAM SINIRI (SADECE ADDITIVE):
--   * YENİ IMMUTABLE fonksiyon: public.aromatherapy_search_normalize(text)
--   * Her hedef tabloya YENİ generated STORED kolon: search_norm
--   * RLS / GRANT / POLICY / mevcut kolon / mevcut index DEĞİŞTİRİLMEZ.
--   * canonical slug/key normalizasyonuna (glossary canonical_key vb.) DOKUNULMAZ.
--
-- NORMALİZASYON SÖZLEŞMESİ = lib/aromaterapi/searchNormalize.ts (BYTE-EŞ):
--   1) translate: İ I ı i→i ; Ş ş→s ; Ğ ğ→g ; Ç ç→c ; Ö ö→o ; Ü ü→u
--      (+ chr(775) birleşik-nokta silme — from to'dan uzun → son karakter silinir)
--   2) lower  (kalan ASCII büyük harfler)
--   3) regexp_replace('\s+',' ') + btrim
--   â/î/û KATLANMAZ (Faz 1 kararı; "kar" ↔ "kâr" eşleşmez).
--
-- INDEX: `%q%` infix araması btree ile hızlanmaz; pg_trgm bu fazda EKLENMEZ
--   (TRGM_DEFERRED). Hedef tablolar tenant-scoped ve küçük; tenant filtresinden
--   sonra kalan alt küme üzerinde seq-scan makul. pg_trgm/GIN gerçek ölçek ihtiyacı
--   doğduğunda ayrı, additive bir migration ile eklenebilir.
--
-- ROLLBACK (gerekirse):
--   ALTER TABLE ... DROP COLUMN IF EXISTS search_norm;  (6 tablo)
--   DROP FUNCTION IF EXISTS public.aromatherapy_search_normalize(text);
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Arama normalizasyon fonksiyonu — IMMUTABLE (generated-column uyumlu).
--    Yalnız IMMUTABLE bileşen: coalesce + translate + chr + lower + regexp_replace
--    + btrim. Türkçe harfler ÖNCE translate ile ASCII'ye katlanır → lower()'ın
--    Türkçe-locale sapması ve İ→i+U0307 combining-dot sorunu locale-bağımsız
--    bertaraf edilir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aromatherapy_search_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(
      coalesce(input, ''),
      'İIıiŞşĞğÇçÖöÜü' || chr(775),
      'iiiissggccoouu'
    )),
    '\s+', ' ', 'g'
  ));
$$;

COMMENT ON FUNCTION public.aromatherapy_search_normalize(text) IS
  'Aromaterapi ARAMA normalizasyonu (search-only). Türkçe harf katlama + U+0307 '
  'silme + lower + whitespace collapse. canonical slug/key normalizasyonundan '
  'AYRIDIR. JS eşi: lib/aromaterapi/searchNormalize.ts (byte-eş).';

-- -----------------------------------------------------------------------------
-- 2) Generated STORED search_norm kolonları — her tablonun MEVCUT SEARCH_COLS
--    kapsamıyla birebir (kapsam DARALTILMAZ). Generated kolon başka generated
--    kolona referans veremez → plant_taxa'da canonical_name yerine onu üreten
--    temel alanlar (genus/species/infraspecific_epithet) + family + author_citation
--    kullanılır (canonical_name'in tüm token'larını kapsar).
-- -----------------------------------------------------------------------------

-- plant_taxa  (SEARCH_COLS: canonical_name, genus, species, family, author_citation)
ALTER TABLE public.aromatherapy_plant_taxa
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(genus, '') || ' ' ||
      coalesce(species, '') || ' ' ||
      coalesce(infraspecific_epithet, '') || ' ' ||
      coalesce(family, '') || ' ' ||
      coalesce(author_citation, '')
    )
  ) STORED;

-- preparations  (SEARCH_COLS: preparation_type, plant_part, chemotype)
ALTER TABLE public.aromatherapy_preparations
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(preparation_type, '') || ' ' ||
      coalesce(plant_part, '') || ' ' ||
      coalesce(chemotype, '')
    )
  ) STORED;

-- sources  (SEARCH_COLS: title, authors, organization, doi, pmid, isbn, url, document_no)
ALTER TABLE public.aromatherapy_sources
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(title, '') || ' ' ||
      coalesce(authors, '') || ' ' ||
      coalesce(organization, '') || ' ' ||
      coalesce(doi, '') || ' ' ||
      coalesce(pmid, '') || ' ' ||
      coalesce(isbn, '') || ' ' ||
      coalesce(url, '') || ' ' ||
      coalesce(document_no, '')
    )
  ) STORED;

-- source_passages  (SEARCH_COLS: locator_label)
ALTER TABLE public.aromatherapy_source_passages
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(coalesce(locator_label, ''))
  ) STORED;

-- glossary_terms  (SEARCH_COLS: canonical_term_tr, canonical_term_en, short_definition_tr)
ALTER TABLE public.aromatherapy_glossary_terms
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(canonical_term_tr, '') || ' ' ||
      coalesce(canonical_term_en, '') || ' ' ||
      coalesce(short_definition_tr, '')
    )
  ) STORED;

-- claims  (SEARCH_COLS: conclusion, rationale, preparation_context)
ALTER TABLE public.aromatherapy_claims
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.aromatherapy_search_normalize(
      coalesce(conclusion, '') || ' ' ||
      coalesce(rationale, '') || ' ' ||
      coalesce(preparation_context, '')
    )
  ) STORED;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası — beklenen). Ayrıntı: scripts/verify-aromatherapy-search-normalization.sql
--   SELECT provolatile FROM pg_proc WHERE proname='aromatherapy_search_normalize';  -- 'i'
--   SELECT public.aromatherapy_search_normalize('BİBERİYE');  -- 'biberiye'
--   SELECT public.aromatherapy_search_normalize('Çay Sığla');  -- 'cay sigla'
--   SELECT public.aromatherapy_search_normalize('kâr');        -- 'kâr'  (â KATLANMAZ)
--   Generated kolon: SELECT search_norm FROM public.aromatherapy_plant_taxa LIMIT 1;
--   Privilege DEĞİŞMEDİ: has_table_privilege('anon','public.aromatherapy_claims','SELECT') -- false
-- =============================================================================
