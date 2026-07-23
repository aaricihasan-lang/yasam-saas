-- ============================================================
-- 20260802000000_aromatherapy_glossary_term_passages.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2K
-- Tablo: public.aromatherapy_glossary_term_passages
--   (bir glossary teriminin hangi ORİJİNAL source passage ile hangi terminolojik
--    ilişki içinde olduğunu tenant-safe ve denetlenebilir biçimde kaydeden junction)
--
-- TEK SORUMLULUK: terim ↔ passage kanıt bağı. Editöryal tanım metni (C2G/C2J), çeviri
--   metni (C2I) veya claim bağı (C2D/C2L) SAKLAMAZ. Seri/revision modeli KULLANMAZ.
--
-- PASSAGE-ONLY (C2J'den bilinçli sapma): terminoloji kanıtı ORİJİNAL pasajdan gelir;
--   çeviri kanıt kaynağı değildir → translation_id YOKTUR. (Editöryal not belirli çeviriyi
--   yorumlayabilir — o C2J; glossary terim kanıtı orijinal kaynağa çıpalanır.)
--
-- PASSAGE_KIND SNAPSHOT + FAIL-CLOSED: junction passage_kind taşır; enhanced kompozit FK
--   (tenant_id, passage_id, passage_kind) → source_passages(tenant_id, id, passage_kind) ile
--   gerçek passage türüne pinlenir (snapshot mismatch fail-closed reddedilir). Same-row CHECK:
--   reference_only → yalnız 'bibliographic_reference'; excerpt/full_text → yalnız metin rolleri.
--   Metin rolleri reference_only'de, 'bibliographic_reference' metin-passage'da YASAKTIR.
--
-- IDENTITY IMMUTABILITY: kimlik kolonları (tenant_id, glossary_term_id, passage_id,
--   passage_kind, relation_type, created_at) BEFORE UPDATE trigger'ı ile (SQLSTATE 23514)
--   değişime kapalıdır (IS DISTINCT FROM guard; aynı değeri SET eden no-op UPDATE İZİNLİDİR).
--   Yanlış bağ düzeltmesi = DELETE + yeni INSERT. Güncellenebilir: verification_status,
--   verified_by, verified_at, updated_at.
--
-- Tenant-scoped: tenant_id uuid NOT NULL (tenant tablosuna FK yok — proje standardı).
--   Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE; service_role yalnız
--   SELECT/INSERT/UPDATE/DELETE — GRANT ALL DEĞİL; TRUNCATE/REFERENCES/TRIGGER verilmez).
--   Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS / DROP / CREATE OR REPLACE / idempotent
--   telafi YOK.
--
-- Ortak public.set_updated_at() yalnız reuse (yeniden tanımlanmaz). Additif parent aday
--   anahtarları eklenir; eski C2G/C2H migration dosyaları DEĞİŞTİRİLMEZ.
-- ============================================================


-- 1) Glossary tenant-safe aday anahtarı — glossary FK hedefi (additif; C2G dosyası değişmez).
--    (tenant_id, id) zaten tekil (id PK) → trivially tekil; mevcut veriyle çakışma imkânsız.
ALTER TABLE public.aromatherapy_glossary_terms
  ADD CONSTRAINT aromatherapy_glossary_terms_tenant_id_unique UNIQUE (tenant_id, id);

-- 2) Passage enhanced aday anahtarı — passage_kind snapshot FK hedefi (additif; C2H dosyası değişmez).
--    (tenant_id, id) tekil → (tenant_id, id, passage_kind) trivially tekil; çakışma imkânsız.
ALTER TABLE public.aromatherapy_source_passages
  ADD CONSTRAINT aromatherapy_source_passages_tenant_id_kind_unique UNIQUE (tenant_id, id, passage_kind);

-- 3) Junction tablosu.
CREATE TABLE public.aromatherapy_glossary_term_passages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  glossary_term_id     uuid        NOT NULL,
  passage_id           uuid        NOT NULL,
  passage_kind         text        NOT NULL,
  relation_type        text        NOT NULL,
  verification_status  text        NOT NULL DEFAULT 'unverified',
  verified_by          text,
  verified_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Doğal tekillik: aynı (term, passage, rol) tekrar edemez; aynı (term,passage) farklı rollerle serbest.
  -- passage_kind doğal anahtara dahil değildir (enhanced FK passage'dan zaten belirler).
  CONSTRAINT aromatherapy_glossary_term_passages_natural_key
    UNIQUE (tenant_id, glossary_term_id, passage_id, relation_type),

  -- Glossary bağı (tenant-safe). Bağlı terim silinemez.
  CONSTRAINT aromatherapy_glossary_term_passages_glossary_fk
    FOREIGN KEY (tenant_id, glossary_term_id)
    REFERENCES public.aromatherapy_glossary_terms (tenant_id, id)
    ON DELETE RESTRICT,

  -- Passage enhanced bağı (tenant + passage kimliği + passage_kind snapshot). Bağlı passage silinemez.
  CONSTRAINT aromatherapy_glossary_term_passages_passage_fk
    FOREIGN KEY (tenant_id, passage_id, passage_kind)
    REFERENCES public.aromatherapy_source_passages (tenant_id, id, passage_kind)
    ON DELETE RESTRICT,

  -- relation_type allowlist.
  CONSTRAINT aromatherapy_glossary_term_passages_relation_type_chk CHECK (
    relation_type IN (
      'defines', 'supports_definition', 'variant_definition',
      'mentions', 'usage_example', 'context', 'bibliographic_reference'
    )
  ),

  -- passage_kind ↔ relation_type coupling (fail-closed).
  CONSTRAINT aromatherapy_glossary_term_passages_kind_relation_chk CHECK (
    (passage_kind = 'reference_only'
       AND relation_type = 'bibliographic_reference')
    OR (passage_kind IN ('excerpt', 'full_text')
       AND relation_type IN (
         'defines', 'supports_definition', 'variant_definition',
         'mentions', 'usage_example', 'context'
       ))
  ),

  -- verification_status allowlist.
  CONSTRAINT aromatherapy_glossary_term_passages_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified')
  ),

  -- verification metadata coupling.
  CONSTRAINT aromatherapy_glossary_term_passages_verification_meta_chk CHECK (
    (verification_status = 'unverified'
       AND verified_by IS NULL AND verified_at IS NULL)
    OR (verification_status = 'verified'
       AND verified_by IS NOT NULL AND btrim(verified_by) <> '' AND verified_at IS NOT NULL)
  )
);

-- 4) Reverse lookup index: bir passage'ın tüm terimleri + passage-FK delete-check prefix.
--    (term→passage'lar doğal UNIQUE'in (tenant_id, glossary_term_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_glossary_term_passages_reverse_idx
  ON public.aromatherapy_glossary_term_passages (tenant_id, passage_id);

-- 5) Identity guard fonksiyonu (fail-fast CREATE; CREATE OR REPLACE değil).
--    Kimlik kolonlarından herhangi biri IS DISTINCT FROM OLD ise SQLSTATE 23514 (check_violation).
--    C2J append-only trigger emsaliyle tutarlı SQLSTATE; harness öngörülebilir yakalar.
--    Aynı değeri SET eden no-op UPDATE (IS DISTINCT FROM=false) reddedilmez.
CREATE FUNCTION public.aromatherapy_glossary_term_passages_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id        IS DISTINCT FROM OLD.tenant_id
     OR NEW.glossary_term_id IS DISTINCT FROM OLD.glossary_term_id
     OR NEW.passage_id       IS DISTINCT FROM OLD.passage_id
     OR NEW.passage_kind     IS DISTINCT FROM OLD.passage_kind
     OR NEW.relation_type    IS DISTINCT FROM OLD.relation_type
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_glossary_term_passages identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 6) Identity guard trigger. Ad alfabetik olarak updated_at'ten ÖNCE (identity_guard < updated_at)
--    → kimlik-değişimi UPDATE'inde set_updated_at'ten önce 23514 fırlatır.
CREATE TRIGGER trg_aromatherapy_glossary_term_passages_identity_guard
  BEFORE UPDATE ON public.aromatherapy_glossary_term_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_glossary_term_passages_identity_guard();

-- 7) updated_at trigger — ortak public.set_updated_at() yalnız reuse.
CREATE TRIGGER trg_aromatherapy_glossary_term_passages_updated_at
  BEFORE UPDATE ON public.aromatherapy_glossary_term_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 8) Güvenlik: doğuştan-kilitli. Satır güvenliği açık; policy yok, zorlamalı mod yok.
--    anon/authenticated/PUBLIC tam REVOKE; service_role yalnız SELECT/INSERT/UPDATE/DELETE
--    (GRANT ALL DEĞİL; TRUNCATE/REFERENCES/TRIGGER verilmez).
ALTER TABLE public.aromatherapy_glossary_term_passages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_term_passages FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_glossary_term_passages TO service_role;
