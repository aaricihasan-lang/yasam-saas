# Aromaterapi Bilgi Sistemi V2 — Nihai Veri Sözlüğü & Enum Sözleşmeleri

- **Belge:** Aromaterapi V2 — Veri Sözlüğü ve Enum Sözleşmeleri
- **Sürüm:** v1.2 (C2A uyumu: source_kind→source_type, source status draft/verified/archived, C2A çekirdek alan kilidi, unique/dedup ertelendi) · v1.1 (provenance_type, güvenli "not_classified", ortak source_locator, V2 product kilidi)
- **Durum:** Mimari sözleşme / FAZ C — C1
- **Son güncelleme:** 2026-07-18
- **Kapsam:** Aromaterapi Bilgi Sistemi V2 için kavramsal/mantıksal veri sözleşmesi; varlıklar, alanlar, provenans, enum'lar, yaşam döngüsü, C2A migration kapsamı önerisi.
- **Kapsam dışı:** kod, TypeScript tipi, SQL, migration, fiziksel şema, API/UI, hesaplama motoru, gerçek pilot verisi.

> **Bu belge fiziksel şema DEĞİLDİR.** Burada yazılan her mantıksal alanın bire bir SQL kolonu olacağı varsayılmaz. Bir alan; **fiziksel kolon**, **JSONB yapı**, **junction kayıt**, **türetilmiş değer** veya **kod sözleşmesi** olarak uygulanabilir. Fiziksel tablo/kolon kararları **C2**'de, bu belgeye dayanılarak ve doğrulanarak verilir.
>
> **FAZ B kararları kilitlidir** (method_variant tek kaynaklı; recipe tek kanonik referans partili; guide ayrı child; calculation profile V1'de ayrı üst varlık değil; süre/sıcaklık ölçeklenmez; doğrulanmamış kapalı-basınçlı ev düzeneği tarif edilmez; verified/public/calculation ayrı; kaynaksız gramaj verified olamaz).

---

## 1. Temel sözleşme ilkeleri

1. **Bilginin birimi "kaynaklı ifade"dir** (claim), "yağ alanı" değil.
2. **Provenans korunur:** kaynak-türevi içerik ile editöryal açıklama asla aynı alanda erimez.
3. **Bağlam korunur:** her bilgi hangi varlık/seviye, hangi yol, hangi ürün-bağlamı, hangi popülasyon için geçerliyse onunla saklanır.
4. **Katman ≠ kanıt gücü:** `evidence_layer` (bilgi yolu) ile kanıt gücü/`outcome_type` ayrı boyutlardır.
5. **Kaynaksız sayısal değer `verified` olamaz;** kaynaksız gerekçe editör tarafından uydurulamaz.
6. **Tek doğru kaynağı korunur:** hesaplanabilir sayısal gerçek yalnız recipe'te yaşar; method_step anlatımı bunu tekrar etmez, referans verir.

---

## 2. Varlık haritası (üst bakış)

```
plant_taxon (kanonik botanik)
  └─< product (V2 ürün varlığı: yağ/çiçek/hidrosol/absolü…)
        ├─< component (yapısal bileşim)
        ├─< claim (atomik kaynaklı ifade + güvenlik)
        │     └─(junction)─ source (+ locator)
        │     └─(relation)─ başka claim
        └─< method_variant (tek kaynaklı yöntem)
              ├─< method_step (sıralı anlatım)
              ├─< method_guide (overview/beginner/practical/professional)
              └─< recipe (tek kanonik referans parti)
                    ├─< ingredient_line (→ material)
                    └─< process_parameter
source · source_locator · glossary_term · material · relation  → paylaşılan/referans varlıklar
```

Tüm V2 varlıkları **tenant-scoped** (bkz. §18). Motor (hesaplama) **veri değil koddur**, bu belgede yalnız veri sözleşmesi tanımlanır.

---

## 3. Varlık sözlüğü

Her varlık için: Amaç · Kapsam / Kapsam dışı · Üst varlık · Alt kayıtlar · Tenant · Provenans · Yaşam döngüsü · Zorunlu/Opsiyonel/Türetilmiş alanlar · Yayın engelleri · Hesaplama ilişkisi · Karıştırılmama sınırı · Olası fiziksel biçim · C2 zorunlu mu.

### 3.1 plant_taxon
- **Amaç:** kanonik botanik kimlik (tür karışıklığı bir güvenlik riskidir).
- **Kapsam:** takson kimliği, sinonim, familya. **Kapsam dışı:** ürün/preparasyon, kimya, güvenlik.
- **Üst varlık:** yok. **Alt:** product.
- **Tenant:** tenant-scoped (Faz C). **Provenans:** kaynaklı (Kew/WFO).
- **Yaşam döngüsü:** draft→verified→approved.
- **Zorunlu:** `scientific_name`, `family`, `genus`, `species`, `status`, `source_ref`. **Opsiyonel:** `author_citation`, `accepted_name`, `synonyms`, `subspecies_or_variety`, `common_names_tr`.
- **Türetilmiş:** yok.
- **Karıştırılmama:** taksona ait **botanical_family burada kanoniktir; üründe tekrar tutulmaz** (§17).
- **Fiziksel biçim:** çekirdek kolonlar + `synonyms`/`common_names_tr` JSONB veya text[].
- **C2:** C2B (C2A değil).

### 3.2 product (V2 ürün varlığı)
- **Amaç:** taksondan elde edilen belirli preparasyon/ürün türü (yağ/çiçek/hidrosol/absolü…) — claim/method/recipe bu varlığa bağlanır.
- **Kapsam:** ürün kimliği + kaynak-materyal bağlamı. **Kapsam dışı:** botanik takson detayı (taxon'da), tekil iddialar (claim'de).
- **Üst varlık:** plant_taxon. **Alt:** component, claim, method_variant.
- **Tenant:** tenant-scoped. **Provenans:** kaynaklı.
- **Zorunlu:** `taxon_ref`, `product_type`, `status`. **Opsiyonel:** `plant_part`, `chemotype`, `extraction_method`, `origin`, `product_context`.
- **Karıştırılmama:** **legacy `aromatherapy_oils` ile aynı değildir** — bkz. §17 (öneri: yeni varlık, legacy'e dokunma).
- **Fiziksel biçim:** yeni tablo (öneri) — legacy reuse **değil**.
- **C2:** C2B/C2C (C2A değil).

### 3.3 source
- **Amaç:** kanonik kaynak künyesi; bir kez tanımlanır, çok kayıt atıflar.
- **Kapsam:** bibliyografik kimlik + doğrulama boyutları. **Kapsam dışı:** belge içi konum (bu `source_locator` işi), iddia içeriği.
- **Üst varlık:** yok. **Alt:** source_locator; claim/method/recipe junction'ları.
- **Tenant:** tenant-scoped (Faz C; gelecekte paylaşımlı promotion additif — §18).
- **Belge türü alanı:** **`source_type`** (C1'de `source_kind` idi → C2A'da `source_type` olarak standartlaştırıldı; bkz. §22). Değerler §6-O. `source_type` ≠ `evidence_layer` (biri belge biçimi, diğeri kaynağın bilgi/kanıt katmanı — karıştırılmaz).
- **C2A çekirdek alanları (KİLİTLİ):**
  - **Zorunlu (7):** `id`, `tenant_id` (**NOT NULL, FK yok** — proje standardı app-layer izolasyon; kanonik `tenants` tablosu yok), `source_type`, `title`, `status`, `created_at`, `updated_at`.
  - **İlk migration'da nullable-dahil (9):** `authors`, `organization`, `publication_year`, `doi`, `pmid`, `isbn`, `url`, `document_no`, `notes`.
  - **Ertelenen (additif):** `publication_title`, `publisher`, `publication_date`, `edition`, `volume`, `issue`, `pages`, `language_code`, `citation_text`, `accessed_at`, `created_by`, `updated_by`, `primary_or_secondary`, `independent_group`, `bibliographic_verified`, `full_text_accessed`, `official_url_verified`.
- **Status (source'a özel — tam `content_status` DEĞİL):** `draft · verified · archived` (§6-P). `rejected`, `public_visible`, `calculation_enabled` **source'ta kullanılmaz**.
- **Tekilleştirme (dedup):** C2A'da **DOI/ISBN/PMID için unique constraint kararı verilmedi.** DOI (`https://doi.org/…`/`doi:…`/yalın) ve ISBN (ISBN-10/13/tire) güvenli normalizasyon gerektirdiğinden, naif unique yanlış-güven yaratır → **sonraki API/normalizasyon turuna ertelendi.** C2A'da yalnız **UUID PK + `(tenant_id)` index.**
- **source_locator C2A DIŞINDA** (§3.4): source tablosuna `locator`/`original_excerpt`/`url_fragment` kolonu **eklenmez**; source **belge-düzeyi künye** kalır.
- **Legacy `aromatherapy_oils` ile fiziksel bağ yok** (§14).
- **C2:** **C2A — evet (temel; doğuştan-kilitli, tek migration).** *Migration henüz yazılmadı.*

### 3.4 source_locator (ORTAK provenans sözleşmesi)
- **Amaç:** bir kaynağın **içindeki** konumu (`§4.2`, `Table 1`, `s.219`). **Claim'e özgü DEĞİLDİR** — ortak provenans sözleşmesidir.
- **Kullanan varlıklar (hepsi):** `claim`, `method_variant`, `method_step`, `method_guide` (kaynak dayanağı), `recipe`, `recipe_ingredient_line`, `recipe_process_parameter`, `glossary_term`, ilerideki `material_property`.
- **Taşıyabileceği kavramlar:** `page`, `section`, `chapter`, `table`, `figure`, `paragraph`, `url_fragment`, `accessed_at`, `locator_text`, `original_excerpt` (+ `extraction_verified`, junction'ta `role`).
- **Fiziksel biçim (C2/C3'te seçilecek — bu belge kesinleştirmez):** (a) ilişki/junction üzerinde doğrudan locator alanları, (b) ortak `source_locator` child kaydı, veya (c) kaynak-junction'ında locator. Her kavramın fiziksel kolon olacağı **varsayılmaz**.
- **C2:** **C2A'nın yalnız `source` olması kararı değişmez**; source_locator ilk kullanan varlıkla (claim/method/recipe) birlikte gelir, ama **modeli en baştan ortak** tasarlanır (claim'e özel değil).

### 3.5 claim
- **Amaç:** tek kaynak iddiası / güvenlik sonucu / kanıt cümlesi.
- **Kapsam:** tek atomik ifade + açıklayıcı katman. **Kapsam dışı:** çok adımlı yöntem (method_variant), miktar tarifi (recipe).
- **Üst varlık:** product (entity_ref seviyeli). **Alt:** claim_source (junction), relation.
- **Tenant:** tenant-scoped, **asla null**.
- **Provenans:** karışık — kaynak-türevi (conclusion/rationale/excerpt) + editöryal (plain_language/interpretation/editorial) alan bazında işaretli.
- **Yaşam döngüsü:** §10.
- **Alan sözlüğü:** §11.
- **Karıştırılmama:** method/recipe **değildir**.
- **Fiziksel biçim:** çekirdek kolonlar + `technical_term_refs` junction/array + populations junction.
- **C2:** C3 (C2A değil).

### 3.6 claim_source (provenans ilişkisi)
- **Amaç:** claim ↔ source çoktan-çoğa; locator + doğrulama taşır.
- **Alanlar:** `claim_ref`, `source_ref`, `locator`, `extraction_verified`, `role(primary/auxiliary)`.
- **Fiziksel biçim:** **junction tablo.** **C2:** C3.

### 3.7 relation
- **Amaç:** claim↔claim veya method_variant↔method_variant kontrollü ilişki.
- **Alanlar:** `a_ref`, `b_ref`, `relation_type`, `explanation_tr`, `explanation_source_based(bool)`, `reviewer_note`.
- **Kural:** `explanation_source_based=false` ise UI neden göstermez (AI neden uydurmaz).
- **Fiziksel biçim:** junction/ilişki tablo. **C2:** C3/C4.

### 3.8 glossary_term
- **Amaç:** teknik terimin merkezî tanımı (fototoksisite, sensitizasyon, kemotip, GC/MS…).
- **Kapsam:** terim + sade tanım + kaynak. **Kapsam dışı:** yağ-özel içerik.
- **Kural:** her claim/rehberde tekrar edilmez; **referansla** kullanılır.
- **Tenant:** tenant-scoped (Faz C). **Fiziksel biçim:** küçük referans tablo.
- **C2:** C2C (C2A değil) — ortak Bilgi Bankası ile birlikte olgunlaşır.

### 3.9 component (yapısal bileşim)
- **Amaç:** ürünün kimyasal bileşenleri (ad+%+aralık+CAS+marker).
- **Üst varlık:** product. **Zorunlu:** `component_name`, `source_ref`. **Opsiyonel:** `cas`, `pct_min`, `pct_max`, `pct_typical`, `is_marker`, `chemical_class`.
- **Karıştırılmama:** kemotip **takson alanı değildir**; bileşim materyal/ürün/partiye aittir.
- **Fiziksel biçim:** child tablo. **C2:** C3 sonrası (Lavanta içeriğiyle).

### 3.10 material
- **Amaç:** recipe malzemelerinin kanonik referansı (kuru bitki, taşıyıcı yağ…).
- **Kapsam (V1 minimum):** `canonical_name_tr`, `material_category`, `default_dimension`, `status`. **Kapsam dışı (ertelenmiş):** yoğunluk (bkz. §16).
- **Fiziksel biçim:** küçük referans tablo. **C2:** C6 civarı (recipe ile).

### 3.11 method_variant
- **Amaç:** **belirli bir ana kaynağın** yöntem varyantı.
- **Kapsam:** yöntem başlığı + ana kaynak + bağlam. **Kapsam dışı:** farklı kaynakların yöntemi (ayrı variant), miktar (recipe), seviye anlatımı (guide).
- **Üst varlık:** product. **Alt:** method_step, method_guide, recipe.
- **Provenans:** ana kaynak `is_primary_method_source`; yardımcı kaynaklar ayrı işaretli.
- **Alan sözlüğü:** §12.
- **C2:** C4.

### 3.12 method_step
- **Amaç:** method_variant içindeki **sıralı, anlatısal** işlem adımı.
- **Kural:** hesaplanabilir sayısal gerçek burada **saklanmaz**, recipe'e **referans** verir (§12, tek-doğru-kaynağı).
- **C2:** C4.

### 3.13 method_guide
- **Amaç:** aynı yöntemin `guide_level`'a göre açıklayıcı anlatımı.
- **Kural:** **kaynak cümlesi gibi sunulmaz** (editöryal katman); kaynak dayanakları referansla gösterilir.
- **Alan sözlüğü:** §13.
- **C2:** C5.

### 3.14 recipe
- **Amaç:** kaynaklı miktar/oran/proses taşıyan **uygulanabilir referans tarif**.
- **Kural:** tek kanonik referans parti; farklı proses ölçeği **ayrı recipe**; method_variant **değildir**.
- **Alan sözlüğü:** §14.
- **Hesaplama:** `calculation_enabled` koşulları (§14).
- **C2:** C6.

### 3.15 recipe_ingredient_line
- **Amaç:** recipe'teki tek malzeme satırı.
- **Alan sözlüğü:** §15. **C2:** C6.

### 3.16 recipe_process_parameter
- **Amaç:** süre/sıcaklık/ışık/kap/ekipman koşulu — hesaplanabilir veya kategorik.
- **Alan sözlüğü:** §15. **C2:** C6.

---

## 4. Varlık sınırları (kesin sözleşme)

| Varlık | Nedir | Ne DEĞİLDİR |
|---|---|---|
| **claim** | tek kaynak iddiası/güvenlik sonucu | çok adımlı yöntem |
| **method_variant** | tek ana kaynağın yöntemi | farklı kaynakların karışımı; recipe |
| **method_step** | sıralı anlatısal işlem | hesaplanabilir sayısal gerçeğin sahibi |
| **method_guide** | seviye-bazlı açıklama (editöryal) | kaynak cümlesi |
| **recipe** | uygulanabilir miktar/proses tarifi | method_variant |
| **ingredient_line** | tek malzeme satırı | proses koşulu |
| **process_parameter** | proses koşulu | malzeme |
| **glossary_term** | merkezî terim tanımı | yağ-özel içerik |
| **relation** | kontrollü ilişki | serbest yorum |

---

## 5. Provenans modeli

**Kaynak-türevi alanlar:** `conclusion`, `rationale`, `original_excerpt`, `faithful_translation`, `locator`, kaynaklı miktarlar, kaynaklı proses koşulları.
**Editöryal alanlar:** `plain_language_explanation`, `interpretation_note`, `editorial_note`, seviye-bazlı rehber anlatımı.

**Kurallar:**
- Editöryal içerik **kaynak cümlesi gibi gösterilmez**.
- Kaynak gerekçe vermiyorsa `rationale` **doldurulmaz** → `rationale_status = source_gives_no_rationale`.
- Her sayısal tarif değeri `source_ref + locator` taşır.
- Ana yöntem kaynağı ↔ yardımcı kaynak `is_primary_method_source` / junction `role` ile ayrılır.
- Çeviri durumu ayrıca (`translation_status`) tutulur.

**`provenance_type` (içeriğin nasıl üretildiği):** her metinsel içerik parçası bir provenans sınıfı taşır — `source_original · faithful_translation · editorial_explanation · editorial_interpretation`. **`editorial_*` asla `evidence_layer` değildir** (§6-C₂).

**`provenance_type` ↔ `translation_status` görev sınırı:**
- `translation_status` = **çeviri sürecini** gösterir (orijinal dil / sadık çeviri / yapısal çıkarım / editöryal yeniden ifade / makine-yardımı-inceleme-bekliyor).
- `provenance_type` = **içeriğin kaynak/editöryal niteliğini** gösterir (kaynağın özgün ifadesi mi, sadık çeviri mi, editöryal açıklama mı, editöryal yorum mu).
- İkisi ortogonaldir: bir alan `provenance_type=faithful_translation` iken `translation_status=faithful_translation` uyumlu; ama `provenance_type=editorial_explanation` bir **çeviri değildir**, editöryal üretimdir.

**Önerilen uygulama (fiziksel değil, tavsiye):** provenans **alan bazlı** en güvenlidir — her metinsel alan sabit bir `provenance_type` sınıfına aittir, böylece bir kayıtta kaynak ve editöryal içerik yan yana durur ama karışmaz. Kaynak atfı ise **junction bazlıdır** (claim_source: locator + role). Kayıt-bazlı tek provenans yetersizdir (bir claim hem kaynak hem editöryal alan taşır).

---

## 6. Enum sözleşmeleri

Her enum: anahtar · Türkçe anlam · kullanım yeri · fark · yasak yanlış kullanım · genişletme kuralı. Uygulama stratejisi §19.

### A) product_type
`essential_oil · hydrosol · maceration_oil · carrier_oil · absolute · co2_extract · tincture · ointment · cream · other`
- **Kullanım:** product.product_type; method.output_product.
- **Yasak:** maserasyon yağını `essential_oil` göstermek.
- **Genişletme:** yeni gerçek ürün türü çıkınca additif eklenir (`other` geçici sığınak değil, kalıcı çöp değil).

### B) guide_level
`overview · beginner · practical · professional`
- **Fark:** overview=30 sn tanıtım; beginner=yeni başlayan; practical=küçük ölçek uygulama; professional=ticari/ileri.
- **Yasak:** professional'ı kimya-kitabı diliyle yazmak; seviyeleri kopuk 3 makale yapmak.

### C) evidence_layer (kaynağın bilgi/kanıt katmanı — minimum liste)
`regulatory · scientific_review · clinical · experimental · traditional · experiential · energetic`
- **Nihai minimum anahtarlar:** `regulatory` (EMA/WHO/EFSA/farmakope değerlendirmesi) · `scientific_review` (meta-analiz/sistematik derleme) · `clinical` (RCT/klinik/insan birincil) · `experimental` (hayvan/in vitro) · `traditional` (geleneksel fitoterapi + resmi geleneksel tıp sistemleri) · `experiential` (uzman/aromaterapi referans deneyimi — Tisserand/Battaglia/Worwood pratiği) · `energetic` (çakra/element/enerjetik).
- **`editorial` BURADA YOKTUR.** Editöryal sadeleştirme/yorum bir kanıt katmanı **değildir** → `provenance_type` ile temsil edilir (§6-C₂ ve §5).
- **Yasak:** katmanların birini diğerinden **otomatik üstün** saymak; UI'da karıştırmak; `energetic`i klinik gibi sunmak (`energetic` zorunlu "bilimsel klinik kanıt değildir" etiketi taşır).
- **Not:** bu katman **kanıt gücü değildir**; güç `outcome_type`/`evidence_assessment` ile ayrı boyutta tutulur.
- **Genişletme:** yeni gerçek katman çıkarsa additif eklenir; mevcut anlamlar bozulmaz.

### C₂) provenance_type (içeriğin nasıl üretildiği — evidence_layer DEĞİL)
`source_original · faithful_translation · editorial_explanation · editorial_interpretation`
- **Kullanım:** her metinsel içerik alanının provenansını işaretler (claim.conclusion/rationale=source_original veya faithful_translation; plain_language/interpretation=editorial_*).
- **Fark:** `source_original`=kaynağın özgün ifadesi/alıntısı; `faithful_translation`=anlam değişmeden Türkçe; `editorial_explanation`=sade anlatım; `editorial_interpretation`=ne anlama gelir/gelmez yorumu.
- **Yasak:** `editorial_*` içeriği kaynak cümlesi gibi göstermek; `provenance_type`'ı `evidence_layer` yerine kullanmak.
- **`translation_status` ile sınır:** `translation_status`=**çeviri süreci**; `provenance_type`=**kaynak/editöryal nitelik** (§5). Editöryal üretim bir çeviri değildir.

### D) outcome_type
`harm_shown · risk_suspected · insufficient_data · no_study_done · no_dose_found · source_does_not_recommend · source_contraindicates · context_specific_non_recommendation · conflicting · unknown · not_classified_as_risk_in_reviewed_source`
- **Anahtar:** `not_classified_as_risk_in_reviewed_source` — "**incelenen kaynak, ilgili risk başlığını gerçekten değerlendirmiş** ve o riski sınıfına **almamış**" anlamı.
- **Kesin kurallar:**
  - **Yalnız kaynak ilgili risk başlığını gerçekten değerlendirmişse** kullanılır.
  - **Kaynağın konuya hiç değinmemesi** bu outcome'u **üretmez** (o durum `unknown` / `insufficient_data`).
  - **Kaynak sessizliği = doğrulama değildir.**
  - "Güvenlidir", "risk yoktur" veya mutlak "fototoksik değildir" **anlamına gelmez**.
  - Kullanım yolu, preparasyon bağlamı ve incelenen kaynak kapsamı **sonuç cümlesinde korunur**.
  - UI cümlesi örneği: *"İncelenen kaynakta, topikal kullanım bağlamında fototoksik risk sınıfında değerlendirilmemiştir."* (dry-run §18-B).
- **Diğerlerinden farkı:** `harm_shown`=zarar **gösterildi**; `insufficient_data`=konu değerlendirildi ama **veri yetersiz**; `no_study_done`=**çalışma yapılmamış**; `unknown`=**bilinmiyor / kaynak hiç değinmemiş**; `not_classified_as_risk_in_reviewed_source`=**kaynak değerlendirdi, o riske sınıflandırmadı** (ama "güvenli" demedi).
- **Kesin kural:** `insufficient_data / no_study_done / no_dose_found / not_classified_as_risk_in_reviewed_source` **asla** `harm_shown` gibi sunulmaz.

### E) rationale_status
`from_source · source_gives_no_rationale`

### F) relation_type
`complementary · alternative · partially_overlapping · conflicting · context_specific`

### G) content_status (İÇERİK varlıkları — claim/method/recipe/guide)
`draft · under_review · needs_verification · verified · approved · published · archived · rejected`
- **Kapsam:** bu tam sözlük **içerik/yayın** varlıkları içindir (claim, method_variant, method_guide, recipe). **`source` bu tam sözlüğü KULLANMAZ** → source'a özel alt-küme §6-P.
- **verified:** içerik **kaynağa karşı doğruluğu** denetlendi (doğruluk kapısı).
- **approved:** bir yetkili/inceleyen **kullanım için onayladı** (yönetişim kapısı).
- **published:** ürün yüzeyinde **erişime açıldı** (görünürlük yaşam döngüsü).
- Sıra: verified (doğruluk) → approved (yönetişim) → published (yayın). Bir içerik verified olup henüz approved/published olmayabilir.

### O) source_type (source belge türü — C2A KİLİTLİ)
`book · journal_article · regulatory_document · monograph · standard · database_record · website · other`
- **Kullanım:** yalnız `source.source_type` (belge biçimi). text + CHECK.
- **`source_type` ≠ `evidence_layer`:** biri belgenin **türünü/biçimini**, diğeri kaynağın **bilgi/kanıt katmanını** taşır — karıştırılmaz.
- **Genişletme:** yeni gerçek belge türü çıkınca additif eklenir (`guideline`→regulatory_document; `manufacturer_document/thesis/conference_paper` = ileriki sürüm adayı, aktif C2A sözleşmesine dahil değil).

### P) source status (source kayıt yaşam döngüsü — C2A KİLİTLİ; content_status DEĞİL)
`draft · verified · archived` (default `draft`)
- **draft:** künye girişi veya bibliyografik doğrulaması tamamlanmamıştır.
- **verified:** kaynağın **bibliyografik kimliği, künye bilgileri ve mümkünse erişim bilgisi** doğrulanmıştır. **Kaynağın içindeki iddiaların bilimsel doğruluğu ANLAMINA GELMEZ.**
- **archived:** kaynak aktif seçim ve yeni ilişkilendirmelerde kullanılmaz; geçmiş ilişkiler ve provenans korunur.
- **Açık sınırlar:** source status **claim evidence değerlendirmesi değildir**; `verified` **bilimsel doğruluk onayı değildir**; source için **`public_visible`/`calculation_enabled` kullanılmaz**; **`rejected`**, C2A iş akışında archived'dan farklı bir süreç kanıtlanamadığı için **kullanılmaz** (gerekirse ileride additif).

### H) translation_status
`original_language · faithful_translation · close_paraphrase · structured_extraction · editorial_paraphrase · machine_assisted_pending_review`
- **faithful_translation:** anlam değişmeden sadık çeviri. **structured_extraction:** tablodan yapısal çıkarım. **editorial_paraphrase:** editöryal yeniden ifade (kaynak cümlesi değil). **machine_assisted_pending_review:** makine yardımı, insan incelemesi bekliyor.

### I) scaling_behavior
`proportional · fixed · bounded · formula_based · equipment_dependent · not_scalable · unknown`

### J) calculation_type
V1: `forward · inverse`.
- **Karar:** **birim dönüşümü, yuvarlama ve uyarı `calculation_type` DEĞİL, motor davranışıdır** (her hesapta çalışan yatay yetenek). Enum yalnız kullanıcı-niyeti yönünü (ileri/ters) taşır. `target_output` ve `ratio` V1-dışı/ertelenmiş.

### K) batch_scale_level
`home · small_workshop · professional · industrial`

### L) outside_validated_range_behavior
`block · calculate_with_warning · display_reference_only`
- **block:** aralık dışında hesap yok. **calculate_with_warning:** hesapla + uyarı (varsayılan). **display_reference_only:** yalnız referansı göster, ölçekleme yok.

### M) material_role
`primary_material · carrier · solvent · active_component · auxiliary · preservative · other` (gereksiz genişletme yok).

### N) quantity_type
`exact · range · approximate · ratio · percentage · as_needed`

---

## 7. Boolean ve yaşam döngüsü bayrakları

- **`verified_content`** → **türetilmiş** öneri: `content_status ∈ {verified, approved, published}` ise true. Ayrı fiziksel boolean **önerilmez** (çift-doğru-kaynağı riski).
- **`public_visible`** → **fiziksel boolean** (görünürlük kapısı; yayın-lifecycle'dan bağımsız açılıp kapanabilir).
- **`calculation_enabled`** → **fiziksel boolean** (hesaplanabilirlik kapısı; §14 koşullarına bağlı guard).

**Geçiş matrisi (önerilen):**

| Durum kombinasyonu | İzin |
|---|---|
| draft + public_visible=true | ❌ (yayınlanmadan görünmez) |
| verified + calculation_enabled=false | ✅ (doğru ama gramajsız) |
| published + verified_content=false | ❌ (yayın doğruluk gerektirir; türetilmiş olduğu için zaten imkânsız) |
| archived + public_visible=true | ❌ (arşiv gizli) |
| approved + calculation_enabled=true (koşullar sağlıysa) | ✅ |

**Sonuç:** lifecycle'ın tek doğruluk kaynağı `content_status`; `public_visible` ve `calculation_enabled` ortogonal fiziksel bayraklar; `verified_content` status'tan türetilir.

---

## 8. claim alan sözlüğü

| Alan | Tip (öneri) | Zorunlu | Provenans | Kullanıcıya | Boş kalabilir | Yanlış kullanım örneği |
|---|---|---|---|---|---|---|
| entity_ref | ref{product,level} | E | – | dolaylı | – | claim'i taksona bağlamak (ürün yerine) |
| claim_type | enum(safety/use/identity/chem) | E | – | dolaylı | – | method'u claim yapmak |
| safety_topic | enum | K (safety ise) | – | E | non-safety'de | çocuk konusunu topic'siz yazmak |
| route | enum | H | kaynak | E | yol belirsizse | oral kanıtı topikale atfetmek |
| preparation_context | enum(product_context) | H | kaynak | E | genel ise | ruhsatlı ürün dozunu saf yağa taşımak |
| population | enum[] (junction) | H | kaynak | E | genel ise | gebelik claim'ini genel göstermek |
| age_min / age_max | int | H | kaynak | E | yaş yoksa | "<12"yi age vermeden yazmak |
| conclusion | text_tr | E | **kaynak** | E | – | editöryal cümleyi conclusion yapmak |
| rationale | text_tr | H | **kaynak** | E | kaynak vermezse (→status) | kaynağın demediği gerekçe |
| rationale_status | enum | E | – | dolaylı | – | gerekçesizken from_source demek |
| plain_language_explanation | text_tr | H | **editöryal** | E | – | kaynak cümlesi gibi sunmak |
| interpretation_note | text_tr | H | **editöryal** | E | – | "zararlı" imasına dönüştürmek |
| evidence_gap | enum | H | – | E | boşluk yoksa | insufficient'ı gizlemek |
| outcome_type | enum | E | – | dolaylı | – | insufficient_data'yı harm_shown yapmak |
| evidence_layer | enum | E | – | E(rozet) | – | energetic'i clinical göstermek |
| uncertainty | enum/text | H | – | E | – | belirsizliği gizlemek |
| technical_term_refs | ref[]→glossary | H | – | E(baloncuk) | terim yoksa | terimi claim içinde tekrar tanımlamak |
| editorial_note | text_tr | H | **editöryal** | opsiyonel | – | kaynak claim'iyle karıştırmak |
| status | enum | E | – | dolaylı | – | kaynaksızı verified yapmak |
| public_visible | bool | E | – | – | – | draft'ı public yapmak |

> Claim sözlüğü gelecekteki her alanla **şişirilmez**; yukarısı V1 çekirdeğidir.

---

## 9. method_variant ve method_step sözlüğü

**method_variant:** `entity_ref(product)` · `method_title` · `method_family` · `output_product(enum)` · `primary_source_ref` · `primary_source_locator` · `is_primary_method_source` · `preparation_context` · `tradition_or_school` · `evidence_layer` · `status` · `uncertainty` · `editorial_note`.

**method_step:** `method_variant_ref` · `step_no` · `instruction_tr` · `notes` · `source_ref` · `locator` · (opsiyonel anlatısal) `duration_text` / `light_condition_text` / `container_text`.

**Tekrar veri riski çözümü (tek-doğru-kaynağı):**
- **Hesaplanabilir sayısal gerçek** (21 gün, 25 °C, 150 g) yalnız **recipe.process_parameter / ingredient_line**'da yaşar.
- **method_step** yalnız **anlatısaldır**; süre/sıcaklık için serbest metin (`duration_text`) taşıyabilir ama bu **hesaplamaya girmez** ve recipe varsa onun değerine **referans** eder.
- Recipe olmayan (gramajsız) yöntemde adım metni süreyi sözle anabilir; bu **calculation_enabled=false**'tur.

---

## 10. method_guide sözlüğü

`method_variant_ref` · `guide_level` · `title` · `summary` · `content_blocks` · `safety_summary` · `common_mistakes` · `technical_term_refs` · `editorial_provenance` · `status` · `public_visible`.

- **Rehber kaynak cümlesi değildir** → `editorial_provenance` işaretli; kaynak dayanakları ilgili claim/recipe/source'a **referansla** gösterilir.
- **Blok yapısı:** tek büyük Markdown blob **değil**; **kontrollü `content_blocks`** (V1 minimum blok türleri: `paragraph`, `list`, `note`, `warning`, `term_ref`). Aşırı CMS kurulmaz.
- **Tekrarı önleme:** ortak bilgi overview'da; alt seviyeler yalnız **eklediklerini** yazar (üstteki tekrar edilmez).
- **Bazı seviyelerin yokluğu:** guide kaydı **oluşturulmaz** (yokluk = kayıt yok); UI o seviyeyi göstermez.

---

## 11. recipe sözlüğü

`method_variant_ref` · `recipe_title` · `source_ref` · `locator` · `reference_batch_size` · `reference_batch_unit` · `validated_min_batch` · `validated_max_batch` · `batch_scale_level` · `output_product` · `expected_output_quantity` · `expected_output_unit` · `loss_allowance` · `yield_information` · `uncertainty` · `safety_notes` · `editorial_explanation` · `outside_validated_range_behavior` · `scale_warning_text` · `status` · `public_visible` · `calculation_enabled`.

**Kesin kurallar:**
- Tek kanonik referans parti; farklı proses ölçeği **ayrı recipe**.
- recipe kaynağı ile method_variant ana kaynağı **uyumsuzsa yayın engeli** (veya açık kaynak-ilişkisi).
- Kaynaksız sayısal değer **verified olamaz**.
- Gramajsız yöntem yayımlanabilir; recipe/hesaplayıcı **zorunlu değildir**.
- **`calculation_enabled=true` için minimum:** `source_ref` + `locator` + `reference_batch_size/unit` + en az bir `ingredient_line.scalable=true` işareti + `status ∈ {verified, approved}` + güvenlik değerlendirmesi.

---

## 12. ingredient_line ve process_parameter sözlüğü

**ingredient_line:** `recipe_ref` · `material_ref` · `material_role` · `quantity` · `unit` · `quantity_type` · `scalable(bool)` · `minimum` · `maximum` · `substitution_allowed` · `notes` · `source_ref` · `locator`.

**process_parameter:** `recipe_ref` · `parameter_key` · `value_numeric` · `value_text` · `unit` · `scaling_behavior` · `min_value` · `max_value` · `warning_threshold` · `equipment_dependency` · `source_ref` · `locator` · `notes`.

**Kesinleştirmeler:**
- **ingredient = `scalable` boolean yeterli** (V1). Karmaşık `scaling_behavior` ingredient'ta **gerekmez** (malzeme genelde proportional); gerekirse ertelenmiş.
- **process_parameter = `scaling_behavior` enum** (süre/sıcaklık karmaşıklığı burada).
- **min/max vs acceptable_range:** sayısal `minimum/maximum` **tutulur**; `acceptable_range` **ayrı saklanmaz** → min/max'tan türetilen **görüntü metnidir** (çelişki üretmemek için).
- **Sayısal ↔ metinsel değer:** process_parameter'da `value_numeric` (nullable) + `value_text` (nullable) + `unit`. Örnek: "21 gün" → value_numeric=21, unit=gün, scaling_behavior=fixed; "karanlık ortam" → parameter_key=light_condition, value_text="karanlık", scaling_behavior=not_scalable; "cam kavanoz" → parameter_key=container_type, value_text="cam kavanoz".
- **V1 minimum:** ingredient (scalable + quantity/unit/quantity_type) + process_parameter (value_numeric/value_text + scaling_behavior). Fazlası ertelenir.

---

## 13. material ve yoğunluk sınırı

- **Material V1 kapsamı:** `canonical_name_tr` · `material_category` · `default_dimension` · `status` (+ opsiyonel `botanical_or_chemical_ref`).
- **Yoğunluk (density_*) V1 hesap kapsamı DIŞIDIR** (hacim↔kütle dönüşümü Faz D).
- **Karar/tavsiye:** yoğunluk alanları **şimdi fiziksel kurulmaz**; boş kolon üretmek yerine, gerektiğinde ayrı **`material_property`** yapısına (material_ref + property_key + value + unit + temperature + source) **ertelenir**. Böylece additif kalır, boş kolon borcu oluşmaz.

---

## 14. Botanik takson ve ürün sınırı — net kararlar

1. **botanical_family taksonda kanoniktir → üründe tekrar tutulmaz** (denormalizasyon gerekçesi doğmadıkça). Tutulursa snapshot gerekçesi + tutarlılık kuralı zorunlu.
2. **V2 ürün varlığı legacy `aromatherapy_oils` satırından bağımsızdır** (KİLİTLİ karar).
3. **C2'de legacy `aromatherapy_oils` tablosuna `taxon_id` veya başka V2 kolonu EKLENMEZ** (KİLİTLİ). Gerekçe: (a) perf worktree'si `oilFields.ts`/`aromatherapyData.ts`'i aktif düzenliyor (C0 bulgusu); (b) admin legacy oils zaten hard delete edilecek; (c) hiçbir mevcut içerik bu bağı zorlamıyor.
4. **V2 ürün modeli kendi kimliğini ve `taxon_ref` bağlantısını taşır** (KİLİTLİ).
5. **Legacy ↔ V2 arasında zorunlu FK KURULMAZ** (KİLİTLİ). **Legacy tablo V2'nin kanonik ürün kaynağı DEĞİLDİR.**
6. Gerçek ihtiyaç doğarsa ileride **additif `legacy_ref` veya junction** değerlendirilebilir (şimdi değil).

---

## 15. Tenant ve global içerik kuralı (varlık bazında)

| Varlık | Faz C tenant davranışı |
|---|---|
| claim, method_*, recipe, ingredient, process_parameter, component | tenant-scoped, **asla null** |
| product, plant_taxon | tenant-scoped (Faz C) |
| source, glossary_term, material | tenant-scoped (Faz C) — referans olsalar da |
| relation, claim_source | bağlı kayıtların tenant'ı |

- Faz C'de **hiçbir global (null) V2 içeriği üretilmez**; admin V2 içeriği admin uuid.
- Aynı takson/kaynak farklı tenant'larda **tekrarlanabilir** (kabul edilen maliyet).
- **Gelecek global paylaşım** additif kurulur: paylaşımlı-referans katmanı + tenant overlay + güçlü-kimlik dedup — mevcut modeli **kilitlemeyen** genişleme. Şimdi kurulmaz ama engellenmez.

---

## 16. Enum uygulama stratejisi

| Kategori | Örnek | Öneri (V1) |
|---|---|---|
| Sık değişmeyen çekirdek sistem anahtarı | product_type, guide_level, outcome_type, content_status, scaling_behavior, relation_type, calculation_type, batch_scale_level, material_role, quantity_type, evidence_layer, translation_status, rationale_status, outside_validated_range_behavior | **text + CHECK constraint + TypeScript kontrollü union** (PG native enum değil — additif genişleme kolay, destructive ALTER TYPE yok) |
| İçerik geliştikçe büyüyen sözlük | parameter_key, safety_topic | text + CHECK (geniş) veya küçük lookup; TS union mirror |
| Kullanıcı/admin değiştiremez sistem anahtarı | status, provenans | kod + CHECK |
| Veri-tabanlı sözlük | source, tradition_or_school, material adları, glossary | **lookup/veri satırı** (enum değil) |

- **PG native enum kullanılmaz** (ALTER TYPE ADD VALUE kısıtlı/riskli).
- Her enum ailesi için **tek teknoloji zorunlu değil**; çekirdek=CHECK+TS, veri-tabanlı=lookup.
- CHECK listesi + TS union **tek kaynaktan** üretilecek biçimde tutulur (drift önlemi — C2'de).

---

## 17. Migration ilkeleri (SQL yok)

- **Deterministik ve fail-fast:** beklenmeyen mevcut nesne/şema farkı **sessizce geçilmez**.
- **Kör `IF NOT EXISTS` yok** (drift'i gizler); durum önce doğrulanır, sonra kesin oluşturma.
- **Additif:** yalnız yeni nesne; mevcut tablo/kolon **C1 onayı olmadan değişmez**.
- **Doğuştan RLS-kilitli:** RLS enable + `anon`/`authenticated` için **açık REVOKE**; yalnız **service_role** erişimi.
- **Tenant izolasyonu** app katmanında (`.eq(tenant_id)`; V2 için `is.null` yok).
- **Tek sorumluluk:** her migration bir konu.
- **Migration sonrası doğrulama:** `has_table_privilege(anon,…)=false`, `relrowsecurity=true`, service_role çalışır.

---

## 18. Örnek dry-run'lar (İLLÜSTRATİF — gerçek veri değildir)

### A) Çocuk kullanımı claim'i
conclusion="12 yaş altı için önerilmez" · outcome_type=`insufficient_data` (**harm_shown değil**) · rationale(**kaynak**)="monografta 12 yaş altında yeterli veri bulunmadığı belirtilir" · rationale_status=from_source · interpretation_note(**editöryal**)="zararlı olduğunun kanıtı değildir; ihtiyatlı öneri" · evidence_layer=regulatory · population=[child] · age_max=12 · status=verified.

### B) Fototoksisite claim'i
conclusion="İncelenen kaynakta, topikal kullanım bağlamında fototoksik risk sınıfında değerlendirilmemiştir" · outcome_type=`not_classified_as_risk_in_reviewed_source` (**mutlak "fototoksik değildir" YOK; kaynak sessizliği bunu üretmez**) · evidence_layer=`experiential` · route=topical · preparation_context=neat_essential_oil · technical_term_refs=[fototoksisite] · status=verified.

### C) method_variant + iki method_step
method_title="Buhar distilasyonu (tek kaynak)" · output_product=`essential_oil` · is_primary_method_source=true · steps: [1] "taze çiçekli uçları buhar distilasyonuna al", [2] "yoğunlaşan faz ayrışınca yağı topla" · **gramaj yok → recipe yok → calculation_enabled kapsamı dışı**.

### D) recipe (İllüstratif, gerçek tarif değildir)
recipe_title="Maserasyon (illüstratif)" · output_product=`maceration_oil` · reference_batch=1 L · ingredient: kuru bitki 150 g (`scalable=true`, quantity_type=exact) + taşıyıcı yağ 1 L (`scalable=true`) · process_parameter: süre value_numeric=21 unit=gün **scaling_behavior=fixed**, sıcaklık value_numeric=25 unit=°C **scaling_behavior=not_scalable** · validated_min/max_batch=0,5–5 L · outside_validated_range_behavior=calculate_with_warning · **calculation_enabled** yalnız kaynak+locator gerçek olduğunda.

---

## 19. C2A ilk migration kapsamı (öneri)

Değerlendirilen seçenekler: A(source+taxon) · B(source+taxon+minimal product) · C(yalnız source) · D(başka).

**Öneri: C2A = yalnız `source` (+ locator junction'ı için hazırlık) — Seçenek C.**
Gerekçe: `source` **bağımsızdır** (hiçbir üst varlığa ihtiyaç duymaz), her claim/method/recipe ona bağlanacaktır (en temel yapı taşı), ve **tek sorumlulukla, bağımsız doğrulanabilir** (bir kaynak ekle → RLS/tenant/revoke doğrula) şekilde kurulur. Legacy tabloya **dokunmaz**. Sonraki: **C2B = plant_taxon**, **C2C = glossary + material (density'siz)**, ardından C3 claim.

---

## 20. Karar tablosu

| Konu | Nihai C1 kararı | Gerekçe | C2 etkisi | Ertelenen | Yeniden açılma koşulu |
|---|---|---|---|---|---|
| method_variant kaynağı | tek ana kaynak; farklı kaynak ayrı variant | bağlam korunur | C4 | – | – |
| recipe referans partisi | tek kanonik; farklı ölçek ayrı recipe | karışmaz | C6 | – | – |
| guide | ayrı child (method_guide), seviye anahtarlı | kopuk makale değil | C5 | – | – |
| calculation_profile | V1'de ayrı üst varlık değil (recipe içi metadata) | over-eng önleme | C6 | ayrı varlık | yeniden-kullanım kanıtı |
| duration/temperature | ölçeklenmez (fixed/not_scalable) | güvenlik | C6 | – | – |
| material density | **ertelenir** (material_property) | V1 hesap dışı | – | Faz D | hacim↔kütle ihtiyacı |
| taxon family | **taksonda kanonik**, üründe tekrar yok | tek doğru | C2B | – | denormalizasyon gerekçesi |
| legacy oils bağlantısı (KİLİTLİ) | V2 bağımsız kendi product+taxon_ref; legacy'e V2 kolonu/FK yok; legacy kanonik kaynak değil | perf çakışması + hard delete + içerik zorlamıyor | legacy değişmez | additif legacy_ref/junction | gerçek bağ ihtiyacı doğarsa |
| tenant/global | hepsi tenant-scoped; global yok | izolasyon | tüm C2 | paylaşımlı referans | bilinçli global karar |
| enum uygulama | text+CHECK+TS union; veri-tabanlı=lookup | additif genişleme | tüm C2 | – | – |
| C2A kapsamı | **yalnız source** | bağımsız, temel | C2A | taxon/glossary/material | – |
| YH indeksleme | Faz C'de kapalı (V2) | verified içerik yok | – | Faz H | verified claim varlığı |
| hard delete | **C7 sonrası**, ayrı onaylı | güvenli sıra | – | C7 sonrası | açık onay |
| hesaplama motoru | **Faz D** | veri önce | – | Faz D | min recipe koşulu |

---

## 21. Açık kalan konular (C2 öncesi)

- `parameter_key` / `safety_topic` sözlüklerinin nihai listesi (içerik geldikçe olgunlaşır).
- CHECK + TypeScript union'ın **tek-kaynaktan üretim** mekaniği (C2 kod kararı; drift önlemi).
- İlk teknik pilot (lavanta maserasyon) kaynak ölçütünün sağlanıp sağlanmadığı (araştırma bu aşamada başlatılmadı).
- `source_locator`'ın nihai fiziksel biçimi (junction alanı / ortak child / kaynak-junction) — C2/C3'te seçilecek; model **ortak** tasarlanacak.

> **Not:** V2 ürün varlığının legacy'den bağımsız yeni model olması artık **açık konu değil, KİLİTLİ karardır** (§14).

---

## 22. C2A Uyum Kararları (Reconciliation — kaynak: C2A uygulama-öncesi son karar turu)

C2A fiziksel migration sözleşmesinin **kaynağı** bu bölümdür. Kilitli kararlar:

- **`source_kind` → `source_type`:** C1 kavramsal tasarımındaki `source_kind` adı, C2A öncesi son karar turunda **`source_type`** olarak standartlaştırıldı. **Bu bir anlam değişikliği değil, yalnız isim standardizasyonudur.** `source_type` belgenin **biçim/türünü** tanımlar (§6-O); kaynağın bilimsel/geleneksel/düzenleyici/enerjetik ağırlığı **`evidence_layer`** ile taşınır ve **karıştırılmaz**.
- **Source yaşam döngüsü** `draft / verified / archived` alt-kümesiyle sınırlandı (§6-P); tam `content_status` (rejected/published vb.) **source'a uygulanmaz**. `verified` = **bibliyografik doğrulama**, bilimsel doğruluk değil.
- **C2A çekirdeği** (§3.3): 7 zorunlu + 9 nullable-dahil kolon; kalanı **ertelendi**. `publication_title`/`publisher` C2A kesin alanı **değildir** (ertelendi).
- **Dedup/unique:** DOI/ISBN/PMID için **C2A'da unique constraint yok**; güvenli normalizasyon **API/normalizasyon turuna** ertelendi.
- **`source_locator`** C2A dışında (§3.4); **legacy `aromatherapy_oils`** ile fiziksel bağ yok (§14); **`tenant_id` NOT NULL, FK yok** (kanonik tenants tablosu yok).
- **Migration henüz yazılmadı;** C2A tek dosya, doğuştan-kilitli (RLS enable + anon/authenticated/PUBLIC revoke, policy yok), deterministik ve fail-fast (`IF NOT EXISTS` yok).

---

## 23. C2A Kapanış Durumu

**Durum:** FAZ C / C2A **tamamlandı** (2026-07-19).

**Kayıt (kanıt):**
- Tablo: `public.aromatherapy_sources`
- Migration: `supabase/migrations/20260719000000_aromatherapy_sources.sql`
- Migration commit: `1a2485fa7986e7246113a29c8660b8860178495a` — `feat(aromaterapi-v2): add C2A sources table`
- Migration blob hash: `15abc023c1e47224392e1b37ac47a34f3e62327c`
- Remote feature branch'e **fast-forward push** edildi (`origin/work/aromaterapi-bilgi-bankasi`).
- Production'a **başarıyla uygulandı** — sonuç: `Success. No rows returned.`
- Kapanış doğrulaması: **31 kontrol + 1 genel sonuç = 32 satır**, tüm `passed` değerleri **true**, `overall_result = PASS`.

**Production'da doğrulanan yapı:**
- `public.aromatherapy_sources` mevcut; **16 kolon**.
- Primary key yalnız `id`; **4 CHECK constraint**.
- Tek secondary index: `aromatherapy_sources_tenant_idx` (yalnız `tenant_id`, `unique=false`).
- Tek kullanıcı trigger'ı: `trg_aromatherapy_sources_updated_at` — `BEFORE UPDATE`, `FOR EACH ROW`, `public.set_updated_at()`, **enabled**.
- `relrowsecurity=true`; `relforcerowsecurity=false`; `policy_count=0`.
- `anon` SELECT/INSERT/UPDATE/DELETE = **false**; `authenticated` SELECT/INSERT/UPDATE/DELETE = **false**; `service_role` SELECT/INSERT/UPDATE/DELETE = **true**.
- FK sayısı **0**; PK dışı unique constraint sayısı **0**; PK dışı unique secondary index sayısı **0**; `row_count=0`.

**Açık sınırlar (yapılmayanlar):**
- Canlı test verisi **eklenmedi**.
- Production'da **INSERT/UPDATE/DELETE davranış testi yapılmadı.**
- DML constraint/trigger davranış testi, **staging veya ayrı onaylı transaction+rollback** olmadan yapılmayacak.
- `origin/main`'e **merge/push yapılmadı** (yalnız feature branch).
- **C2B kodu veya migration'ı başlamadı.**

**Sonraki adım:** yalnız **C2B kapsam analizi → plan → kullanıcı onayı** (kod/migration yok). *(C2B içeriği bu belgede tanımlanmadı; ayrıca analiz edilip onaya sunulacaktır.)*
