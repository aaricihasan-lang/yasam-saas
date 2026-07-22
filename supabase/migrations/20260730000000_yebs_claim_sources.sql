-- ============================================================
-- 20260730000000_yebs_claim_sources.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D7
-- Tablo: public.yebs_claim_sources
--   (bir atomik claim ile belirli bir bibliyografik source arasındaki
--    provenans/pasaj bağı)
--
-- Tek sorumluluk: yalnız yebs_claim_sources tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok, seed yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Bir satırın anlamı: tek claim ile tek source arasındaki TEK provenans/pasaj bağı.
--   Aynı claim+source farklı locator'larda veya aynı locator içindeki farklı
--   bağımsız pasajlarda birden fazla satır taşıyabilir; bir satırda birden çok
--   bağımsız pasaj BİRLEŞTİRİLMEZ. Satır kimliği yalnız surrogate id'dir —
--   DB UNIQUE YOKTUR (güvenilir doğal kimlik mevcut kolonlarla kayıpsız ifade
--   edilemiyor; url_fragment/çoklu-pasaj/excerpt düzeltmesi bir doğal anahtarı
--   bozar). Mükerrerlik yalnız server yumuşak uyarısıdır; sistem bağlantıları
--   otomatik birleştirmez, pasaj eşdeğerliği icat etmez.
--
-- concept_id EKLENMEZ: claim_id -> yebs_claims.concept_id ile türetilir.
--
-- D6/D7 ayrımı: D6 claim gövdesi + provenance_kind (claim_text üretimi);
--   D7 pasaj katmanı (özgün metin/dil/script + transliterasyon + sadık çeviri/
--   çeviri dili) + rationale/rationale_status + rol + doğrulama.
--
-- Kanıt Kapısı (cross-table): D7'de trigger YAZILMAZ. Bir claim 'published'
--   yapılmadan önce en az bir claim_source satırının BİRLİKTE
--     source_role IN ('primary_support','supporting')
--     AND verification_status = 'verified'
--     AND bağlı source.status IN ('approved','published')
--   sağlaması, server-side publish servisinde uygulanacaktır. Locator/excerpt
--   zorunlu değildir (belge düzeyi destek geçerli). contradiction/context/
--   unverified/rejected/archived-source/draft-source geçerli destek sayılmaz.
-- ============================================================

CREATE TABLE public.yebs_claim_sources (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                      uuid        NOT NULL,
  source_id                     uuid        NOT NULL,
  source_role                   text        NOT NULL,
  locator_text                  text,
  url_fragment                  text,
  source_original_excerpt       text,
  source_original_language_tag  text,
  source_original_script_code   text,
  transliteration               text,
  transliteration_scheme        text,
  faithful_translation          text,
  translation_language_tag      text,
  rationale                     text,
  rationale_status              text        NOT NULL,
  verification_status           text        NOT NULL DEFAULT 'unverified',
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  -- Claim'e bağ. Claim fiziksel silinirse provenans satırları da silinir.
  CONSTRAINT yebs_claim_sources_claim_fk
    FOREIGN KEY (claim_id)
    REFERENCES public.yebs_claims (id)
    ON DELETE CASCADE,

  -- Source'a bağ. Atıflı source silinemez (emeklilik = sources.status='archived').
  CONSTRAINT yebs_claim_sources_source_fk
    FOREIGN KEY (source_id)
    REFERENCES public.yebs_sources (id)
    ON DELETE RESTRICT,

  -- İlişkinin rolü. Kanıt Kapısı'nda yalnız primary_support/supporting destek sayılır.
  CONSTRAINT yebs_claim_sources_source_role_chk CHECK (
    source_role IN ('primary_support', 'supporting', 'contradiction', 'context')
  ),

  -- Bağ düzeyinde doğrulama. rejected satırı denetim geçmişi için korunur.
  CONSTRAINT yebs_claim_sources_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified', 'rejected')
  ),

  -- Kaynağın gerekçe verip vermediği.
  CONSTRAINT yebs_claim_sources_rationale_status_chk CHECK (
    rationale_status IN ('from_source', 'source_gives_no_rationale')
  ),

  -- Kanıt Kapısı (same-row): kaynak gerekçe vermiyorsa rationale doldurulamaz.
  CONSTRAINT yebs_claim_sources_rationale_coupling_chk CHECK (
    (
      rationale_status = 'from_source'
      AND rationale IS NOT NULL
      AND btrim(rationale) <> ''
    )
    OR
    (
      rationale_status = 'source_gives_no_rationale'
      AND rationale IS NULL
    )
  ),

  -- Özgün pasaj ile pasaj dili/script çift yönlü coupling:
  -- excerpt yoksa dil+script NULL; excerpt varsa dil zorunlu, script opsiyonel.
  CONSTRAINT yebs_claim_sources_excerpt_language_coupling_chk CHECK (
    (
      source_original_excerpt IS NULL
      AND source_original_language_tag IS NULL
      AND source_original_script_code IS NULL
    )
    OR
    (
      source_original_excerpt IS NOT NULL
      AND source_original_language_tag IS NOT NULL
    )
  ),

  -- Pasaj dili biçimi (gevşek BCP-47; tam doğrulama/normalizasyon server-side).
  CONSTRAINT yebs_claim_sources_excerpt_language_tag_chk CHECK (
    source_original_language_tag IS NULL
    OR source_original_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- Pasaj yazı sistemi biçimi (ISO-15924).
  CONSTRAINT yebs_claim_sources_excerpt_script_code_chk CHECK (
    source_original_script_code IS NULL
    OR source_original_script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Transliterasyon yalnız özgün pasaj varsa bulunabilir.
  CONSTRAINT yebs_claim_sources_transliteration_excerpt_chk CHECK (
    transliteration IS NULL
    OR source_original_excerpt IS NOT NULL
  ),

  -- Transliterasyon şeması yalnız transliterasyon varsa bulunabilir (zorunlu değil).
  CONSTRAINT yebs_claim_sources_transliteration_scheme_coupling_chk CHECK (
    transliteration_scheme IS NULL
    OR transliteration IS NOT NULL
  ),

  -- Sadık çeviri yalnız özgün pasaj varsa bulunabilir (zincirleme çeviri engeli).
  CONSTRAINT yebs_claim_sources_translation_excerpt_chk CHECK (
    faithful_translation IS NULL
    OR source_original_excerpt IS NOT NULL
  ),

  -- Çeviri ile çeviri dili çift yönlü coupling (varsayılan-Türkçe kabul edilmez).
  CONSTRAINT yebs_claim_sources_translation_language_coupling_chk CHECK (
    (
      faithful_translation IS NULL
      AND translation_language_tag IS NULL
    )
    OR
    (
      faithful_translation IS NOT NULL
      AND translation_language_tag IS NOT NULL
    )
  ),

  -- Çeviri dili biçimi (gevşek BCP-47).
  CONSTRAINT yebs_claim_sources_translation_language_tag_chk CHECK (
    translation_language_tag IS NULL
    OR translation_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- Nullable text whitespace guard'ları (rationale hariç — coupling zaten zorlar).
  CONSTRAINT yebs_claim_sources_locator_text_chk CHECK (
    locator_text IS NULL OR btrim(locator_text) <> ''
  ),
  CONSTRAINT yebs_claim_sources_url_fragment_chk CHECK (
    url_fragment IS NULL OR btrim(url_fragment) <> ''
  ),
  CONSTRAINT yebs_claim_sources_excerpt_chk CHECK (
    source_original_excerpt IS NULL OR btrim(source_original_excerpt) <> ''
  ),
  CONSTRAINT yebs_claim_sources_transliteration_text_chk CHECK (
    transliteration IS NULL OR btrim(transliteration) <> ''
  ),
  CONSTRAINT yebs_claim_sources_transliteration_scheme_text_chk CHECK (
    transliteration_scheme IS NULL OR btrim(transliteration_scheme) <> ''
  ),
  CONSTRAINT yebs_claim_sources_faithful_translation_chk CHECK (
    faithful_translation IS NULL OR btrim(faithful_translation) <> ''
  )
);

-- Claim'in kaynakları + claim_id CASCADE child lookup (DB UNIQUE yok → açık gerekli).
CREATE INDEX yebs_claim_sources_claim_idx
  ON public.yebs_claim_sources (claim_id);

-- Source-tarafı ters arama + source_id RESTRICT child lookup.
CREATE INDEX yebs_claim_sources_source_idx
  ON public.yebs_claim_sources (source_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_claim_sources_updated_at
  BEFORE UPDATE ON public.yebs_claim_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_claim_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_claim_sources FROM anon;
REVOKE ALL ON TABLE public.yebs_claim_sources FROM authenticated;
REVOKE ALL ON TABLE public.yebs_claim_sources FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_claim_sources TO service_role;
