-- ============================================================
-- 20260801000000_yebs_concept_relation_sources.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D9 (çekirdeğin son tablosu)
-- Tablo: public.yebs_concept_relation_sources
--   (bir D8 concept relation kaydı ile bir D5 source kaydı arasındaki tek,
--    belirli provenans/pasaj bağı ve bu bağın tek evidence_layer değeri)
--
-- Tek sorumluluk: yalnız yebs_concept_relation_sources tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok, seed yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Bir satırın anlamı: tek concept relation + tek source + tek source_role +
--   tek evidence_layer + tek belirli provenans/pasaj bağı + tek
--   verification_status. Aynı relation+source farklı locator'larda, aynı
--   locator içindeki farklı bağımsız pasajlarda, farklı evidence_layer
--   bağlamlarında veya farklı source_role durumlarında birden fazla satır
--   taşıyabilir; bir satırda birden çok bağımsız pasaj/katman BİRLEŞTİRİLMEZ.
--   Satır kimliği yalnız surrogate id'dir — DB UNIQUE YOKTUR (çoğul pasaj
--   meşrudur; doğal anahtar kayıpsız ifade edilemez). Birebir mükerrerlik
--   yalnız server yumuşak uyarısıdır; otomatik birleştirme yapılmaz.
--
-- evidence_layer: bağın EPİSTEMİK BAĞLAMI — kalite puanı veya doğruluk
--   sıralaması DEĞİLDİR. NOT NULL, DEFAULT'suz, tek-değerli (array/JSON yok,
--   'other' yok); D6 claims ile aynı 9 katman. source_type'tan OTOMATİK
--   TÜRETİLMEZ ve AI tarafından atanamaz — editoryal karardır. Aynı source
--   farklı pasajlarında farklı katman taşıyabilir. Aynı pasaj gerçekten iki
--   ayrı epistemik bağlamda kullanılacaksa iki ayrı D9 satırı gerekir; bunun
--   editoryal gerekçesi gelecekteki audit/workflow katmanında tutulur,
--   rationale alanına YAZILMAZ.
--
-- source_role semantiği (kaynağın D8 relation İDDİASINA karşı konumu;
--   relation_type ile karıştırılmaz — örn. contrasted_with ilişki türüdür,
--   contradiction kaynak konumudur):
--   primary_support  kaynak ilişkiyi doğrudan kurar/ileri sürer ("ilk girilen"
--                    veya tarihsel-ilk anlamına gelmez).
--   supporting       başka şekilde kurulmuş ilişkiyi ayrıca destekler/doğrular/
--                    tekrarlar/aktarır.
--   contradiction    kaynak ilişki iddiasını AÇIKÇA reddeder/yanlışlar/çürütür.
--   context          ne kurar ne açıkça reddeder; tarihsel/kavramsal/
--                    karşılaştırmalı veya kanıt-durumu bağlamı sağlar.
--   "Yeterli kanıt yok / çalışma bulunamadı / kanıt sınırlı" ifadeleri, kaynak
--   açık bir ret sonucuna bağlamıyorsa VARSAYILAN OLARAK context'tir; kaynak
--   açıkça "savunulamaz/yanlıştır/reddedilmelidir" diyorsa contradiction
--   olabilir. Bilimin bir kavramı kendi ontolojisinde kabul etmemesi tek
--   başına otomatik contradiction değildir — kaynağın belirli D8 iddiasını
--   nasıl değerlendirdiği okunur. AI yalnız sınıflandırma adayı önerebilir;
--   kesin rol editoryal karardır.
--
-- verification_status: relation'ın mutlak doğruluğu DEĞİL — belirli
--   source/pasaj bağının doğru okunup doğru bağlandığının denetim durumu.
--   rejected satır denetim geçmişi için korunur (fiziksel silinmez) ve
--   yayın desteği sayılmaz. (D8 status = ilişki gövdesinin yayın döngüsü;
--   iki eksen bağımsızdır.)
--
-- rationale: yalnız KAYNAĞIN VERDİĞİ gerekçenin kısa editoryal temsili.
--   Editör kendi açıklamasını/yorumunu buraya YAZAMAZ (editoryal açıklama
--   D6 claim katmanında kurulur). contradiction satırı da kaynak gerçekten
--   gerekçe sunuyorsa rationale taşıyabilir. Kaynak gerekçe vermiyorsa
--   gerekçe uydurulamaz (source_gives_no_rationale + NULL).
--
-- Pasaj katmanı: transliterasyon provenance_kind değildir; faithful
--   translation editoryal yorum değildir — ikisi de pasajın yapısal sunumudur;
--   çeviriye yeni anlam eklenmez. provenance_kind kolonu D9'da YOKTUR (D9
--   metin üretmez). D7 coupling/format modeli aynen uygulanır.
--
-- Kanıt Kapısı (cross-table; server-side — DB trigger YAZILMAZ):
--   A) Bir D8 relation 'published' yapılmadan önce en az bir D9 satırı
--      BİRLİKTE source_role IN ('primary_support','supporting') AND
--      verification_status='verified' AND bağlı source.status IN
--      ('approved','published') sağlamalıdır. contradiction/context destek
--      sayılmaz; unverified/rejected destek sayılmaz; draft/verified/archived
--      source destek sayılmaz.
--   B) corresponds_to sıkı kapısı: (A)'ya ek olarak en az bir nitelikli
--      destek satırında locator_text VEYA source_original_excerpt dolu
--      olmalıdır; url_fragment TEK BAŞINA yeterli değildir. İki-kaynak
--      zorunluluğu YOKTUR (kaynak sayısı tek başına doğruluk ölçütü değildir).
--   Evidence layer'a göre yayın desteği hiyerarşisi KURULMAZ: traditional
--   veya energetic_metaphysical bağ, ilişki kendi bağlamıyla sunulduğu sürece
--   geçerli yayın desteğidir; bilimsel kanıt olarak gösterilemez.
--   scientific_review contradiction satırı relation'ı otomatik silmez ve
--   yayınını otomatik engellemez — kullanıcıya ayrı katman ve rolüyle açıkça
--   gösterilir. Bir relation hiçbir zaman D9 katmanlarından koparılarak
--   bağlamsız "evrensel doğru" olarak sunulmaz (UI/API/server invariantı).
--
-- Adlandırma notu (PostgreSQL 63-byte identifier sınırı): iki constraint adı
--   bilinçli olarak kısaltılmıştır — scheme_coupling_chk ve
--   translation_lang_coupling_chk. Tüm adlar 63 byte sınırının içindedir;
--   sessiz identifier kesilmesi yoktur.
-- ============================================================

CREATE TABLE public.yebs_concept_relation_sources (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_relation_id           uuid        NOT NULL,
  source_id                     uuid        NOT NULL,
  evidence_layer                text        NOT NULL,
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

  -- Relation'a bağ. D9, D8 gövdesinin bağımlı provenans çocuğudur; parent
  -- fiziksel silinirse bağlamı kalmaz → CASCADE. Normal emeklilik D8
  -- status='archived'; fiziksel D8 silme istisnai admin işlemidir.
  CONSTRAINT yebs_concept_relation_sources_concept_relation_fk
    FOREIGN KEY (concept_relation_id)
    REFERENCES public.yebs_concept_relations (id)
    ON DELETE CASCADE,

  -- Source'a bağ. Tarihsel/bibliyografik varlık; D9 bağı varken sessizce
  -- silinemez (emeklilik = sources.status='archived').
  CONSTRAINT yebs_concept_relation_sources_source_fk
    FOREIGN KEY (source_id)
    REFERENCES public.yebs_sources (id)
    ON DELETE RESTRICT,

  -- Bağın epistemik katmanı (D6 ile aynı 9 değer; tek-değerli; default yok).
  CONSTRAINT yebs_concept_relation_sources_evidence_layer_chk CHECK (
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

  -- Kaynağın relation iddiasına karşı konumu. Kanıt Kapısı'nda yalnız
  -- primary_support/supporting destek sayılır.
  CONSTRAINT yebs_concept_relation_sources_source_role_chk CHECK (
    source_role IN ('primary_support', 'supporting', 'contradiction', 'context')
  ),

  -- Bağ düzeyinde doğrulama. rejected satırı denetim geçmişi için korunur.
  CONSTRAINT yebs_concept_relation_sources_verification_status_chk CHECK (
    verification_status IN ('unverified', 'verified', 'rejected')
  ),

  -- Kaynağın gerekçe verip vermediği.
  CONSTRAINT yebs_concept_relation_sources_rationale_status_chk CHECK (
    rationale_status IN ('from_source', 'source_gives_no_rationale')
  ),

  -- Kanıt Kuralı (same-row): kaynak gerekçe vermiyorsa rationale doldurulamaz.
  CONSTRAINT yebs_concept_relation_sources_rationale_coupling_chk CHECK (
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
  CONSTRAINT yebs_concept_relation_sources_excerpt_language_coupling_chk CHECK (
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
  CONSTRAINT yebs_concept_relation_sources_excerpt_language_tag_chk CHECK (
    source_original_language_tag IS NULL
    OR source_original_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- Pasaj yazı sistemi biçimi (ISO-15924).
  CONSTRAINT yebs_concept_relation_sources_excerpt_script_code_chk CHECK (
    source_original_script_code IS NULL
    OR source_original_script_code ~ '^[A-Z][a-z]{3}$'
  ),

  -- Transliterasyon yalnız özgün pasaj varsa bulunabilir.
  CONSTRAINT yebs_concept_relation_sources_transliteration_excerpt_chk CHECK (
    transliteration IS NULL
    OR source_original_excerpt IS NOT NULL
  ),

  -- Transliterasyon şeması yalnız transliterasyon varsa bulunabilir (zorunlu
  -- değil). (Ad bilinçli kısa: 63-byte sınırı.)
  CONSTRAINT yebs_concept_relation_sources_scheme_coupling_chk CHECK (
    transliteration_scheme IS NULL
    OR transliteration IS NOT NULL
  ),

  -- Sadık çeviri yalnız özgün pasaj varsa bulunabilir (zincirleme çeviri engeli).
  CONSTRAINT yebs_concept_relation_sources_translation_excerpt_chk CHECK (
    faithful_translation IS NULL
    OR source_original_excerpt IS NOT NULL
  ),

  -- Çeviri ile çeviri dili çift yönlü coupling (varsayılan-Türkçe kabul
  -- edilmez). (Ad bilinçli kısa: 63-byte sınırı.)
  CONSTRAINT yebs_concept_relation_sources_translation_lang_coupling_chk CHECK (
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
  CONSTRAINT yebs_concept_relation_sources_translation_language_tag_chk CHECK (
    translation_language_tag IS NULL
    OR translation_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),

  -- Nullable text whitespace guard'ları (rationale hariç — coupling zaten zorlar).
  CONSTRAINT yebs_concept_relation_sources_locator_text_chk CHECK (
    locator_text IS NULL OR btrim(locator_text) <> ''
  ),
  CONSTRAINT yebs_concept_relation_sources_url_fragment_chk CHECK (
    url_fragment IS NULL OR btrim(url_fragment) <> ''
  ),
  CONSTRAINT yebs_concept_relation_sources_excerpt_chk CHECK (
    source_original_excerpt IS NULL OR btrim(source_original_excerpt) <> ''
  ),
  CONSTRAINT yebs_concept_relation_sources_transliteration_text_chk CHECK (
    transliteration IS NULL OR btrim(transliteration) <> ''
  ),
  CONSTRAINT yebs_concept_relation_sources_transliteration_scheme_text_chk CHECK (
    transliteration_scheme IS NULL OR btrim(transliteration_scheme) <> ''
  ),
  CONSTRAINT yebs_concept_relation_sources_faithful_translation_chk CHECK (
    faithful_translation IS NULL OR btrim(faithful_translation) <> ''
  )
);

-- Relation'ın tüm kaynak bağları + concept_relation_id CASCADE child lookup
-- (DB UNIQUE yok → açık index gerekli).
CREATE INDEX yebs_concept_relation_sources_concept_relation_idx
  ON public.yebs_concept_relation_sources (concept_relation_id);

-- Source-tarafı ters arama + source_id RESTRICT child lookup.
CREATE INDEX yebs_concept_relation_sources_source_idx
  ON public.yebs_concept_relation_sources (source_id);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_concept_relation_sources_updated_at
  BEFORE UPDATE ON public.yebs_concept_relation_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_concept_relation_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM authenticated;
REVOKE ALL ON TABLE public.yebs_concept_relation_sources FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_concept_relation_sources TO service_role;
