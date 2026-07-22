-- ============================================================
-- 20260725000000_aromatherapy_passage_translations.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2I
-- Tablo: public.aromatherapy_passage_translations
--   (bir source passage'ın original_text içeriğinin, belirli bir hedef dildeki,
--    orijinal metin sürümüne ÇIPALANMIŞ, sadık çeviri karşılığı)
--
-- Tek sorumluluk: yalnız bu tablo (+ C2H parent'a additif 4-kolon aday anahtar +
--   kendi aday anahtarı). Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC
--   REVOKE + service_role GRANT). Tenant-scoped: tenant_id uuid NOT NULL (tenant
--   tablosuna FK yok — proje standardı app-layer izolasyon).
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma; idempotent-atlama veya nesne
--   düşürme yoktur (aynı isimli nesne varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- DIRECT-FROM-ORIGINAL (KİLİTLİ ANAYASA): her çeviri DOĞRUDAN original passage'dan
--   üretilir. Tabloda source_translation_id / parent_translation_id /
--   translated_from_translation_id / supersedes_translation_id KOLONU YOKTUR →
--   çeviri-den-çeviri (ör. Çince→TR→EN) YAPISAL OLARAK İMKÂNSIZDIR. Bir çevirinin tek
--   bağı original passage'dır. Sürüm geçmişi düz integer 'revision' ile yönetilir.
--
-- Kapsam dışı (bilinçli): editöryal not/yorum/özet/kültürel açıklama (C2J), glossary↔passage
--   (C2K), claim↔passage (C2L), C2E (source_original_excerpt/faithful_translation) taşıma.
--   C2I additif kanonik çeviri katmanıdır; C2E'ye DOKUNULMAZ, veri taşıma YOKTUR.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASH SÖZLEŞMESİ (KRİTİK — migration hash ÜRETMEZ):
--   * Migration yalnız FORMAT ('^[0-9a-f]{64}$') zorlar. pgcrypto/digest KULLANILMAZ.
--   * translation_hash, service_role uygulama/API katmanında Node.js crypto ile üretilir
--     (proje doktrini: lib/yasam-hafizasi/indexer/buildCandidate.ts).
--   * translation_hash = SHA-256( translated_text'in BİREBİR UTF-8 byte dizisi ) → 64 hex.
--   * Hash öncesi OTOMATİK YAPILMAZ: trim · lowercase · Unicode normalization ·
--     whitespace collapse · punctuation replacement · line-ending transformation ·
--     dilsel normalizasyon · JSON serialization.
--   * source_passage_content_hash, parent passage.content_hash'e DÖRT-KOLON FK ile pinlenir
--     (DB-seviye sürüm çıpası): FK aynı anda tenant + passage kimliği + exact content_hash +
--     exact original_lang eşleşmesini ve reference_only passage'a çeviri EKLENEMEMESİNİ
--     (content_hash NULL → non-null child hash'e eşleşmez) zorlar.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- İMMUTABILITY / revision: verified içerik uygulama sözleşmesiyle MUTLANMAZ; düzeltme =
--   yeni revision satırı + eski verified kaydın archived'a alınması + yeni kaydın
--   review/verified sürecinden geçmesi. Translation-to-translation self-FK YOKTUR.
-- ============================================================

-- 1) Parent (C2H) 4-kolon aday anahtarı — dört-kolon FK'nin hedefi (additif).
--    (tenant_id, id) zaten tekil olduğundan bu küme trivially tekildir → mevcut veriyle
--    çakışma imkânsız. NULL content_hash (reference_only) satırları id ile ayrışır.
--    Mevcut C2H migration dosyası DEĞİŞTİRİLMEZ; bu ALTER yalnız burada bulunur.
ALTER TABLE public.aromatherapy_source_passages
  ADD CONSTRAINT aromatherapy_source_passages_tenant_id_content_lang_unique
  UNIQUE (tenant_id, id, content_hash, original_lang);

-- 2) Çeviri çekirdek tablosu.
CREATE TABLE public.aromatherapy_passage_translations (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    uuid        NOT NULL,
  passage_id                   uuid        NOT NULL,
  source_lang                  text        NOT NULL,
  target_lang                  text        NOT NULL,
  translated_text              text        NOT NULL,
  translation_hash             text        NOT NULL,
  source_passage_content_hash  text        NOT NULL,
  translation_method           text        NOT NULL,
  translation_source           text        NOT NULL,
  translator_name              text,
  provenance                   jsonb,
  fidelity                     text        NOT NULL,
  translation_rights_status    text        NOT NULL,
  rights_note                  text,
  status                       text        NOT NULL DEFAULT 'draft',
  review_status                text        NOT NULL DEFAULT 'unreviewed',
  revision                     integer     NOT NULL DEFAULT 1,
  reviewed_by                  text,
  reviewed_at                  timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  -- Dört-kolon, tenant-güvenli passage bağı: tenant + passage kimliği + exact content_hash
  -- (sürüm pin) + exact original_lang; reference_only passage'a çeviri eklenemez.
  CONSTRAINT aromatherapy_passage_translations_passage_fk
    FOREIGN KEY (tenant_id, passage_id, source_passage_content_hash, source_lang)
    REFERENCES public.aromatherapy_source_passages (tenant_id, id, content_hash, original_lang)
    ON DELETE RESTRICT,

  -- 1) source_lang: boş olamaz + BCP-47-lite guard (tam doğrulama app'te).
  CONSTRAINT aromatherapy_passage_translations_source_lang_chk CHECK (
    btrim(source_lang) <> '' AND source_lang ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
  ),

  -- 2) target_lang: boş olamaz + BCP-47-lite guard.
  CONSTRAINT aromatherapy_passage_translations_target_lang_chk CHECK (
    btrim(target_lang) <> '' AND target_lang ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
  ),

  -- 3) self-translation yasağı (case-insensitive).
  CONSTRAINT aromatherapy_passage_translations_lang_distinct_chk CHECK (
    lower(target_lang) <> lower(source_lang)
  ),

  -- 4) translated_text boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_translations_translated_text_chk CHECK (
    btrim(translated_text) <> ''
  ),

  -- 5) translation_hash: tam 64 karakter lowercase SHA-256 hex.
  CONSTRAINT aromatherapy_passage_translations_translation_hash_chk CHECK (
    translation_hash ~ '^[0-9a-f]{64}$'
  ),

  -- 6) source_passage_content_hash: tam 64 karakter lowercase SHA-256 hex.
  CONSTRAINT aromatherapy_passage_translations_source_hash_chk CHECK (
    source_passage_content_hash ~ '^[0-9a-f]{64}$'
  ),

  -- 7) translation_method allowlist.
  CONSTRAINT aromatherapy_passage_translations_method_chk CHECK (
    translation_method IN ('human', 'machine', 'machine_assisted', 'unknown')
  ),

  -- 8) translation_source allowlist (method'tan bağımsız eksen).
  CONSTRAINT aromatherapy_passage_translations_source_chk CHECK (
    translation_source IN ('internal', 'official', 'publisher', 'third_party', 'unknown')
  ),

  -- 9) provenance: değer varsa JSON object olmalıdır (dizi/skaler değil).
  CONSTRAINT aromatherapy_passage_translations_provenance_object_chk CHECK (
    provenance IS NULL OR jsonb_typeof(provenance) = 'object'
  ),

  -- 10) machine provenance coupling: method machine/machine_assisted ise provenance
  --     NOT NULL ve boş obje olamaz (obje-liği #9 zorlar). İç anahtarlar bu fazda kilitlenmez.
  CONSTRAINT aromatherapy_passage_translations_machine_provenance_chk CHECK (
    translation_method NOT IN ('machine', 'machine_assisted')
    OR (provenance IS NOT NULL AND provenance <> '{}'::jsonb)
  ),

  -- 11) fidelity allowlist (adaptive/explanatory YOK → C2J).
  CONSTRAINT aromatherapy_passage_translations_fidelity_chk CHECK (
    fidelity IN ('literal', 'faithful')
  ),

  -- 12) translation_rights_status allowlist (passage rights'ından bağımsız).
  CONSTRAINT aromatherapy_passage_translations_rights_status_chk CHECK (
    translation_rights_status IN (
      'public_domain', 'licensed', 'permission_granted', 'restricted', 'pending_review', 'unknown'
    )
  ),

  -- 13) rights_note: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_translations_rights_note_chk CHECK (
    rights_note IS NULL OR btrim(rights_note) <> ''
  ),

  -- 14) status allowlist.
  CONSTRAINT aromatherapy_passage_translations_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  ),

  -- 15) review_status allowlist.
  CONSTRAINT aromatherapy_passage_translations_review_status_chk CHECK (
    review_status IN ('unreviewed', 'in_review', 'approved', 'rejected')
  ),

  -- 16) verified coupling: verified ise review_status approved olmalı.
  CONSTRAINT aromatherapy_passage_translations_verified_coupling_chk CHECK (
    status <> 'verified' OR review_status = 'approved'
  ),

  -- 17) translator_name: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_translations_translator_name_chk CHECK (
    translator_name IS NULL OR btrim(translator_name) <> ''
  ),

  -- 18) reviewed_by: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_passage_translations_reviewed_by_chk CHECK (
    reviewed_by IS NULL OR btrim(reviewed_by) <> ''
  ),

  -- 19) review metadata coupling (review_status ↔ reviewed_by/reviewed_at).
  CONSTRAINT aromatherapy_passage_translations_review_metadata_chk CHECK (
    (review_status = 'unreviewed'
      AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status = 'in_review'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NULL)
    OR (review_status IN ('approved', 'rejected')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),

  -- 20) revision pozitif olmalı.
  CONSTRAINT aromatherapy_passage_translations_revision_chk CHECK (
    revision > 0
  )
);

-- 3) Child aday anahtar — ileride translation'a bağlanabilecek audit/not child'ları için (proaktif).
ALTER TABLE public.aromatherapy_passage_translations
  ADD CONSTRAINT aromatherapy_passage_translations_tenant_id_unique UNIQUE (tenant_id, id);

-- 4) Revision unique expression index: aynı passage + hedef dil (case-insensitive) + revision
--    tekil. Prefix (tenant_id, passage_id[, lower(target_lang)]) → "passage'ın çevirileri",
--    "passage+lang" erişimleri ve dört-kolon FK delete-check desteği aynı index'ten karşılanır.
CREATE UNIQUE INDEX aromatherapy_passage_translations_revision_uidx
  ON public.aromatherapy_passage_translations (tenant_id, passage_id, lower(target_lang), revision);

-- 5) Kanonik verified partial unique: aynı passage + hedef dil için AYNI ANDA tek verified.
--    Birden fazla draft/archived revision serbesttir.
CREATE UNIQUE INDEX aromatherapy_passage_translations_verified_uidx
  ON public.aromatherapy_passage_translations (tenant_id, passage_id, lower(target_lang))
  WHERE status = 'verified';

-- 6) updated_at trigger — ortak public.set_updated_at() yalnız reuse.
CREATE TRIGGER trg_aromatherapy_passage_translations_updated_at
  BEFORE UPDATE ON public.aromatherapy_passage_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7-9) Güvenlik: doğuştan-kilitli. Satır güvenliği açık; policy yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.aromatherapy_passage_translations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_passage_translations FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_passage_translations TO service_role;
