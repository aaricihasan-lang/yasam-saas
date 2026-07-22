-- ============================================================
-- 20260727000000_yebs_concept_labels.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D4
-- Tablo: public.yebs_concept_labels (bir kavramın çok dilli ad katmanları)
--
-- Tek sorumluluk: yalnız yebs_concept_labels tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Kapsam: yalnız kimlik/adlandırma. status kolonu YOK — etiketin bağımsız
--   yayın/doğrulama yaşam döngüsü yoktur (yayın durumu concept/claim düzeyinde).
--   Açıklama, claim, source veya modül bağlantısı YER ALMAZ.
--
-- Dil/yazı: language_tag BCP-47 (gevşek biçim; dar liste yok; tam doğrulama ve
--   normalizasyon server-side), script_code ISO-15924. İlk yayın dili Türkçe;
--   mimari İngilizce ve özgün dilleri (Sanskrit/Çince/Tibetçe/Japonca) gün 1 destekler.
--
-- transliteration_scheme (tek yönlü coupling): NULL olabilir; doluysa yalnız
--   label_kind='transliteration' satırında bulunabilir ve boş olamaz. Her
--   transliterasyona şema zorunlu DEĞİLDİR.
--
-- Server-side invariant (V1'de satırlar-arası trigger YOK):
--   1) Bir concept'e transliteration/faithful_translation eklenirken, o concept'in
--      en az bir label_kind='original' etiketi bulunmalıdır; concept published
--      olmadan önce ≥1 original doğrulanır.
--   2) Concept Türkçe yayına alınırken ≥1 etiket
--      language_tag='tr' AND is_primary=true AND label_kind IN
--      ('faithful_translation','common_name') olmalıdır.
--
-- İlişki: concept_id -> yebs_concepts(id) ON DELETE CASCADE
--   → Concept silinince etiketleri otomatik silinir (bağımlı çocuk).
--
-- İndeks kararı: ayrı INDEX(concept_id) OLUŞTURULMAZ. Doğal kimlik UNIQUE'i
--   concept_id öncüllü olduğundan concept listeleme ve CASCADE child taramasını
--   karşılar. status kolonu olmadığından status index'i yoktur.
-- ============================================================

CREATE TABLE public.yebs_concept_labels (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id              uuid        NOT NULL,
  language_tag            text        NOT NULL,
  script_code             text        NOT NULL,
  label                   text        NOT NULL,
  label_kind              text        NOT NULL,
  transliteration_scheme  text,
  is_primary              boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Kavrama bağ. Concept silinince etiketler CASCADE ile silinir.
  CONSTRAINT yebs_concept_labels_concept_fk
    FOREIGN KEY (concept_id)
    REFERENCES public.yebs_concepts (id)
    ON DELETE CASCADE,

  -- BCP-47 gevşek biçim (dar dil listesi yok; tam doğrulama/normalizasyon server-side).
  CONSTRAINT yebs_concept_labels_language_tag_chk CHECK (
    language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- ISO-15924 biçim (dört harf, ilk büyük).
  CONSTRAINT yebs_concept_labels_script_code_chk CHECK (
    script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Etiket boş/whitespace olamaz.
  CONSTRAINT yebs_concept_labels_label_chk CHECK (
    btrim(label) <> ''
  ),

  -- Ad katmanı türü.
  CONSTRAINT yebs_concept_labels_label_kind_chk CHECK (
    label_kind IN (
      'original',
      'transliteration',
      'faithful_translation',
      'common_name',
      'alternative'
    )
  ),

  -- Transliterasyon şeması (tek yönlü): NULL olabilir; doluysa yalnız
  -- transliteration satırında ve boş olamaz. Her transliterasyona zorunlu değil.
  CONSTRAINT yebs_concept_labels_transliteration_scheme_chk CHECK (
    transliteration_scheme IS NULL
    OR (label_kind = 'transliteration' AND btrim(transliteration_scheme) <> '')
  ),

  -- Doğal kimlik: aynı kavram için dil+yazı+tür+etiket ikilemesini engeller.
  -- Beş sütun da NOT NULL → düz UNIQUE (NULL çözümü gerekmez).
  CONSTRAINT yebs_concept_labels_identity_key
    UNIQUE (concept_id, language_tag, script_code, label_kind, label)
);

-- Dil başına en fazla bir birincil (tercih edilen görünen) etiket.
-- script_code dahil değildir; zh-Hans/zh-Hant zaten ayrı language_tag olduğundan
-- ayrı primary olabilir.
CREATE UNIQUE INDEX yebs_concept_labels_primary_key
  ON public.yebs_concept_labels (concept_id, language_tag)
  WHERE is_primary;

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_concept_labels_updated_at
  BEFORE UPDATE ON public.yebs_concept_labels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_concept_labels ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_concept_labels FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_labels FROM authenticated;
REVOKE ALL ON TABLE public.yebs_concept_labels FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_concept_labels TO service_role;
