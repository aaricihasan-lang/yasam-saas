-- ============================================================
-- 20260803000000_numerology_content_sections_and_sources.sql
--
-- NKB-V2-B — Numeroloji Bilgi Bankası yapılandırılmış içerik + kaynak altyapısı
--   (yalnız ŞEMA; API/UI/Word/içerik aktarımı KAPSAM DIŞI).
--
-- Kapsam (ADDITİF, geri-uyumlu):
--   1) numerology_knowledge_records.content_sections  (nullable jsonb; DEFAULT YOK)
--   2) public.numerology_sources                       (tenant-scoped bibliyografik kaynak)
--   3) public.numerology_record_sources                (kayıt <-> kaynak junction / M:N)
--
-- Doğuştan-kilitli güvenlik (yeni tablolar): satır güvenliği açık +
--   anon/authenticated/PUBLIC REVOKE + yalnız service_role GRANT.
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor). Çapraz-tenant bağını DB düzeyinde
--   engellemek için junction'da İKİ kompozit yabancı anahtar kullanılır; bu nedenle
--   her iki parent tabloya additif UNIQUE (tenant_id, id) aday anahtarı eklenir.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- FAIL-CLOSED: numerology_knowledge_records'ın repo migration geçmişinde tam tanımı
--   BULUNMADIĞINDAN mevcut şema VARSAYILMAZ. Migration, ALTER'dan ÖNCE tablonun ve
--   beklenen kolonların varlığını information_schema üzerinden doğrular; biri yoksa
--   RAISE EXCEPTION ile DURUR (ALTER/CREATE/DROP yapmaz, sessizce devam etmez).
--
-- KESİNLİKLE YAPILMAYANLAR:
--   * numerology_knowledge_records DROP/CREATE edilmez, yeniden kurulmaz.
--   * description ve source kolonları kaldırılmaz/yeniden adlandırılmaz/dönüştürülmez.
--   * Hiçbir veri backfill'i / UPDATE / DELETE yapılmaz (mevcut satırlar NULL kalır).
--   * numerology_stone_assignments tablosuna DOKUNULMAZ.
--
-- ATOMİKLİK: Tüm migration TEK açık PostgreSQL transaction'ı içindedir (BEGIN … COMMIT).
--   Harici transaction garantisi VARSAYILMAZ (repo'da supabase config.toml/CLI runner yok;
--   migration'lar Dashboard SQL Editor ile elle uygulanır — bu, projedeki 18 kilit
--   migration'ının izlediği yerleşik konvansiyondur). Herhangi bir adım (fail-closed
--   DO bloğu, ALTER, CREATE, UNIQUE/FK, trigger, REVOKE/GRANT) hata verirse transaction
--   abort olur, COMMIT rollback'e döner ve HİÇBİR şema değişikliği kalmaz.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) FAIL-CLOSED ÖN KOŞUL DOĞRULAMASI
--    Beklenen tablo + kolonlar yoksa migration burada durur (transaction abort → rollback).
-- ------------------------------------------------------------
DO $$
DECLARE
  required_col text;
  required_cols text[] := ARRAY[
    'id', 'tenant_id', 'analysis_type', 'value', 'source', 'description', 'updated_at'
  ];
BEGIN
  -- Tablo var mı?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'numerology_knowledge_records'
  ) THEN
    RAISE EXCEPTION
      'NKB-V2-B durdu: public.numerology_knowledge_records tablosu bulunamadi. Beklenen tablo yok; ALTER yapilmadi.';
  END IF;

  -- Beklenen kolonların her biri var mı?
  FOREACH required_col IN ARRAY required_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'numerology_knowledge_records'
        AND column_name = required_col
    ) THEN
      RAISE EXCEPTION
        'NKB-V2-B durdu: numerology_knowledge_records.% kolonu bulunamadi. Beklenen sema degil; ALTER yapilmadi.',
        required_col;
    END IF;
  END LOOP;

  -- Idempotent-güvenlik: content_sections zaten varsa migration daha önce uygulanmıştır.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'numerology_knowledge_records'
      AND column_name = 'content_sections'
  ) THEN
    RAISE EXCEPTION
      'NKB-V2-B durdu: content_sections kolonu zaten mevcut. Migration daha once uygulanmis gorunuyor.';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 1) content_sections — nullable jsonb, DEFAULT YOK.
--    Mevcut satırlar NULL kalır; ayrıntılı bölüm doğrulaması TypeScript katmanındadır.
--    DB seviyesinde yalnız hafif tip sözleşmesi: NULL veya jsonb array.
-- ------------------------------------------------------------
ALTER TABLE public.numerology_knowledge_records
  ADD COLUMN content_sections jsonb;

ALTER TABLE public.numerology_knowledge_records
  ADD CONSTRAINT numerology_knowledge_records_content_sections_chk
  CHECK (content_sections IS NULL OR jsonb_typeof(content_sections) = 'array');

-- Kompozit yabancı anahtar hedefi (junction için additif aday anahtar).
-- id zaten benzersiz olduğundan (tenant_id, id) benzersizdir; ekleme additiftir.
ALTER TABLE public.numerology_knowledge_records
  ADD CONSTRAINT numerology_knowledge_records_tenant_id_unique UNIQUE (tenant_id, id);

-- ------------------------------------------------------------
-- 2) numerology_sources — tenant-scoped bibliyografik kaynak.
--    display_label = kullanıcıya gösterilen kilitli kısa ad (resmî künyeden AYRI).
--    Resmî alanlar (title/authors/organization/...) tahmin edilmez; ileride doldurulur.
-- ------------------------------------------------------------
CREATE TABLE public.numerology_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  display_label     text        NOT NULL,
  title             text,
  authors           text,
  organization      text,
  source_type       text,
  level_or_edition  text,
  publication_year  integer,
  language          text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Kilitli kısa gösterim adı boş/whitespace olamaz.
  CONSTRAINT numerology_sources_display_label_chk CHECK (btrim(display_label) <> ''),

  -- Opsiyonel metin alanları: değer varsa boş/whitespace olamaz (tip sözleşmesi TS'te).
  CONSTRAINT numerology_sources_title_chk CHECK (title IS NULL OR btrim(title) <> ''),
  CONSTRAINT numerology_sources_authors_chk CHECK (authors IS NULL OR btrim(authors) <> ''),
  CONSTRAINT numerology_sources_organization_chk CHECK (organization IS NULL OR btrim(organization) <> ''),
  CONSTRAINT numerology_sources_source_type_chk CHECK (source_type IS NULL OR btrim(source_type) <> ''),
  CONSTRAINT numerology_sources_level_or_edition_chk CHECK (level_or_edition IS NULL OR btrim(level_or_edition) <> ''),
  CONSTRAINT numerology_sources_language_chk CHECK (language IS NULL OR btrim(language) <> ''),
  CONSTRAINT numerology_sources_notes_chk CHECK (notes IS NULL OR btrim(notes) <> ''),
  CONSTRAINT numerology_sources_pub_year_chk CHECK (
    publication_year IS NULL OR (publication_year BETWEEN 0 AND 3000)
  ),

  -- Kompozit yabancı anahtar hedefi (junction için additif aday anahtar).
  CONSTRAINT numerology_sources_tenant_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX numerology_sources_tenant_idx
  ON public.numerology_sources (tenant_id);

CREATE TRIGGER trg_numerology_sources_updated_at
  BEFORE UPDATE ON public.numerology_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.numerology_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.numerology_sources FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.numerology_sources TO service_role;

-- ------------------------------------------------------------
-- 3) numerology_record_sources — bilgi kaydı <-> kaynak junction (M:N).
--    Bir kaynak çok kayda, bir kayda çok kaynak bağlanabilir.
--    Sayfa/locator/birincil-durum/gösterim-sırası burada tutulur.
--    İki kompozit FK → çapraz-tenant bağ DB düzeyinde imkânsız.
-- ------------------------------------------------------------
CREATE TABLE public.numerology_record_sources (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  knowledge_record_id  uuid        NOT NULL,
  source_id            uuid        NOT NULL,
  page_start           integer,
  page_end             integer,
  locator              text,
  is_primary           boolean     NOT NULL DEFAULT false,
  display_order        integer     NOT NULL DEFAULT 0,
  internal_note        text,
  section_key          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Kompozit, tenant-güvenli bilgi-kaydı bağı. Kayıt silinince bağ da silinir.
  CONSTRAINT numerology_record_sources_record_fk
    FOREIGN KEY (tenant_id, knowledge_record_id)
    REFERENCES public.numerology_knowledge_records (tenant_id, id)
    ON DELETE CASCADE,

  -- Kompozit, tenant-güvenli kaynak bağı. Atıflı kaynak silinemez.
  CONSTRAINT numerology_record_sources_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.numerology_sources (tenant_id, id)
    ON DELETE RESTRICT,

  -- Sayfa aralığı: değer varsa mantıklı olmalı.
  CONSTRAINT numerology_record_sources_page_start_chk CHECK (page_start IS NULL OR page_start >= 0),
  CONSTRAINT numerology_record_sources_page_end_chk CHECK (page_end IS NULL OR page_end >= 0),
  CONSTRAINT numerology_record_sources_page_range_chk CHECK (
    page_start IS NULL OR page_end IS NULL OR page_start <= page_end
  ),

  -- Serbest-metin alanları: değer varsa boş/whitespace olamaz.
  CONSTRAINT numerology_record_sources_locator_chk CHECK (locator IS NULL OR btrim(locator) <> ''),
  CONSTRAINT numerology_record_sources_internal_note_chk CHECK (internal_note IS NULL OR btrim(internal_note) <> ''),
  -- section_key: bölüm-seviyesi bağ için ileri kapı; vocabulary doğrulaması TS katmanında.
  CONSTRAINT numerology_record_sources_section_key_chk CHECK (section_key IS NULL OR btrim(section_key) <> ''),

  -- Doğal tekillik. NULLS NOT DISTINCT: belge-düzeyi bağ (section_key NULL) bir kez;
  -- aynı kaynak farklı section_key ile aynı kayda yeniden bağlanabilir.
  CONSTRAINT numerology_record_sources_identity_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, knowledge_record_id, source_id, section_key)
);

-- Kaynak-tarafı ters arama (bir kaynağı kullanan kayıtlar).
-- Kayıt-tarafı aramalar doğal unique index prefix'iyle (tenant_id, knowledge_record_id) karşılanır.
CREATE INDEX numerology_record_sources_tenant_source_idx
  ON public.numerology_record_sources (tenant_id, source_id);

CREATE TRIGGER trg_numerology_record_sources_updated_at
  BEFORE UPDATE ON public.numerology_record_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.numerology_record_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.numerology_record_sources FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.numerology_record_sources TO service_role;

-- ------------------------------------------------------------
-- Tüm adımlar başarıyla tamamlandıysa değişiklikleri kalıcı yap.
-- Yukarıdaki herhangi bir hata / RAISE EXCEPTION durumunda transaction abort olur ve
-- bu COMMIT rollback'e döner (hiçbir kısmi şema kalmaz).
-- ------------------------------------------------------------
COMMIT;
