-- ============================================================
-- 20260729000000_yebs_claims.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D6
-- Tablo: public.yebs_claims (bir concept hakkında tek atomik, kaynaklandırılabilir iddia)
--
-- Tek sorumluluk: yalnız yebs_claims tablosu (claim gövdesi).
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok, seed yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- D6/D7 sorumluluk ayrımı: D6 yalnız claim gövdesidir. Şunlar D7 yebs_claim_sources'a
--   aittir ve BURADA YER ALMAZ: claim<->source bağı, source rolü, locator, özgün
--   kaynak pasajı, transliterasyon, sadık çeviri, çeviri dili, rationale,
--   rationale_status, kaynak-bağlantısı doğrulaması. Bu tabloda source_id/locator YOK.
--
-- Kanıt Kapısı (cross-table): D6'da cross-table trigger YOK. status='published'
--   satırı D6 tek başına teknik olarak kabul edilebilir; ancak generic CRUD 'published'
--   yazamaz. Published claim'in en az bir geçerli yebs_claim_sources bağlantısı
--   gerektirmesi, D7 sonrası server-side publish servisinde uygulanacaktır.
--
-- Atomiklik/katman saflığı: DB tek-değerli evidence_layer NOT NULL ile bir satırın
--   tek katman taşımasını (yapısal saflık) sağlar; ancak claim_text'in tek önerme
--   taşıdığını ve katmanların metinde karışmadığını DB garanti EDEMEZ — bu editöryal/
--   server invariantıdır.
-- ============================================================

CREATE TABLE public.yebs_claims (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        uuid        NOT NULL,
  claim_type        text        NOT NULL,
  claim_text        text        NOT NULL,
  provenance_kind   text        NOT NULL,
  evidence_layer    text        NOT NULL,
  outcome_type      text,
  safety_topic      text,
  status            text        NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Kavrama bağ. Claim kaynaklı bilgi + (D7) provenans taşır → RESTRICT
  -- (CASCADE/SET NULL değil): concept'e bağlı claim varsa concept silinemez.
  CONSTRAINT yebs_claims_concept_fk
    FOREIGN KEY (concept_id)
    REFERENCES public.yebs_concepts (id)
    ON DELETE RESTRICT,

  -- Claim metni boş/whitespace olamaz.
  CONSTRAINT yebs_claims_claim_text_chk CHECK (
    btrim(claim_text) <> ''
  ),

  -- İddianın doğası.
  CONSTRAINT yebs_claims_claim_type_chk CHECK (
    claim_type IN (
      'identity',
      'function',
      'relationship',
      'practice',
      'safety',
      'research_finding'
    )
  ),

  -- claim_text'in nasıl üretildiği (metin türetme). transliteration BURADA YOK
  -- (harf-aktarımı D7 kaynak metni/pasaj katmanına aittir).
  CONSTRAINT yebs_claims_provenance_kind_chk CHECK (
    provenance_kind IN (
      'source_original',
      'faithful_translation',
      'editorial_explanation',
      'editorial_interpretation'
    )
  ),

  -- Kanıtın epistemik katmanı (tek-değerli; katmanlar tek claim'de birleştirilmez).
  CONSTRAINT yebs_claims_evidence_layer_chk CHECK (
    evidence_layer IN (
      'classical_textual',
      'traditional',
      'ethnographic',
      'clinical',
      'experimental',
      'scientific_review',
      'regulatory',
      'experiential',
      'energetic_metaphysical'
    )
  ),

  -- safety_topic iki yönlü bağlama: safety'de snake zorunlu, diğerlerinde NULL.
  CONSTRAINT yebs_claims_safety_topic_chk CHECK (
    (
      claim_type = 'safety'
      AND safety_topic ~ '^[a-z][a-z0-9_]*$'
    )
    OR
    (
      claim_type <> 'safety'
      AND safety_topic IS NULL
    )
  ),

  -- outcome_type ayrıştırması: safety zorunlu (kümesi), research opsiyonel (kümesi),
  -- diğer tüm claim türlerinde NULL zorunlu.
  CONSTRAINT yebs_claims_outcome_type_chk CHECK (
    (
      claim_type = 'safety'
      AND outcome_type IN (
        'harm_shown',
        'risk_suspected',
        'contraindicated',
        'source_does_not_recommend',
        'not_classified_as_risk',
        'insufficient_data',
        'conflicting',
        'unknown'
      )
    )
    OR
    (
      claim_type = 'research_finding'
      AND (
        outcome_type IS NULL
        OR outcome_type IN (
          'positive_finding',
          'no_effect_found',
          'mixed_findings',
          'insufficient_data',
          'no_study_done',
          'conflicting',
          'unknown'
        )
      )
    )
    OR
    (
      claim_type NOT IN ('safety', 'research_finding')
      AND outcome_type IS NULL
    )
  ),

  -- Yayın yaşam döngüsü (geçişler server-side; generic CRUD 'published' yazamaz).
  -- archived = fiziksel silme değil; provenans korunur, normal kullanıcı görünümünde gizlenir.
  CONSTRAINT yebs_claims_status_chk CHECK (
    status IN (
      'draft',
      'under_review',
      'needs_verification',
      'verified',
      'approved',
      'published',
      'archived'
    )
  )
);

-- FK RESTRICT child lookup + bir concept'in claim'lerini listeleme.
-- (concept_id öncüllü unique yok → açık index gerekli.)
CREATE INDEX yebs_claims_concept_idx
  ON public.yebs_claims (concept_id);

-- Statüye göre yayın filtreleme (ör. yalnız published claim'ler).
CREATE INDEX yebs_claims_status_idx
  ON public.yebs_claims (status);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_claims_updated_at
  BEFORE UPDATE ON public.yebs_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_claims FROM anon;
REVOKE ALL ON TABLE public.yebs_claims FROM authenticated;
REVOKE ALL ON TABLE public.yebs_claims FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_claims TO service_role;
