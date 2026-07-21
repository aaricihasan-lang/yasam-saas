-- ============================================================
-- 20260724000000_aromatherapy_source_passages.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2H
-- Tablo: public.aromatherapy_source_passages
--   (bir kaynağın belirli konumundaki, claim'den BAĞIMSIZ, kanonik ve BİREBİR
--    kaynak metni — ya da yalnız locator referansı)
--
-- Tek sorumluluk: yalnız bu tablo (+ kendi aday anahtarı + kendi self-FK'sı).
-- Doğuştan-kilitli (RLS ENABLE + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (tenant tablosuna FK yok — proje standardı
--   app-layer izolasyon; kanonik public.tenants tablosu yok).
-- Çapraz-tenant bağını DB düzeyinde engellemek için kompozit tenant-güvenli FK'ler
--   (tenant_id, source_id) -> aromatherapy_sources(tenant_id, id) ve
--   (tenant_id, supersedes_passage_id) -> aromatherapy_source_passages(tenant_id, id).
--   Bu nedenle bu tabloya additif UNIQUE (tenant_id, id) aday anahtarı eklenir
--   (C2H'de proaktif — C2I–C2L junction'ları + supersedes self-FK için).
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma ifadeleri; idempotent-atlama
--   veya nesne düşürme yoktur (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- Kapsam dışı (bilinçli, ileri fazlara additif): çeviri metni (C2I), editöryal not/özet
--   (C2J), glossary↔passage (C2K), claim↔passage (C2L), C2E inline excerpt taşıma,
--   source_role, claim_id/glossary_term_id. Bu faz yalnız kanonik passage katmanını kurar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- content_hash SÖZLEŞMESİ (KRİTİK — migration hash ÜRETMEZ):
--   * Migration yalnız FORMAT ('^[0-9a-f]{64}$') ve passage_kind coupling'ini zorlar.
--   * pgcrypto/digest KULLANILMAZ. Hash, service_role uygulama/API katmanında Node.js
--     crypto ile üretilir (proje doktrini: lib/yasam-hafizasi/indexer/buildCandidate.ts).
--   * Algoritma: SHA-256 → 64 karakter lowercase hexadecimal text.
--   * Hash girdisi: original_text değerinin BİREBİR UTF-8 byte dizisi.
--   * Hash öncesi OTOMATİK OLARAK YAPILMAZ: trim · lowercase · Unicode normalization ·
--     whitespace collapse · punctuation replacement · line-ending transformation ·
--     dilsel normalizasyon · JSON serialization.
--   * Amaç arama-normalizasyonu DEĞİL, birebir kaynak metni SÜRÜM ÇIPASIDIR (immutability
--     + çevirilerin C2I'da doğrudan-orijinale pinlenmesi). original_text değişirse hash de
--     değişir → bayat çeviri tespiti mümkün olur.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- STATUS sözleşmesi (değer alanı DB CHECK; geçiş kuralları uygulama sözleşmesidir):
--   draft = girildi, editöryal QC yok (başlangıç). verified = QC tamam.
--   archived = yeni bağlarda seçilemez; eski bağlarda görünür; hard delete yerine kullanılır.
--
-- IMMUTABILITY / supersedes: verified/referanslı passage MUTLANMAZ; düzeltme yeni passage
--   üretir ve supersedes_passage_id ile eskisini işaret eder, eski passage archived'a alınır.
--   DB yalnız self-loop'u (supersedes_passage_id <> id) engeller; ÇOK-DÜĞÜMLÜ DÖNGÜ
--   (A->B->A) kontrolü DB trigger'ı ile YAPILMAZ → service_role API / editöryal katman
--   sorumluluğudur.
-- ============================================================

CREATE TABLE public.aromatherapy_source_passages (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  source_id              uuid        NOT NULL,
  locator_label          text        NOT NULL,
  locator                jsonb,
  sort_key               numeric,
  original_lang          text        NOT NULL,
  passage_kind           text        NOT NULL,
  original_text          text,
  content_hash           text,
  rights_status          text        NOT NULL,
  rights_note            text,
  supersedes_passage_id  uuid,
  status                 text        NOT NULL DEFAULT 'draft',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Kompozit, tenant-güvenli kaynak bağı. Passage'lı kaynak silinemez.
  CONSTRAINT aromatherapy_source_passages_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.aromatherapy_sources (tenant_id, id)
    ON DELETE RESTRICT,

  -- 1) locator_label: insan-okur konum, boş/whitespace olamaz.
  CONSTRAINT aromatherapy_source_passages_locator_label_chk CHECK (
    btrim(locator_label) <> ''
  ),

  -- 2) locator: değer varsa JSON object olmak zorundadır (dizi/skaler değil).
  CONSTRAINT aromatherapy_source_passages_locator_object_chk CHECK (
    locator IS NULL OR jsonb_typeof(locator) = 'object'
  ),

  -- 3) original_lang: boş olamaz + hafif biçim guard'ı (TAM BCP-47 doğrulaması DEĞİL;
  --    gerçek BCP-47 doğrulaması ileride uygulama katmanında yapılacaktır).
  CONSTRAINT aromatherapy_source_passages_original_lang_chk CHECK (
    btrim(original_lang) <> ''
    AND original_lang ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
  ),

  -- 4) passage_kind allowlist.
  CONSTRAINT aromatherapy_source_passages_passage_kind_chk CHECK (
    passage_kind IN ('excerpt', 'full_text', 'reference_only')
  ),

  -- 5) rights_status allowlist (DEFAULT YOK — küratör açıkça seçer).
  CONSTRAINT aromatherapy_source_passages_rights_status_chk CHECK (
    rights_status IN (
      'public_domain',
      'licensed',
      'permission_granted',
      'restricted',
      'pending_review',
      'unknown'
    )
  ),

  -- 6) status allowlist.
  CONSTRAINT aromatherapy_source_passages_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  ),

  -- 7) rights_note: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_source_passages_rights_note_chk CHECK (
    rights_note IS NULL OR btrim(rights_note) <> ''
  ),

  -- 8) content_hash: değer varsa tam olarak 64 karakter lowercase SHA-256 hex.
  CONSTRAINT aromatherapy_source_passages_content_hash_format_chk CHECK (
    content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'
  ),

  -- 9) passage_kind ↔ (original_text, content_hash) coupling.
  --    reference_only → text/hash NULL; excerpt/full_text → text (dolu) + hash zorunlu.
  CONSTRAINT aromatherapy_source_passages_kind_coupling_chk CHECK (
    (passage_kind = 'reference_only'
      AND original_text IS NULL
      AND content_hash IS NULL)
    OR
    (passage_kind IN ('excerpt', 'full_text')
      AND original_text IS NOT NULL
      AND btrim(original_text) <> ''
      AND content_hash IS NOT NULL)
  ),

  -- 10) supersedes self-loop engeli (çok-düğümlü döngü app sorumluluğu).
  CONSTRAINT aromatherapy_source_passages_supersedes_not_self_chk CHECK (
    supersedes_passage_id IS NULL OR supersedes_passage_id <> id
  )
);

-- Aday anahtar — kompozit FK'lerin (kaynak + self) hedefi (additif; C2H'de proaktif).
ALTER TABLE public.aromatherapy_source_passages
  ADD CONSTRAINT aromatherapy_source_passages_tenant_id_unique UNIQUE (tenant_id, id);

-- Supersedes self-FK — kompozit tenant-güvenli (çapraz-tenant supersede engellenir).
-- MATCH SIMPLE (varsayılan): supersedes_passage_id NULL iken FK kontrolü atlanır.
-- Aday anahtardan SONRA eklenir (bağımlılık sırası).
ALTER TABLE public.aromatherapy_source_passages
  ADD CONSTRAINT aromatherapy_source_passages_supersedes_fk
  FOREIGN KEY (tenant_id, supersedes_passage_id)
  REFERENCES public.aromatherapy_source_passages (tenant_id, id)
  ON DELETE RESTRICT;

-- Tek secondary index: kaynak-scoped deterministik sıralı erişim + kaynak-FK desteği.
-- sort_key bir sayfa numarası DEĞİL, kaynak-içi deterministik sıralama anahtarıdır
-- (numeric → araya değer eklemeyi destekler). Öncü sütun tenant_id → ayrı tenant index gerekmez.
CREATE INDEX aromatherapy_source_passages_source_sort_idx
  ON public.aromatherapy_source_passages (tenant_id, source_id, sort_key);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_source_passages_updated_at
  BEFORE UPDATE ON public.aromatherapy_source_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_source_passages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_source_passages FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_source_passages TO service_role;
