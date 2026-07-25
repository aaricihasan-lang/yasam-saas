-- =============================================================================
-- 20260809000000_hd_source_foundation.sql
--
-- HUMAN DESIGN — HD-2D1 · KAYNAK / PASAJ / ÖZGÜN METİN + HAK KATMANI
--
-- AMAÇ:
--   Human Design Bilgi Sistemi'nin tenant'sız, doğuştan-kilitli KAYNAK tabakasının
--   ilk üç fiziksel katmanını kurar:
--     public.hd_sources         — kaynak bibliyografik + gelenek + varsayılan hak metadata
--     public.hd_source_passages — pasaj locator/sıra/kind + kaynak-haklarından farklılaşan
--                                 hak override (ÖZGÜN METİN BURADA DEĞİL)
--     public.hd_original_texts  — pasaja ait ÖZGÜN kaynak metni (dil+script+exact-byte
--                                 SHA-256 hash), FİZİKSEL OLARAK passage'dan AYRI
--
-- FİZİKSEL KATMAN AYRIMI (bağlayıcı): özgün metin hd_source_passages'a GÖMÜLMEZ;
--   ayrı hd_original_texts tablosunda tutulur. Sadık çeviri (HD-2D2), editoryal
--   açıklama/yorum (HD-2D3), provenans junction (HD-2D3) ve append-only audit
--   (HD-2D4) BU MIGRATION'DA YOKTUR.
--
-- HASH SÖZLEŞMESİ (KRİTİK — migration hash ÜRETMEZ):
--   content_hash = SHA-256, 64 karakter lowercase hex. pgcrypto/digest/generated
--   KULLANILMAZ; hash server/Node crypto ile hesaplanır. Girdi = original_text
--   alanının BİREBİR UTF-8 byte dizisi. Hash öncesi trim/lowercase/Unicode
--   normalization/whitespace collapse/line-ending dönüşümü YAPILMAZ. Amaç arama
--   normalizasyonu değil, birebir sürüm ÇIPASIDIR (immutability + HD-2D2 çevirinin
--   doğrudan-özgüne pinlenmesi + bayat çeviri tespiti). Migration yalnız FORMAT'ı zorlar.
--
-- DİL/SCRIPT: language_tag lowercase BCP-47-lite (tam doğrulama app/service);
--   script_code ISO-15924 (^[A-Z][a-z]{3}$). Dil ve script AYRI kolonlar.
--
-- HAK/İZİN (default-deny): kaynak rights_status ZORUNLU (DEFAULT YOK — küratör açık
--   seçer). Kullanım bayrakları NOT NULL DEFAULT false. Passage override NULL =
--   kaynaktan devral; explicit true yalnız ADAY izindir — nihai kullanım kararı
--   ileride server-only publish servisinde source+passage haklarını birlikte
--   değerlendirir; çözülemeyen/bilinmeyen durum DEFAULT-DENY. Effective hak çözümü
--   DB generated kolonla YAPILMAZ. public_display ile expert_delivery/report_use AYRI.
--
-- SÜRÜM/IMMUTABILITY: revision integer DEFAULT 1 CHECK>0; supersedes self-FK RESTRICT
--   (revision>1 için zorunlu). verified/archived satırların değiştirilemezliği
--   (mutation guard + append-only audit) HD-2D4'te BÜTÜNSEL kurulacaktır — bu
--   migration'da immutability/mutation/audit trigger'ı YOKTUR (born-locked + admin
--   write API yok → mevcut UX/güvenlik riski oluşmaz). Otomatik revision/hash
--   trigger'ı da YOKTUR.
--
-- GÜVENLİK (born-locked): üç tablo da RLS ENABLE (FORCE YOK, policy 0),
--   PUBLIC/anon/authenticated REVOKE ALL, service_role yalnız SELECT/INSERT/UPDATE
--   (DELETE YOK, GRANT ALL YOK). Hard delete varsayılan kapalı; tüm FK ON DELETE
--   RESTRICT. Erişim yalnız gelecekte verifyAdminRequest → server-only service →
--   service_role. HİÇBİR MEVCUT ROUTE bu tabloları okumaz. tenant_id/user_id YOK.
--
-- ATOMİKLİK: tek dosya, açık BEGIN;...COMMIT; (repo precedent). Fail-fast: düz CREATE
--   (IF NOT EXISTS YOK), DO/EXCEPTION YOK, ON CONFLICT YOK, ENUM YOK (text+CHECK),
--   destructive DOWN YOK, seed YOK. Ortak public.set_updated_at() yalnız REUSE.
--
-- KANONİK ENTITY BAĞI: bu tabakada canonical_entity_id/content_slot YOKTUR; kaynak
--   katmanı canonical entity'den bağımsızdır. Entity bağı HD-2D3 editoryal katmanında.
--   NOT: tüm HD migration zincirinin DB uygulaması, HD-2C canlı-test+apply kapısından
--   sonra yapılacaktır (HD-2C henüz hiçbir DB'de uygulanmadı).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) public.hd_sources — kaynak metadata + varsayılan hak
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_sources (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type                 text        NOT NULL,
  title                       text        NOT NULL,
  authors                     text[]      NOT NULL DEFAULT '{}'::text[],
  organization                text,
  publisher                   text,
  publication_year            integer,
  edition                     text,
  volume                      text,
  issue                       text,
  doi                         text,
  pmid                        text,
  isbn                        text,
  source_url                  text,
  document_number             text,
  accessed_on                 date,
  default_language_tag        text,
  default_script_code         text,
  tradition_key               text,
  school_key                  text,

  -- Hak metadata (varsayılan; passage seviyesinde override edilebilir).
  rights_status               text        NOT NULL,
  rights_holder               text,
  permission_basis            text,
  permission_reference        text,
  license_code                text,
  license_url                 text,
  permission_received_at      timestamptz,
  permission_expires_at       timestamptz,
  quotation_limit             text,
  rights_notes                text,

  -- Kullanım izinleri (default-deny; bağımsız eksenler).
  internal_use_allowed        boolean     NOT NULL DEFAULT false,
  expert_delivery_allowed     boolean     NOT NULL DEFAULT false,
  private_report_use_allowed  boolean     NOT NULL DEFAULT false,
  public_display_allowed      boolean     NOT NULL DEFAULT false,
  commercial_use_allowed      boolean     NOT NULL DEFAULT false,

  -- Sürüm/durum.
  status                      text        NOT NULL DEFAULT 'draft',
  revision                    integer     NOT NULL DEFAULT 1,
  supersedes_source_id        uuid,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_sources_source_type_chk CHECK (
    source_type IN (
      'book', 'journal_article', 'regulatory_document', 'monograph', 'standard',
      'database_record', 'website', 'video', 'audio', 'teaching_note',
      'permissioned_document', 'archive_document', 'classical_text', 'oral_source', 'other'
    )
  ),
  CONSTRAINT hd_sources_rights_status_chk CHECK (
    rights_status IN (
      'public_domain', 'licensed', 'permission_granted', 'restricted', 'pending_review', 'unknown'
    )
  ),
  CONSTRAINT hd_sources_permission_basis_chk CHECK (
    permission_basis IS NULL OR permission_basis IN (
      'public_domain', 'license', 'written_permission', 'terms_of_use',
      'statutory_exception', 'internal_agreement', 'unknown', 'other'
    )
  ),
  CONSTRAINT hd_sources_status_chk CHECK (status IN ('draft', 'verified', 'archived')),
  CONSTRAINT hd_sources_title_notblank_chk CHECK (btrim(title) <> ''),
  CONSTRAINT hd_sources_authors_no_null_chk CHECK (
    cardinality(authors) = cardinality(array_remove(authors, NULL))
  ),
  CONSTRAINT hd_sources_publication_year_chk CHECK (
    publication_year IS NULL OR publication_year BETWEEN 1400 AND 2100
  ),
  CONSTRAINT hd_sources_default_language_tag_chk CHECK (
    default_language_tag IS NULL OR default_language_tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT hd_sources_default_script_code_chk CHECK (
    default_script_code IS NULL OR default_script_code ~ '^[A-Z][a-z]{3}$'
  ),
  CONSTRAINT hd_sources_revision_chk CHECK (revision > 0),
  CONSTRAINT hd_sources_supersedes_not_self_chk CHECK (
    supersedes_source_id IS NULL OR supersedes_source_id <> id
  ),
  CONSTRAINT hd_sources_revision_supersedes_chk CHECK (
    (revision = 1 AND supersedes_source_id IS NULL)
    OR (revision > 1 AND supersedes_source_id IS NOT NULL)
  ),
  CONSTRAINT hd_sources_permission_dates_chk CHECK (
    permission_received_at IS NULL OR permission_expires_at IS NULL
    OR permission_expires_at >= permission_received_at
  ),

  CONSTRAINT hd_sources_supersedes_fk
    FOREIGN KEY (supersedes_source_id) REFERENCES public.hd_sources (id) ON DELETE RESTRICT
);

-- Aynı eski kaynak revision'ının yalnız BİR doğrudan successor'ı olabilir.
CREATE UNIQUE INDEX hd_sources_one_successor_uidx
  ON public.hd_sources (supersedes_source_id)
  WHERE supersedes_source_id IS NOT NULL;

CREATE INDEX hd_sources_status_idx ON public.hd_sources (status);
CREATE INDEX hd_sources_source_type_idx ON public.hd_sources (source_type);
CREATE INDEX hd_sources_publication_year_idx ON public.hd_sources (publication_year);
CREATE INDEX hd_sources_supersedes_idx ON public.hd_sources (supersedes_source_id);
CREATE INDEX hd_sources_title_lower_idx ON public.hd_sources (lower(title));

CREATE TRIGGER trg_hd_sources_updated_at
  BEFORE UPDATE ON public.hd_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_sources IS
  'HD-2D1 tenant''sız canonical kaynak katmanı (born-locked). Bibliyografik + gelenek + VARSAYILAN hak metadata. rights_status ZORUNLU (default yok); kullanım bayrakları default-deny. Hard delete kapalı. Hiçbir mevcut route okumaz.';
COMMENT ON COLUMN public.hd_sources.rights_status IS
  'ZORUNLU, DEFAULT YOK. Kullanım bayrakları tek başına hak doğrulaması değildir; publish/delivery servisi rights_status + bayrağı BİRLİKTE değerlendirir (default-deny).';
COMMENT ON COLUMN public.hd_sources.public_display_allowed IS
  'Kamuya açık gösterim izni. expert_delivery/private_report/internal izinlerinden BAĞIMSIZ eksen.';
COMMENT ON COLUMN public.hd_sources.supersedes_source_id IS
  'Sürüm zinciri (revision>1 zorunlu). Eski kayıt archived''a alınır, silinmez; verified immutability HD-2D4 mutation/audit katmanında tamamlanır.';

-- -----------------------------------------------------------------------------
-- 2) public.hd_source_passages — pasaj locator + hak override (ÖZGÜN METİN YOK)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_source_passages (
  id                                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                           uuid        NOT NULL,
  locator_kind                        text        NOT NULL,
  locator_label                       text        NOT NULL,
  locator_value                       text        NOT NULL,
  locator_metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sort_order                          integer     NOT NULL DEFAULT 0,
  passage_kind                        text        NOT NULL,

  -- Hak override (NULL = kaynaktan devral).
  rights_status_override              text,
  rights_note                         text,
  permission_reference_override       text,
  quotation_limit_override            text,
  internal_use_allowed_override       boolean,
  expert_delivery_allowed_override    boolean,
  private_report_use_allowed_override boolean,
  public_display_allowed_override     boolean,
  commercial_use_allowed_override     boolean,

  -- Sürüm/durum.
  status                              text        NOT NULL DEFAULT 'draft',
  revision                            integer     NOT NULL DEFAULT 1,
  supersedes_passage_id               uuid,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_source_passages_locator_kind_chk CHECK (
    locator_kind IN (
      'page', 'page_range', 'chapter', 'section', 'paragraph', 'volume',
      'document_page', 'url_fragment', 'timecode', 'track', 'record_id', 'other'
    )
  ),
  CONSTRAINT hd_source_passages_passage_kind_chk CHECK (
    passage_kind IN ('excerpt', 'full_text', 'reference_only')
  ),
  CONSTRAINT hd_source_passages_status_chk CHECK (status IN ('draft', 'verified', 'archived')),
  CONSTRAINT hd_source_passages_locator_label_chk CHECK (btrim(locator_label) <> ''),
  CONSTRAINT hd_source_passages_locator_value_chk CHECK (btrim(locator_value) <> ''),
  CONSTRAINT hd_source_passages_locator_metadata_obj_chk CHECK (
    jsonb_typeof(locator_metadata) = 'object'
  ),
  CONSTRAINT hd_source_passages_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT hd_source_passages_rights_override_chk CHECK (
    rights_status_override IS NULL OR rights_status_override IN (
      'public_domain', 'licensed', 'permission_granted', 'restricted', 'pending_review', 'unknown'
    )
  ),
  CONSTRAINT hd_source_passages_revision_chk CHECK (revision > 0),
  CONSTRAINT hd_source_passages_supersedes_not_self_chk CHECK (
    supersedes_passage_id IS NULL OR supersedes_passage_id <> id
  ),
  CONSTRAINT hd_source_passages_revision_supersedes_chk CHECK (
    (revision = 1 AND supersedes_passage_id IS NULL)
    OR (revision > 1 AND supersedes_passage_id IS NOT NULL)
  ),

  CONSTRAINT hd_source_passages_source_fk
    FOREIGN KEY (source_id) REFERENCES public.hd_sources (id) ON DELETE RESTRICT,
  CONSTRAINT hd_source_passages_supersedes_fk
    FOREIGN KEY (supersedes_passage_id) REFERENCES public.hd_source_passages (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX hd_source_passages_one_successor_uidx
  ON public.hd_source_passages (supersedes_passage_id)
  WHERE supersedes_passage_id IS NOT NULL;

CREATE INDEX hd_source_passages_source_idx ON public.hd_source_passages (source_id);
CREATE INDEX hd_source_passages_status_idx ON public.hd_source_passages (status);
CREATE INDEX hd_source_passages_passage_kind_idx ON public.hd_source_passages (passage_kind);
CREATE INDEX hd_source_passages_locator_kind_idx ON public.hd_source_passages (locator_kind);
CREATE INDEX hd_source_passages_source_sort_idx ON public.hd_source_passages (source_id, sort_order);
CREATE INDEX hd_source_passages_supersedes_idx ON public.hd_source_passages (supersedes_passage_id);

CREATE TRIGGER trg_hd_source_passages_updated_at
  BEFORE UPDATE ON public.hd_source_passages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_source_passages IS
  'HD-2D1 kaynak PASAJ katmanı (born-locked). Locator + sıra + passage_kind + kaynak-haklarından farklılaşan hak OVERRIDE. ÖZGÜN METİN BURADA DEĞİL (ayrı hd_original_texts). Hard delete kapalı.';
COMMENT ON COLUMN public.hd_source_passages.rights_status_override IS
  'NULL = hd_sources.rights_status devralınır. Effective hak çözümü DB generated kolonla DEĞİL, server-only servis katmanında yapılır; çözülemeyen durum DEFAULT-DENY.';
COMMENT ON COLUMN public.hd_source_passages.public_display_allowed_override IS
  'NULL = kaynağı devral; explicit false = passage''ta kapalı; explicit true = ADAY izin (nihai kullanım source+passage kurallarıyla servis kapısında değerlendirilir).';

-- -----------------------------------------------------------------------------
-- 3) public.hd_original_texts — pasaja ait özgün metin (dil+script+exact-byte hash)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_original_texts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id                  uuid        NOT NULL,
  language_tag                text        NOT NULL,
  script_code                 text        NOT NULL,
  original_text               text        NOT NULL,
  content_hash                text        NOT NULL,
  capture_method              text        NOT NULL DEFAULT 'manual_transcription',
  status                      text        NOT NULL DEFAULT 'draft',
  revision                    integer     NOT NULL DEFAULT 1,
  supersedes_original_text_id uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_original_texts_capture_method_chk CHECK (
    capture_method IN ('manual_transcription', 'ocr', 'official_digital', 'direct_import', 'other')
  ),
  CONSTRAINT hd_original_texts_status_chk CHECK (status IN ('draft', 'verified', 'archived')),
  CONSTRAINT hd_original_texts_original_text_notblank_chk CHECK (btrim(original_text) <> ''),
  CONSTRAINT hd_original_texts_language_tag_chk CHECK (
    language_tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT hd_original_texts_script_code_chk CHECK (
    script_code ~ '^[A-Z][a-z]{3}$'
  ),
  -- content_hash: tam 64 karakter lowercase SHA-256 hex (migration üretmez; format-only).
  CONSTRAINT hd_original_texts_content_hash_format_chk CHECK (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT hd_original_texts_revision_chk CHECK (revision > 0),
  CONSTRAINT hd_original_texts_supersedes_not_self_chk CHECK (
    supersedes_original_text_id IS NULL OR supersedes_original_text_id <> id
  ),
  CONSTRAINT hd_original_texts_revision_supersedes_chk CHECK (
    (revision = 1 AND supersedes_original_text_id IS NULL)
    OR (revision > 1 AND supersedes_original_text_id IS NOT NULL)
  ),

  -- HD-2D2 sadık çevirinin belirli özgün-metin SÜRÜMÜNE güvenli pin'i için aday anahtar.
  CONSTRAINT hd_original_texts_version_pin_key
    UNIQUE (id, content_hash, language_tag, script_code),
  -- Aynı passage'da aynı özgün içeriğin (hash+dil+script) tekrar eklenmesini engelle.
  CONSTRAINT hd_original_texts_dedup_key
    UNIQUE (passage_id, content_hash, language_tag, script_code),
  -- Aynı passage+dil+script için revision tekilliği.
  CONSTRAINT hd_original_texts_revision_key
    UNIQUE (passage_id, language_tag, script_code, revision),

  CONSTRAINT hd_original_texts_passage_fk
    FOREIGN KEY (passage_id) REFERENCES public.hd_source_passages (id) ON DELETE RESTRICT,
  CONSTRAINT hd_original_texts_supersedes_fk
    FOREIGN KEY (supersedes_original_text_id) REFERENCES public.hd_original_texts (id) ON DELETE RESTRICT
);

-- Aynı passage+dil+script için aynı anda YALNIZ BİR verified (current) özgün metin.
CREATE UNIQUE INDEX hd_original_texts_one_verified_current_uidx
  ON public.hd_original_texts (passage_id, language_tag, script_code)
  WHERE status = 'verified';

-- Aynı eski özgün metin için yalnız BİR doğrudan successor.
CREATE UNIQUE INDEX hd_original_texts_one_successor_uidx
  ON public.hd_original_texts (supersedes_original_text_id)
  WHERE supersedes_original_text_id IS NOT NULL;

CREATE INDEX hd_original_texts_passage_idx ON public.hd_original_texts (passage_id);
CREATE INDEX hd_original_texts_status_idx ON public.hd_original_texts (status);
CREATE INDEX hd_original_texts_language_tag_idx ON public.hd_original_texts (language_tag);
CREATE INDEX hd_original_texts_script_code_idx ON public.hd_original_texts (script_code);
CREATE INDEX hd_original_texts_content_hash_idx ON public.hd_original_texts (content_hash);
CREATE INDEX hd_original_texts_supersedes_idx ON public.hd_original_texts (supersedes_original_text_id);

CREATE TRIGGER trg_hd_original_texts_updated_at
  BEFORE UPDATE ON public.hd_original_texts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_original_texts IS
  'HD-2D1 ÖZGÜN kaynak metni katmanı (born-locked). Passage''dan FİZİKSEL AYRI. Dil+script AYRI kolonlar. content_hash = SHA-256 exact-UTF-8-byte (migration/pgcrypto ÜRETMEZ; server crypto). reference_only passage''ın metni olmayabilir; excerpt/full_text için verified metin zorunluluğu HD-2D3+ server publish kapısıdır. Hard delete kapalı.';
COMMENT ON COLUMN public.hd_original_texts.content_hash IS
  'SHA-256, 64-hex lowercase. FORMAT-only CHECK; hash server/Node crypto üretir (girdi=original_text birebir UTF-8 byte, normalizasyon YOK). Sürüm çıpası: metin değişirse hash değişir → bayat çeviri (HD-2D2) tespit edilir.';
COMMENT ON COLUMN public.hd_original_texts.supersedes_original_text_id IS
  'Sürüm zinciri (revision>1 zorunlu). verified/archived immutability HD-2D4 mutation/audit katmanında tamamlanır; bu migration''da mutation trigger YOK.';

-- -----------------------------------------------------------------------------
-- 4) BORN-LOCKED RLS + GRANT (3 tablo)
--    RLS ENABLE (FORCE YOK, policy YOK); PUBLIC/anon/authenticated REVOKE ALL;
--    service_role yalnız SELECT/INSERT/UPDATE (DELETE YOK, GRANT ALL YOK).
-- -----------------------------------------------------------------------------

ALTER TABLE public.hd_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_sources FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_sources FROM anon;
REVOKE ALL ON TABLE public.hd_sources FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;

ALTER TABLE public.hd_source_passages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_source_passages FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_source_passages FROM anon;
REVOKE ALL ON TABLE public.hd_source_passages FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_source_passages TO service_role;

ALTER TABLE public.hd_original_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_original_texts FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_original_texts FROM anon;
REVOKE ALL ON TABLE public.hd_original_texts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_original_texts TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — ileri fazda canlı DB'de; beklenen):
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('hd_sources','hd_source_passages','hd_original_texts');  -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace
--       AND relname IN ('hd_sources','hd_source_passages','hd_original_texts');
--     -- relrowsecurity=true, relforcerowsecurity=false
--   SELECT has_table_privilege('anon','public.hd_sources','SELECT');            -- false
--   SELECT has_table_privilege('service_role','public.hd_sources','DELETE');    -- false
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
-- =============================================================================
