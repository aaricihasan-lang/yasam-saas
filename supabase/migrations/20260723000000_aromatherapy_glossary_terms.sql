-- ============================================================
-- 20260723000000_aromatherapy_glossary_terms.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C2G
-- Tablo: public.aromatherapy_glossary_terms
--   (tek, kanonik, kararlı teknik-kavram kimliği; editöryal tanım katmanı)
--
-- Tek sorumluluk: yalnız bu tablo. Doğuştan-kilitli (RLS ENABLE + anon/authenticated/
--   PUBLIC REVOKE + service_role GRANT). Tenant-scoped: tenant_id uuid NOT NULL
--   (FK yok — proje standardı app-layer izolasyon; kanonik public.tenants tablosu yok).
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; idempotent-atlama veya nesne
--   düşürme yoktur (aynı isimli nesne zaten varsa migration hata verip durur).
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz).
--
-- KAVRAMSAL MODEL: her satır tek, kanonik ve kararlı bir KAVRAM kimliğidir. Çekirdek
--   tanımlar EDİTÖRYALDİR (kaynak cümlesi gibi sunulmaz). Kaynak metni, sadık çeviri ve
--   kaynak provenansı bu çekirdek satırda YAŞAMAZ; ayrıca tek source_id kullanılmaz —
--   provenans, sonraki faz C2H (glossary_term_sources) M:N junction'ında ele alınır.
--
-- İki tanım alanının editöryal sınırı:
--   short_definition_tr        = sade, kısa, tooltip/başlangıç seviyesi; tek başına anlaşılır.
--   professional_definition_tr = teknik kapsam, sınırlar, benzer kavramlardan fark, profesyonel
--                                ayrıntı. İki alan birbirinin KOPYASI olmamalıdır.
--
-- Kapsam dışı (bilinçli, ileri fazlara additif): domain/category/concept_type (çok bir
--   kavram birden çok bilgi alanına ait olabilir → tek-değerli sınıflama kayıplı; sonraki
--   çok-değerli additif yapıya ertelendi), source_id, claim_id, source_original_excerpt,
--   faithful_translation, synonym/abbreviation/Latince/diğer-dil etiketleri (→ C2J
--   glossary_term_labels), slug, canonical_key, stored normalize/search kolonu, usage
--   example, editorial interpretation, UNIQUE (tenant_id, id) parent aday anahtarı
--   (ilk child fazı C2H ihtiyaç duyduğunda eklenecek), global/shared kayıt modeli.
--
-- STATUS sözleşmesi (değer alanı DB CHECK; geçiş kuralları uygulama sözleşmesidir):
--   draft    = terim girildi; editöryal kalite kontrolü tamamlanmadı. Başlangıç default.
--   verified = editöryal kalite kontrolü tamamlandı. C2H (glossary_term_sources) production'a
--              çıkana dek YALNIZ bunu ifade eder. C2H sonrası verified = editöryal QC + en az
--              bir kabul edilmiş glossary_term_sources bağı olacak; eski verified kayıtlar
--              retroaktif denetlenecektir (uygulama + sonraki faz sözleşmesi; DB'de doğrulanamaz).
--   archived = yeni bağlantılarda seçilemez; eski bağlantılarda görünmeye devam eder;
--              hard delete yerine kullanılır.
-- ============================================================

CREATE TABLE public.aromatherapy_glossary_terms (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL,
  canonical_term_tr           text        NOT NULL,
  canonical_term_en           text,
  short_definition_tr         text        NOT NULL,
  professional_definition_tr  text,
  status                      text        NOT NULL DEFAULT 'draft',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Kanonik terim (TR) kimliktir: boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_terms_canonical_tr_chk CHECK (
    btrim(canonical_term_tr) <> ''
  ),

  -- İngilizce ad opsiyoneldir; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_terms_canonical_en_chk CHECK (
    canonical_term_en IS NULL OR btrim(canonical_term_en) <> ''
  ),

  -- Kısa editöryal tanım zorunludur: boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_terms_short_def_chk CHECK (
    btrim(short_definition_tr) <> ''
  ),

  -- Profesyonel editöryal tanım opsiyoneldir; değer varsa boş/whitespace olamaz.
  CONSTRAINT aromatherapy_glossary_terms_professional_def_chk CHECK (
    professional_definition_tr IS NULL OR btrim(professional_definition_tr) <> ''
  ),

  -- Yaşam döngüsü değer alanı (geçiş kuralları uygulama sözleşmesidir).
  CONSTRAINT aromatherapy_glossary_terms_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  )
);

-- Tenant içi kanonik kavram tekilliği (aynı kavramın iki kez açılmasını engeller).
-- Normalizasyon YALNIZ IMMUTABLE bileşenlerden oluşur (btrim + regexp_replace + translate
-- + lower) → expression index'te kullanılabilir; başka modül helper'ına (ör. Yaşam
-- Hafızası yh_immutable_unaccent) BAĞIMLILIK YOKTUR.
--
-- Normalizasyon sözleşmesi (deterministik; tümü IMMUTABLE bileşen):
--   1) btrim                        → baş/son boşluk temizlenir.
--   2) regexp_replace('\s+',' ','g')→ içteki çoklu whitespace teke iner.
--   3) translate('İIŞĞÇÖÜ' → 'iışğçöü') → Türkçe büyük harfler DB collation'ına
--        BIRAKILMADAN, DOĞRU Türkçe case-fold ile küçük forma iner:
--          İ=U+0130 → i (noktalı);  I=U+0049 → ı (noktasız, U+0131);
--          Ş→ş, Ğ→ğ, Ç→ç, Ö→ö, Ü→ü.
--        Küçük 'ı' ve 'i' source-set'te YOKTUR → oldukları gibi kalır. lower()'dan ÖNCE
--        yapılır: lower('İ')'nin combining-dot (i + U+0307) üretmesini ve Türkçe-locale
--        lower('I') sapmalarını locale-bağımsız bertaraf eder.
--   4) lower                        → yalnız kalan ASCII A–Z küçültülür (Türkçe harfler
--        3. adımda zaten doğru küçük forma indi; ı/i/ş/ğ/ç/ö/ü KORUNUR).
-- KAVRAM KİMLİĞİ MUHAFAZAKÂRDIR: İ↔i ve I↔ı doğru Türkçe çiftleridir; noktalı i ile
-- noktasız ı BİRLEŞTİRİLMEZ (kır≠kir, sık≠sik, ılık≠ilik, kür≠kur). Bilinçli sonuç:
-- ASCII 'I' Türkçe noktasız ı sayılır → 'INHALASYON' normalize 'ınhalasyon' olur ve
-- 'inhalasyon'dan FARKLIDIR (typo/ASCII-klavye toleransı DB kimlik katmanında değil,
-- uygulama araması / Yaşam Hafızası retrieval normalizasyonunda ele alınır). Aksan/diakritik
-- topluca KALDIRILMAZ; tire ve anlamlı noktalama korunur. Combining-dot / NFD girdi
-- (ör. I + U+0307) bu ifadede katlanmaz → giriş NFC normalizasyonu UYGULAMA giriş
-- sözleşmesidir (yalnız yazan service_role API, insert öncesi NFC üretir). Öncü sütun
-- tenant_id olduğundan tenant filtreleme için ayrıca index gerekmez.
CREATE UNIQUE INDEX aromatherapy_glossary_terms_canonical_tr_uidx
  ON public.aromatherapy_glossary_terms (
    tenant_id,
    lower(translate(regexp_replace(btrim(canonical_term_tr), '\s+', ' ', 'g'), 'İIŞĞÇÖÜ', 'iışğçöü'))
  );

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tek kullanıcı trigger'ı).
CREATE TRIGGER trg_aromatherapy_glossary_terms_updated_at
  BEFORE UPDATE ON public.aromatherapy_glossary_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural yok, zorlamalı mod yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili
-- (BYPASSRLS tablo ayrıcalığının yerine geçmediğinden açık GRANT deterministiktir).
ALTER TABLE public.aromatherapy_glossary_terms ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_terms FROM anon, authenticated, PUBLIC;
GRANT  ALL PRIVILEGES ON TABLE public.aromatherapy_glossary_terms TO service_role;
