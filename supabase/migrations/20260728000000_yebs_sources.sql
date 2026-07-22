-- ============================================================
-- 20260728000000_yebs_sources.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D5
-- Tablo: public.yebs_sources (bibliyografik kaynak deposu — belge düzeyi künye)
--
-- Tek sorumluluk: yalnız yebs_sources tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok, seed yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Bağımsız tablo: concepts/schools/claims'e FK YOK. Yalnız gelenek bağlamına
--   opsiyonel bağ (tradition_context_id -> yebs_traditions(id) ON DELETE SET NULL).
--
-- Locator (kaynak-içi sayfa/bölüm) BURADA TUTULMAZ — aynı kaynak farklı
--   claim'lerce farklı sayfalarından atıf alır; locator D7 claim_sources ve
--   D9 concept_relation_sources junction'larında (locator_text/url_fragment).
--   Bu tabloda yalnız belge düzeyi kimlik ve künye bulunur.
--
-- Kimlik/dedup modeli:
--   DOI ve PMID küresel tekildir → kanonik-form CHECK (küçük harf/çıplak/sıfırsız)
--     + kısmi UNIQUE(WHERE NOT NULL) birlikte varyant mükerrerliğini engeller.
--     Server yazımdan önce normalize eder; DB kanonik-dışı yazımı reddeder.
--   ISBN baskı/format'a özgüdür → UNIQUE YOK (yumuşak dedup server uyarısı).
--
-- notes: yalnız kaynağın kataloglanmasına dair dahili editöryal/operasyonel not;
--   claim/locator/alıntı/pasaj/kullanıcıya-gösterilen-açıklama anlamı YÜKLENMEZ.
-- ============================================================

CREATE TABLE public.yebs_sources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type           text        NOT NULL,
  title                 text        NOT NULL,
  language_tag          text        NOT NULL,
  script_code           text,
  authors               text,
  organization          text,
  publisher             text,
  publication_year      integer,
  dating_note           text,
  edition               text,
  doi                   text,
  pmid                  text,
  isbn                  text,
  url                   text,
  document_no           text,
  tradition_context_id  uuid,
  status                text        NOT NULL DEFAULT 'draft',
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Gelenek bağlamı (opsiyonel, kaba etiket). Gelenek silinirse bağlam NULL'lanır.
  CONSTRAINT yebs_sources_tradition_context_fk
    FOREIGN KEY (tradition_context_id)
    REFERENCES public.yebs_traditions (id)
    ON DELETE SET NULL,

  -- Kaynak türü (editöryal sınıflandırma).
  CONSTRAINT yebs_sources_source_type_chk CHECK (
    source_type IN (
      'classical_text',
      'book',
      'journal_article',
      'regulatory_document',
      'monograph',
      'standard',
      'database_record',
      'thesis',
      'website',
      'oral_tradition_record',
      'other'
    )
  ),

  -- Başlık boş/whitespace olamaz.
  CONSTRAINT yebs_sources_title_chk CHECK (
    btrim(title) <> ''
  ),

  -- Kaynağın özgün dili (gevşek BCP-47; tam doğrulama/normalizasyon server-side).
  CONSTRAINT yebs_sources_language_tag_chk CHECK (
    language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- Özgün yazı sistemi (opsiyonel; varsa ISO-15924). language_tag zorunlu
  -- olduğundan coupling gerekmez; script künye kimliği için zorunlu değildir.
  CONSTRAINT yebs_sources_script_code_chk CHECK (
    script_code IS NULL OR script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Yayın yılı: kesin/güvenilir yıl (MÖ için negatif). NULL = kesin yıl yok.
  CONSTRAINT yebs_sources_publication_year_chk CHECK (
    publication_year IS NULL OR publication_year BETWEEN -3000 AND 2100
  ),

  -- DOI kanonik-form guard (tam DOI doğrulaması DEĞİL): çıplak, küçük harf,
  -- kırpılmış; doi:/https://doi.org/ öneki reddedilir. Tekilliği partial UNIQUE sağlar.
  CONSTRAINT yebs_sources_doi_chk CHECK (
    doi IS NULL OR (doi = lower(btrim(doi)) AND doi LIKE '10.%')
  ),

  -- PMID kanonik-form guard: yalnız rakam, baştaki sıfır yok, önek/boşluk yok.
  CONSTRAINT yebs_sources_pmid_chk CHECK (
    pmid IS NULL OR pmid ~ '^[1-9][0-9]*$'
  ),

  -- ISBN gevşek hijyen (UNIQUE YOK; server tire/boşluk sıyırır, X büyütür).
  CONSTRAINT yebs_sources_isbn_chk CHECK (
    isbn IS NULL OR (isbn = btrim(isbn) AND isbn <> '')
  ),

  -- URL gevşek: kırpılmış + http(s) şeması (path büyük/küçük harfe duyarlı).
  CONSTRAINT yebs_sources_url_chk CHECK (
    url IS NULL OR (url = btrim(url) AND url ~ '^https?://')
  ),

  -- Serbest metin alanları: doluysa boş/whitespace olamaz.
  CONSTRAINT yebs_sources_authors_chk CHECK (
    authors IS NULL OR btrim(authors) <> ''
  ),
  CONSTRAINT yebs_sources_organization_chk CHECK (
    organization IS NULL OR btrim(organization) <> ''
  ),
  CONSTRAINT yebs_sources_publisher_chk CHECK (
    publisher IS NULL OR btrim(publisher) <> ''
  ),
  CONSTRAINT yebs_sources_edition_chk CHECK (
    edition IS NULL OR btrim(edition) <> ''
  ),
  CONSTRAINT yebs_sources_dating_note_chk CHECK (
    dating_note IS NULL OR btrim(dating_note) <> ''
  ),
  CONSTRAINT yebs_sources_document_no_chk CHECK (
    document_no IS NULL OR btrim(document_no) <> ''
  ),
  CONSTRAINT yebs_sources_notes_chk CHECK (
    notes IS NULL OR btrim(notes) <> ''
  ),

  -- Yayın yaşam döngüsü (geçişler server-side; generic CRUD 'published' yazamaz).
  -- archived = yürürlükten kalkmış ama silinmemiş (atıflı kaynak korunur).
  CONSTRAINT yebs_sources_status_chk CHECK (
    status IN ('draft', 'verified', 'approved', 'published', 'archived')
  )
);

-- DOI küresel tekilliği (yalnız dolu değerler). Kanonik-form CHECK ile birlikte
-- büyük/küçük harf ve önek varyantlarının mükerrer kaydını engeller.
CREATE UNIQUE INDEX yebs_sources_doi_key
  ON public.yebs_sources (doi)
  WHERE doi IS NOT NULL;

-- PMID küresel tekilliği (yalnız dolu değerler).
CREATE UNIQUE INDEX yebs_sources_pmid_key
  ON public.yebs_sources (pmid)
  WHERE pmid IS NOT NULL;

-- Statüye göre listeleme (ör. yalnız published kaynaklar).
CREATE INDEX yebs_sources_status_idx
  ON public.yebs_sources (status);

-- Gelenek bağlamına göre sorgu + ON DELETE SET NULL child taraması.
-- Kısmi: yalnız bağlamı olan kaynaklar (çoğu NULL olabilir).
CREATE INDEX yebs_sources_tradition_context_idx
  ON public.yebs_sources (tradition_context_id)
  WHERE tradition_context_id IS NOT NULL;

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_sources_updated_at
  BEFORE UPDATE ON public.yebs_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_sources FROM anon;
REVOKE ALL ON TABLE public.yebs_sources FROM authenticated;
REVOKE ALL ON TABLE public.yebs_sources FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_sources TO service_role;
