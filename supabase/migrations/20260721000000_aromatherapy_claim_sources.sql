-- ============================================================
-- 20260721000000_aromatherapy_claim_sources.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2E
-- Tablo: public.aromatherapy_claim_sources
--   (claim <-> source arasında açık, denetlenebilir, çoklu provenans ilişkisi;
--    junction / M:N)
--
-- Tek sorumluluk: yalnız bu junction tablo (+ iki parent aday anahtarı).
-- Doğuştan-kilitli (satır güvenliği açık + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Çapraz-tenant bağını DB düzeyinde engellemek için İKİ kompozit yabancı anahtar
--   (tenant_id, claim_id)  -> aromatherapy_claims(tenant_id, id)
--   (tenant_id, source_id) -> aromatherapy_sources(tenant_id, id);
--   bu nedenle her iki parent tabloya additif UNIQUE (tenant_id, id) aday anahtarı eklenir.
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma ifadeleri; idempotent-atlama yok
--   (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- Provenans ayrımı: junction yalnız kaynağın kendi metnini (source_original_excerpt) ve
--   sadık çevirisini (faithful_translation) taşır; editöryal açıklama/yorum burada YOK.
--   Bibliyografik kimlik (doi/pmid/isbn/document_no) kaynak tablosunda kalır, burada tekrar edilmez.
--
-- Kapsam dışı (bilinçli, ileri fazlara additif): accessed_at (kaynak/audit sorumluluğu),
--   genel note, extraction_method, machine_extracted, verified_by/verified_at, rejected,
--   yapısal locator (page/section/chapter/paragraph/table/figure), status/lifecycle,
--   visibility, claim<->claim ilişkisi, method/recipe/product provenansı.
-- ============================================================

-- 1) Parent aday anahtarları — kompozit yabancı anahtarların hedefleri (additif).
ALTER TABLE public.aromatherapy_claims
  ADD CONSTRAINT aromatherapy_claims_tenant_id_unique UNIQUE (tenant_id, id);

ALTER TABLE public.aromatherapy_sources
  ADD CONSTRAINT aromatherapy_sources_tenant_id_unique UNIQUE (tenant_id, id);

-- 2) Claim <-> source provenans junction tablosu.
CREATE TABLE public.aromatherapy_claim_sources (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL,
  claim_id                 uuid        NOT NULL,
  source_id                uuid        NOT NULL,
  source_role              text        NOT NULL,
  locator_text             text,
  url_fragment             text,
  source_original_excerpt  text,
  faithful_translation     text,
  verification_status      text        NOT NULL DEFAULT 'unverified',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Kompozit, tenant-güvenli claim bağı. Claim silinince provenans satırı da silinir.
  CONSTRAINT aromatherapy_claim_sources_claim_fk
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES public.aromatherapy_claims (tenant_id, id)
    ON DELETE CASCADE,

  -- Kompozit, tenant-güvenli source bağı. Atıflı kaynak silinemez.
  CONSTRAINT aromatherapy_claim_sources_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.aromatherapy_sources (tenant_id, id)
    ON DELETE RESTRICT,

  -- İlişkinin işlevi (kaynak türü/güvenlik boyutu değil — o evidence_layer/claim_type'ta).
  CONSTRAINT aromatherapy_claim_sources_source_role_chk CHECK (
    source_role IN ('primary_support', 'secondary_support', 'contradiction', 'context')
  ),

  -- Çıkarım doğrulama durumu (çıkarım yöntemi DEĞİL).
  CONSTRAINT aromatherapy_claim_sources_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified')
  ),

  -- Kaynak-içi konum: NULL = belge-düzeyi atıf; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_claim_sources_locator_text_chk CHECK (
    locator_text IS NULL OR btrim(locator_text) <> ''
  ),

  -- Kaynağın özgün alıntısı: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_claim_sources_original_excerpt_chk CHECK (
    source_original_excerpt IS NULL OR btrim(source_original_excerpt) <> ''
  ),

  -- Sadık çeviri: değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_claim_sources_translation_chk CHECK (
    faithful_translation IS NULL OR btrim(faithful_translation) <> ''
  ),

  -- Çeviri-özgün bağı: çeviri, özgün alıntı olmadan duramaz.
  CONSTRAINT aromatherapy_claim_sources_translation_needs_excerpt_chk CHECK (
    faithful_translation IS NULL OR source_original_excerpt IS NOT NULL
  ),

  -- Doğal tekillik. NULLS NOT DISTINCT: belge-düzeyi (locator NULL) atıf da bir kez girilebilir;
  -- farklı locator'larla aynı kaynak aynı claim'e yeniden bağlanabilir. source_role/url_fragment dahil değil.
  CONSTRAINT aromatherapy_claim_sources_identity_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, claim_id, source_id, locator_text)
);

-- Tek secondary index: bir kaynağı kullanan claim'leri listele (source-tarafı ters arama).
-- Claim-tarafı aramalar doğal unique index'in (tenant_id, claim_id) prefix'iyle karşılanır.
CREATE INDEX aromatherapy_claim_sources_tenant_source_idx
  ON public.aromatherapy_claim_sources (tenant_id, source_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_claim_sources_updated_at
  BEFORE UPDATE ON public.aromatherapy_claim_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_claim_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claim_sources FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_claim_sources TO service_role;
