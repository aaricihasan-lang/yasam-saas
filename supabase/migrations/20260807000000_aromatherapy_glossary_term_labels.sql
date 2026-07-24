-- ============================================================
-- 20260807000000_aromatherapy_glossary_term_labels.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2M-C
-- Tablo: public.aromatherapy_glossary_term_labels
--   (bir CANONICAL glossary term'e bağlı alternatif LEXICAL label kayıtları)
--
-- TEK SORUMLULUK: canonical glossary terime bağlı alternatif ad/lexical biçim; arama ve
--   terim eşleştirmesine yardım. Label = tek canonical term'e bağlı alternatif; bağımsız
--   kontrollü tag sözlüğü DEĞİL, canonical kavram DEĞİL, canonical translation DEĞİL.
--
-- LABEL TÜRLERİ (tam 4): synonym (aynı kavram için alternatif ad — common/vernacular/local/
--   güncel bilimsel synonym), abbreviation (kısaltma/akronim — acronym ayrı değil),
--   spelling_variant (meşru yazım/tire/boşluk/ortografik varyant — typo DEĞİL),
--   former_name (tarihsel/eski/deprecated/gerçek eski bilimsel ad).
--
-- KAPSAM DIŞI (bilinçle): transliteration, typo/misspelling sözlüğü, fuzzy search, canonical
--   translation, tag (C2M-B), category (C2M-A), global label sözlüğü, polymorphic label engine,
--   source/provenance/evidence, UI/API/service writer, seed/backfill/import. Bu tabloda YOKTUR:
--   is_primary, is_preferred, is_searchable, source_id, passage_id, verification_status,
--   verified_by, verified_at, confidence, evidence_note, provenance, description, notes,
--   valid_from, valid_to, canonical_key, slug, revision, series_id.
--
-- ÇOK-DİLLİ NORMALİZASYON (KRİTİK): C2M-A/C2M-B Türkçe fold ifadesi TÜM dillere körlemesine
--   uygulanamaz — İngilizce/diğer dillerde ASCII 'I' → Türkçe 'ı' YANLIŞTIR. Normalizasyon
--   language-aware'dir: language_tag 'tr' veya 'tr-%' ise Türkçe case-fold (İ→i, I→ı,
--   Ş/Ğ/Ç/Ö/Ü→küçük Türkçe); aksi halde standart lower(). Her ikisinde btrim + \s+→' '.
--   Noktalama/tire/slash/apostrof/diakritik KALDIRILMAZ; unaccent/fuzzy YOK → GC-MS, GC/MS,
--   GCMS OTOMATİK AYNI SAYILMAZ. Tüm bileşenler (lower/btrim/translate/regexp_replace/CASE)
--   IMMUTABLE → expression index'te kullanılabilir.
--
-- TEKİLLİK: aynı canonical term içinde, aynı dilde, aynı normalize label yalnız BİR kez.
--   Unique kapsam (tenant_id, glossary_term_id, lower(btrim(language_tag)), norm(label_text)).
--   label_type ve script_code unique anahtara GİRMEZ → aynı lexical form aynı term+dil için
--   iki farklı türle tekrar eklenemez; aynı form farklı dil/term/tenant'ta serbest.
--   TENANT-GLOBAL label unique DEĞİLDİR: aynı abbreviation/synonym birden çok canonical terme
--   anlamlı bağlanabilir → ambiguity veri kaybı değildir; retrieval çoklu aday döndürür.
--   NULLS NOT DISTINCT GEREKSİZ (anahtardaki 4 sütun NOT NULL).
--
-- CANONICAL COLLISION SINIRI: canonical form'un (canonical_term_tr/en) label olarak tekrar
--   saklanmaması C2S/C2T SERVICE WRITER INVARIANT'ıdır. Bu migration cross-table canonical
--   collision trigger'ı OLUŞTURMAZ (dil-koşullu, kısmi, pahalı); yalnız label-label duplicate
--   tekilliğini uygular.
--
-- IDENTITY IMMUTABILITY: (id, tenant_id, glossary_term_id, created_at) immutable — parent-link
--   dahil (yanlış parent = DELETE + yeni INSERT). BEFORE UPDATE trigger + IS DISTINCT FROM +
--   SQLSTATE 23514; no-op identity SET İZİNLİDİR. Mutable: label_text, label_type, language_tag,
--   script_code, status, updated_at.
--
-- LIFECYCLE: status active/archived (mutable; reactivatable). Archived label SİLİNMEZ, satır
--   korunur; retrieval'dan dışlama QUERY/SERVICE katmanı sorumluluğudur. Bu migration'da
--   archived-satır silme engeli / active-only trigger / partial-active index YOKTUR;
--   service_role DELETE yetkisi korunur.
--
-- Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız S/I/U/D GRANT — C2K/C2M-A/C2M-B production dersi; GRANT ALL DEĞİL; TRUNCATE/
--   REFERENCES/TRIGGER/MAINTAIN yok). Tenant-scoped (tenant tablosuna FK yok — proje standardı).
--   Deterministik/fail-fast: düz ifadeler; IF (NOT) EXISTS / DROP / CREATE OR REPLACE /
--   ALTER DEFAULT PRIVILEGES / seed / backfill YOK. set_updated_at() yalnız reuse. Glossary term
--   FK hedefi (tenant_id, id) [C2K] zaten mevcut; parent glossary_terms DEĞİŞTİRİLMEZ. Candidate
--   UNIQUE (tenant_id, id) gelecekteki label evidence junction FK hedefi için proaktif eklenir
--   (bu turda evidence tablosu OLUŞTURULMAZ).
-- ============================================================

BEGIN;

CREATE TABLE public.aromatherapy_glossary_term_labels (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  glossary_term_id  uuid        NOT NULL,
  label_text        text        NOT NULL,
  label_type        text        NOT NULL,
  language_tag      text        NOT NULL,
  script_code       text,
  status            text        NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- CHECK 1) label_text boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_term_labels_label_text_chk CHECK (
    btrim(label_text) <> ''
  ),
  -- CHECK 2) label_type allowlist (tam 4).
  CONSTRAINT aromatherapy_glossary_term_labels_label_type_chk CHECK (
    label_type IN ('synonym', 'abbreviation', 'spelling_variant', 'former_name')
  ),
  -- CHECK 3) language_tag BCP-47-lite (raw kolon üzerinde; boş/whitespace/geçersiz reddedilir).
  CONSTRAINT aromatherapy_glossary_term_labels_language_tag_chk CHECK (
    language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  -- CHECK 4) script_code: NULL olabilir; değer varsa canonical ISO-15924 (boş/whitespace reddedilir).
  CONSTRAINT aromatherapy_glossary_term_labels_script_code_chk CHECK (
    script_code IS NULL OR script_code ~ '^[A-Z][a-z]{3}$'
  ),
  -- CHECK 5) status allowlist.
  CONSTRAINT aromatherapy_glossary_term_labels_status_chk CHECK (
    status IN ('active', 'archived')
  )
);

-- Candidate anahtar — gelecekteki label evidence junction FK hedefi (additif; kendi tablosuna).
ALTER TABLE public.aromatherapy_glossary_term_labels
  ADD CONSTRAINT aromatherapy_glossary_term_labels_tenant_id_unique UNIQUE (tenant_id, id);

-- Term FK — tenant-güvenli. Label parent terme aittir; term silinince label'ları CASCADE silinir.
ALTER TABLE public.aromatherapy_glossary_term_labels
  ADD CONSTRAINT aromatherapy_glossary_term_labels_term_fk
  FOREIGN KEY (tenant_id, glossary_term_id)
  REFERENCES public.aromatherapy_glossary_terms (tenant_id, id)
  ON DELETE CASCADE;

-- Language-aware normalized UNIQUE: aynı term+dil için aynı normalize label tekil.
-- label_type/script_code anahtarda YOK. NULLS NOT DISTINCT GEREKSİZ (4 sütun NOT NULL).
CREATE UNIQUE INDEX aromatherapy_glossary_term_labels_term_lang_text_uidx
  ON public.aromatherapy_glossary_term_labels (
    tenant_id,
    glossary_term_id,
    lower(btrim(language_tag)),
    CASE
      WHEN lower(btrim(language_tag)) = 'tr'
           OR lower(btrim(language_tag)) LIKE 'tr-%'
      THEN
        lower(translate(regexp_replace(btrim(label_text), '\s+', ' ', 'g'), 'İIŞĞÇÖÜ', 'iışğçöü'))
      ELSE
        lower(regexp_replace(btrim(label_text), '\s+', ' ', 'g'))
    END
  );

-- Reverse lookup (non-unique): label → candidate canonical terms (retrieval yönü).
-- glossary_term_id/label_type/script_code/status DAHİL DEĞİL. Partial (WHERE status) YOK.
CREATE INDEX aromatherapy_glossary_term_labels_lookup_idx
  ON public.aromatherapy_glossary_term_labels (
    tenant_id,
    lower(btrim(language_tag)),
    CASE
      WHEN lower(btrim(language_tag)) = 'tr'
           OR lower(btrim(language_tag)) LIKE 'tr-%'
      THEN
        lower(translate(regexp_replace(btrim(label_text), '\s+', ' ', 'g'), 'İIŞĞÇÖÜ', 'iışğçöü'))
      ELSE
        lower(regexp_replace(btrim(label_text), '\s+', ' ', 'g'))
    END
  );

-- Identity guard (fail-fast CREATE). (id, tenant_id, glossary_term_id, created_at) immutable;
-- no-op SET izinli. Yanlış parent = DELETE + yeni INSERT.
CREATE FUNCTION public.aromatherapy_glossary_term_labels_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id              IS DISTINCT FROM OLD.id
     OR NEW.tenant_id        IS DISTINCT FROM OLD.tenant_id
     OR NEW.glossary_term_id IS DISTINCT FROM OLD.glossary_term_id
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_term_labels id/tenant_id/glossary_term_id/created_at are immutable; DELETE + re-INSERT to re-parent'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger sırası: identity_guard < updated_at (alfabetik) → guard önce çalışır.
CREATE TRIGGER trg_aromatherapy_glossary_term_labels_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_term_labels
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_term_labels_identity_guard();

CREATE TRIGGER trg_aromatherapy_glossary_term_labels_updated_at
  BEFORE UPDATE ON public.aromatherapy_glossary_term_labels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli.
ALTER TABLE public.aromatherapy_glossary_term_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_labels FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_labels FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_term_labels TO service_role;

COMMIT;
