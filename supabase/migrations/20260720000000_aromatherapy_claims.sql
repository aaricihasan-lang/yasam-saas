-- ============================================================
-- 20260720000000_aromatherapy_claims.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2D
-- Tablo: public.aromatherapy_claims (tek atomik, kaynaklı iddia çekirdeği;
--   yalnız tek preparasyona bağlı)
--
-- Tek sorumluluk: yalnız bu tablo (+ parent aday anahtarı).
-- Doğuştan-kilitli (satır güvenliği açık + anon/authenticated/PUBLIC REVOKE + service_role GRANT).
-- Tenant-scoped: tenant_id uuid NOT NULL (FK yok — proje standardı app-layer izolasyon;
--   kanonik public.tenants tablosu bulunmuyor).
-- Çapraz-tenant bağını DB düzeyinde engellemek için kompozit yabancı anahtar
--   (tenant_id, preparation_id) → aromatherapy_preparations(tenant_id, id);
--   bu nedenle parent tabloya additif UNIQUE (tenant_id, id) aday anahtarı eklenir.
-- Deterministik ve fail-fast: yalnız düz ekleme/oluşturma ifadeleri; idempotent-atlama yok
--   (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- Kapsam dışı (bilinçli, ileri fazlara additif): claim↔source provenans bağı
--   (source_id/locator/doi/pmid/page/section/extraction_verified/source_role → C2E),
--   popülasyon/yaş, editöryal açıklama alanları, uncertainty/evidence_gap, görünürlük
--   bayrağı, plant_taxon bağı, doğal tekillik, verified/approved/published statüleri,
--   method/recipe/component — bu tabloda yer almaz.
-- ============================================================

-- 1) Parent aday anahtarı — kompozit yabancı anahtarın hedefi (additif; C2C tablosu).
ALTER TABLE public.aromatherapy_preparations
  ADD CONSTRAINT aromatherapy_preparations_tenant_id_unique UNIQUE (tenant_id, id);

-- 2) Claim çekirdek tablosu.
CREATE TABLE public.aromatherapy_claims (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  preparation_id         uuid        NOT NULL,
  claim_type             text        NOT NULL,
  safety_topic           text,
  route                  text,
  preparation_context    text,
  conclusion             text        NOT NULL,
  conclusion_provenance  text        NOT NULL,
  outcome_type           text,
  evidence_layer         text        NOT NULL,
  rationale              text,
  rationale_status       text        NOT NULL,
  status                 text        NOT NULL DEFAULT 'draft',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Kompozit, tenant-güvenli yabancı anahtar. Claim'i olan preparasyon silinemez.
  CONSTRAINT aromatherapy_claims_preparation_fk
    FOREIGN KEY (tenant_id, preparation_id)
    REFERENCES public.aromatherapy_preparations (tenant_id, id)
    ON DELETE RESTRICT,

  -- İddia türü.
  CONSTRAINT aromatherapy_claims_claim_type_chk CHECK (
    claim_type IN ('safety', 'use', 'identity', 'chemistry')
  ),

  -- Kaynak-türevi atomik ifade boş olamaz.
  CONSTRAINT aromatherapy_claims_conclusion_chk CHECK (
    btrim(conclusion) <> ''
  ),

  -- conclusion metninin nasıl üretildiği (default yok — yazar bilinçle seçer).
  CONSTRAINT aromatherapy_claims_conclusion_provenance_chk CHECK (
    conclusion_provenance IN (
      'source_original',
      'faithful_translation',
      'editorial_explanation',
      'editorial_interpretation'
    )
  ),

  -- Kaynağın bilgi/kanıt katmanı (tüm claim türleri için zorunlu).
  CONSTRAINT aromatherapy_claims_evidence_layer_chk CHECK (
    evidence_layer IN (
      'regulatory',
      'scientific_review',
      'clinical',
      'experimental',
      'traditional',
      'experiential',
      'energetic'
    )
  ),

  -- Gerekçe durumu (Kanıt Kapısı).
  CONSTRAINT aromatherapy_claims_rationale_status_chk CHECK (
    rationale_status IN ('from_source', 'source_gives_no_rationale')
  ),

  -- rationale ↔ rationale_status eşlemesi: kaynak gerekçe vermiyorsa rationale doldurulmaz.
  CONSTRAINT aromatherapy_claims_rationale_coupling_chk CHECK (
    (rationale_status = 'from_source'
      AND rationale IS NOT NULL
      AND btrim(rationale) <> '')
    OR
    (rationale_status = 'source_gives_no_rationale'
      AND rationale IS NULL)
  ),

  -- outcome_type değer alanı (risk/sonuç ekseni).
  CONSTRAINT aromatherapy_claims_outcome_type_value_chk CHECK (
    outcome_type IS NULL
    OR outcome_type IN (
      'harm_shown',
      'risk_suspected',
      'insufficient_data',
      'no_study_done',
      'no_dose_found',
      'source_does_not_recommend',
      'source_contraindicates',
      'context_specific_non_recommendation',
      'conflicting',
      'unknown',
      'not_classified_as_risk_in_reviewed_source'
    )
  ),

  -- outcome_type ↔ claim_type iki yönlü bağlaması: safety zorunlu, non-safety NULL.
  CONSTRAINT aromatherapy_claims_outcome_type_binding_chk CHECK (
    (claim_type = 'safety'  AND outcome_type IS NOT NULL)
    OR
    (claim_type <> 'safety' AND outcome_type IS NULL)
  ),

  -- safety_topic iki yönlü bağlaması: safety ise snake_case zorunlu, non-safety ise NULL.
  -- (snake_case regex boş/whitespace/trim-dışı değerleri zaten dışlar.)
  CONSTRAINT aromatherapy_claims_safety_topic_chk CHECK (
    (claim_type = 'safety'  AND safety_topic IS NOT NULL AND safety_topic ~ '^[a-z][a-z0-9_]*$')
    OR
    (claim_type <> 'safety' AND safety_topic IS NULL)
  ),

  -- Kullanım yolu (NULL = belirtilmemiş/uygulanamaz; unknown = kaynak değindi, belirsiz).
  CONSTRAINT aromatherapy_claims_route_chk CHECK (
    route IS NULL
    OR route IN ('oral', 'topical', 'inhalation', 'other', 'unknown')
  ),

  -- Uygulama/formülasyon bağlamı: kapalı allowlist YOK; değer varsa snake_case.
  CONSTRAINT aromatherapy_claims_preparation_context_chk CHECK (
    preparation_context IS NULL
    OR preparation_context ~ '^[a-z][a-z0-9_]*$'
  ),

  -- Yaşam döngüsü: yalnız doğrulama-öncesi alt küme (verified/approved/published C2E'de).
  CONSTRAINT aromatherapy_claims_status_chk CHECK (
    status IN ('draft', 'under_review', 'needs_verification')
  )
);

-- Tek secondary index: bir preparasyonun claim'lerini listele + tenant filtreleme
-- (öncü sütun tenant_id). Kompozit FK çocuk tarafında otomatik index üretmez.
CREATE INDEX aromatherapy_claims_tenant_prep_idx
  ON public.aromatherapy_claims (tenant_id, preparation_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_claims_updated_at
  BEFORE UPDATE ON public.aromatherapy_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_claims FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_claims TO service_role;
