-- ============================================================
-- 20260803000000_aromatherapy_claim_passages.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2L
-- Tablo: public.aromatherapy_claim_passages
--   (bir claim'in hangi KANONİK ORİJİNAL source passage tarafından hangi epistemik
--    ilişkiyle desteklendiğini/kısmen desteklendiğini/nitelendirildiğini/sınırlandığını/
--    çelişkiye uğratıldığını/bağlama oturtulduğunu tenant-safe ve denetlenebilir biçimde
--    kaydeden junction)
--
-- TEK SORUMLULUK: claim ↔ passage epistemik kanıt bağı. PASSAGE-ONLY.
--
-- GÖREV SINIRI (C2E'nin YERİNE GEÇMEZ): C2E (aromatherapy_claim_sources) claim ↔ source
--   bibliyografik/provenans seviyesidir (source_role + serbest-metin locator + kopyalanmış
--   excerpt/çeviri). C2L claim ↔ KANONİK METİN PASSAGE seviyesidir. Bu tabloda YOKTUR:
--   source_id, claim_source_id, translation_id, editorial_note_id, locator_text,
--   source_original_excerpt, faithful_translation, source_role, evidence_layer,
--   strength_score, notes, ayrı lifecycle status, revision, series_id.
--
-- CLAIM SOURCES TUTARLILIK SINIRI (KİLİTLİ): C2L DB şeması yalnız (a) tenant izolasyonunu
--   ve (b) passage_kind snapshot tutarlılığını zorlar. Bir passage'ın source_id değerinin,
--   ilgili claim için aromatherapy_claim_sources içinde atıflı olması GELECEKTEKİ service_role
--   writer/adaptör'ünün ZORUNLU INVARIANT'ıdır (C2S/C2T'de uygulanacaktır). C2L migration bu
--   sorumluluğu GENİŞLETMEZ: source_id/claim_source_id kolonu, claim_sources lookup trigger'ı
--   veya yeni parent composite UNIQUE EKLENMEZ.
--
-- PASSAGE-ONLY (C2K ile aynı ilke): terminoloji/kanıt ORİJİNAL pasajdan gelir; çeviri (C2I)
--   salt okunabilirlik katmanıdır, kanıtın yerine geçmez → translation_id YOKTUR. Editöryal
--   not/yorum (C2J) kaynak kanıtı değildir → editorial_note_id YOKTUR. reference_only passage
--   (metinsiz, yalnız locator) C2L'de YASAKTIR; bibliyografik claim↔source ilişkisi C2E'nindir.
--
-- PASSAGE_KIND SNAPSHOT + FAIL-CLOSED: junction passage_kind taşır; enhanced kompozit FK
--   (tenant_id, passage_id, passage_kind) → source_passages(tenant_id, id, passage_kind) ile
--   gerçek passage türüne pinlenir (snapshot mismatch fail-closed reddedilir).
--
-- IDENTITY IMMUTABILITY: kimlik kolonları (tenant_id, claim_id, passage_id, passage_kind,
--   evidence_relation, created_at) BEFORE UPDATE trigger'ı ile (SQLSTATE 23514) değişime
--   kapalıdır (IS DISTINCT FROM guard; aynı değeri SET eden no-op UPDATE İZİNLİDİR).
--   Yanlış bağ düzeltmesi = DELETE + yeni doğru INSERT. Güncellenebilir: verification_status,
--   verified_by, verified_at, updated_at.
--
-- Tenant-scoped: tenant_id uuid NOT NULL (tenant tablosuna FK yok — proje standardı).
--   Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role REVOKE-sonra
--   yalnız SELECT/INSERT/UPDATE/DELETE GRANT — C2K production dersi baştan gömülü; GRANT ALL
--   DEĞİL; TRUNCATE/REFERENCES/TRIGGER/MAINTAIN verilmez). Deterministik/fail-fast: düz ifadeler;
--   IF NOT EXISTS / IF EXISTS / DROP / CREATE OR REPLACE / ALTER DEFAULT PRIVILEGES / idempotent
--   telafi YOK.
--
-- Ortak public.set_updated_at() yalnız reuse (yeniden tanımlanmaz). YENİ parent aday anahtarı
--   EKLENMEZ: claims (tenant_id, id) [C2E] ve source_passages (tenant_id, id, passage_kind) [C2K]
--   hedefleri zaten mevcuttur; eski C2D/C2E/C2H/C2K migration dosyaları DEĞİŞTİRİLMEZ.
-- ============================================================

BEGIN;

-- 1) Junction tablosu (tam 11 kolon; sıra sözleşmesi kilitli).
CREATE TABLE public.aromatherapy_claim_passages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  claim_id             uuid        NOT NULL,
  passage_id           uuid        NOT NULL,
  passage_kind         text        NOT NULL,
  evidence_relation    text        NOT NULL,
  verification_status  text        NOT NULL DEFAULT 'unverified',
  verified_by          text,
  verified_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Doğal tekillik: aynı (claim, passage, epistemik ilişki) tekrar edemez; aynı (claim,passage)
  -- farklı evidence_relation'larla serbest. passage_kind doğal anahtara dahil DEĞİLDİR
  -- (enhanced FK passage'dan zaten belirler).
  CONSTRAINT aromatherapy_claim_passages_natural_key
    UNIQUE (tenant_id, claim_id, passage_id, evidence_relation),

  -- Claim bağı (tenant-safe). Claim silinince ona anlam kazanan passage bağları da silinir.
  CONSTRAINT aromatherapy_claim_passages_claim_fk
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE,

  -- Passage enhanced bağı (tenant + passage kimliği + passage_kind snapshot). Bağlı passage
  -- kanonik kaynak nesnesidir; bağlı olduğu sürece fiziksel silinemez.
  CONSTRAINT aromatherapy_claim_passages_passage_fk
    FOREIGN KEY (tenant_id, passage_id, passage_kind)
    REFERENCES public.aromatherapy_source_passages (tenant_id, id, passage_kind)
    ON DELETE RESTRICT,

  -- CHECK 1) passage_kind allowlist: yalnız gerçek metin taşıyan türler. reference_only YASAK
  --   (metinsiz bibliyografik ilişki C2E sorumluluğu).
  CONSTRAINT aromatherapy_claim_passages_passage_kind_chk CHECK (
    passage_kind IN ('excerpt', 'full_text')
  ),

  -- CHECK 2) evidence_relation allowlist (tam 6 epistemik değer; başka değer yok).
  CONSTRAINT aromatherapy_claim_passages_evidence_relation_chk CHECK (
    evidence_relation IN (
      'supports',
      'partially_supports',
      'qualifies',
      'limits',
      'contradicts',
      'contextualizes'
    )
  ),

  -- CHECK 3) verification_status allowlist.
  CONSTRAINT aromatherapy_claim_passages_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified')
  ),

  -- CHECK 4) verification metadata coupling.
  CONSTRAINT aromatherapy_claim_passages_verification_meta_chk CHECK (
    (verification_status = 'unverified'
       AND verified_by IS NULL AND verified_at IS NULL)
    OR (verification_status = 'verified'
       AND verified_by IS NOT NULL AND btrim(verified_by) <> '' AND verified_at IS NOT NULL)
  )
);

-- 2) Reverse lookup index: bir passage'ın tüm claim'leri + passage-FK delete-check prefix.
--    (claim→passage'lar doğal UNIQUE'in (tenant_id, claim_id) prefix'iyle karşılanır.)
CREATE INDEX aromatherapy_claim_passages_reverse_idx
  ON public.aromatherapy_claim_passages (tenant_id, passage_id);

-- 3) Identity guard fonksiyonu (fail-fast CREATE; CREATE OR REPLACE DEĞİL).
--    Kimlik kolonlarından herhangi biri IS DISTINCT FROM OLD ise SQLSTATE 23514 (check_violation).
--    Aynı değeri SET eden no-op UPDATE (IS DISTINCT FROM=false) reddedilmez.
CREATE FUNCTION public.aromatherapy_claim_passages_identity_guard()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id          IS DISTINCT FROM OLD.tenant_id
     OR NEW.claim_id         IS DISTINCT FROM OLD.claim_id
     OR NEW.passage_id       IS DISTINCT FROM OLD.passage_id
     OR NEW.passage_kind     IS DISTINCT FROM OLD.passage_kind
     OR NEW.evidence_relation IS DISTINCT FROM OLD.evidence_relation
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'aromatherapy_claim_passages identity columns are immutable; DELETE + re-INSERT to correct'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Identity guard trigger. Ad alfabetik olarak updated_at'ten ÖNCE (identity_guard < updated_at)
--    → kimlik-değişimi UPDATE'inde set_updated_at'ten önce 23514 fırlatır.
CREATE TRIGGER trg_aromatherapy_claim_passages_identity_guard
  BEFORE UPDATE ON public.aromatherapy_claim_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_claim_passages_identity_guard();

-- 5) updated_at trigger — ortak public.set_updated_at() yalnız reuse.
CREATE TRIGGER trg_aromatherapy_claim_passages_updated_at
  BEFORE UPDATE ON public.aromatherapy_claim_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6) Güvenlik: doğuştan-kilitli. Satır güvenliği açık; policy yok, zorlamalı mod yok.
--    anon/authenticated/PUBLIC tam REVOKE; service_role önce tam REVOKE (C2K production dersi:
--    yeni tablonun default ACL'si service_role'a geniş yetki verebilir → additif GRANT artık
--    bırakır), ardından yalnız SELECT/INSERT/UPDATE/DELETE GRANT (GRANT ALL DEĞİL;
--    TRUNCATE/REFERENCES/TRIGGER/MAINTAIN verilmez).
ALTER TABLE public.aromatherapy_claim_passages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_passages FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_passages FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aromatherapy_claim_passages TO service_role;

COMMIT;
