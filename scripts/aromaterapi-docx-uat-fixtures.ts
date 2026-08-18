// ============================================================
// Aromaterapi Word — UAT fixtures (TEK KAYNAK: generator + fixture-quality harness).
// GERÇEKÇİ profesyonel içerik: tekrar-spam YOK (aynı cümlenin N kez tekrarı yok);
// long-form yine de çok-cümleli/dolgun. İstatistikler fixture'lardan TÜRETİLİR (count/parity).
// Renderer'a DOKUNMAZ (no-loss garanti); yalnız fixture veri kalitesi.
// ============================================================

import type { OilExportRow, BlendExportRow } from "@/lib/aromaterapi/report/reads";
import { OIL_TYPE_LABEL, OIL_TYPE_ORDER } from "@/lib/aromaterapi/report/theme";

// ─── Gerçekçi long-form içerik (tekrar YOK; her cümle farklı) ────────────────────
const SN_BERGAMOT =
  "Fototoksik bir yağdır: bergapten (5-metoksipsoralen) içeriği nedeniyle cilde uygulandıktan sonra en az 12–18 saat " +
  "doğrudan güneş ışığından ve solaryumdan kaçınılmalıdır. Taşıyıcı yağ içinde genellikle en fazla %0,4 oranında " +
  "seyreltilerek kullanılması önerilir. Hamilelik ve emzirme döneminde uzman onayı olmadan kullanılmamalıdır. " +
  "Duyarlı ciltlerde tahrişe yol açabileceğinden, uygulama öncesi ön kol içine küçük bir patch testi yapılmalıdır. " +
  "Bergapten arındırılmış (FCF) form, fototoksisite riski taşımadığından gündüz uygulamalarında tercih edilebilir.";
const SN_CAYAGACI =
  "Genellikle güvenli kabul edilir; ancak yüksek konsantrasyonlarda cilt tahrişine ve kontakt dermatite yol açabilir. " +
  "Ağızdan alınması toksiktir ve kesinlikle önerilmez. Evcil hayvanlarda, özellikle kedilerde, ciddi toksisite bildirilmiştir.";
const METHOD_TEXT =
  "Taze lavanta çiçek başakları sabah erken saatte hasat edilir, hafifçe soldurulur ve imbik kazanına sıkıştırılmadan " +
  "gevşek biçimde yerleştirilir. Alttan verilen düşük basınçlı buhar, bitki materyalinden geçerek uçucu bileşenleri sürükler. " +
  "Buhar, soğutucu serpantinde yoğuşturulup dekantöre alınır; uçucu yağ ile hidrosol yoğunluk farkıyla kendiliğinden ayrışır. " +
  "Damıtma süresi ve sıcaklığı, linalil asetat gibi esterlerin hidrolize olmaması için dikkatle kontrol edilir.";
const CLAIM_CONCLUSION =
  "Adaçayı (Salvia officinalis) uçucu yağının hamilelik döneminde kullanımı, tujon içeriği ve emmenagog " +
  "(adet söktürücü) etkisi nedeniyle geleneksel kaynaklarda sakıncalı bulunur. Klinik kanıt sınırlı olmakla birlikte, " +
  "ihtiyat ilkesi gereği gebelikte kullanımından kaçınılması önerilir.";
const PASSAGE_ORIGINAL =
  "The essential oil of Salvia officinalis contains thujone, a monoterpene ketone associated with neurotoxic " +
  "potential at elevated doses; caution is advised during pregnancy.";
const PASSAGE_TR =
  "Salvia officinalis uçucu yağı, yüksek dozlarda nörotoksik potansiyelle ilişkilendirilen bir monoterpen keton olan " +
  "tujon içerir; gebelikte dikkatli olunması önerilir.";
const GLOSS_PHOTO =
  "Fototoksisite, bergapten gibi furanokumarin bileşiklerinin cilde uygulandıktan sonra ultraviyole ışıkla etkileşerek " +
  "serbest radikaller oluşturması ve dokuda hasara yol açmasıdır. Klinik olarak güneş yanığına benzer eritem, kabarcık ve " +
  "kalıcı hiperpigmentasyon şeklinde görülür. Etki özellikle bergamot, limon ve greyfurt gibi soğuk sıkım narenciye yağlarında belirgindir.";

// ─── Oil fixtures ────────────────────────────────────────────────────────────────
function oil(over: Partial<OilExportRow>): OilExportRow {
  return {
    id: "00000000-0000-0000-0000-000000000000", tenant_id: "t", name: "X", latin_name: null, english_name: null,
    oil_type: "essential", category: null, extraction_method: null, plant_part: null, origin: null, shelf_life: null,
    aroma_profile: null, aroma_note: null, color: null, consistency: null, is_photosensitive: null, main_components: null,
    therapeutic_properties: null, emotional_benefits: null, spiritual_benefits: null, physical_benefits: null,
    skin_benefits: null, benefits: null, diffuser_usage: null, massage_usage: null, usage_methods: null, dilution_ratio: null,
    blends_well_with: null, target_systems: null, chakra_connection: null, element_connection: null, safety_notes: null,
    contraindications: null, notes: null, source: null, origin_type: null, origin_label: null, created_at: null, updated_at: null,
    ...over,
  };
}

export const OIL_BERGAMOT = oil({
  name: "Bergamot Yağı", latin_name: "Citrus bergamia", english_name: "Bergamot", oil_type: "essential",
  aroma_profile: "Taze, narenciye, hafif çiçeksi ve balsamik alt notalar.",
  main_components: "Limonen,Linalil asetat,Linalol,Bergapten", // boşluksuz — tipografi düzeltmesi kanıtı
  therapeutic_properties: ["antiseptik", "yatıştırıcı", "antidepresan"],
  physical_benefits: "Sindirim sistemini destekler; iştah düzenleyici olarak kullanılır.",
  emotional_benefits: "Kaygıyı azaltır ve ruh halini dengeleyerek yükseltir.",
  diffuser_usage: "3–5 damla difüzörde akşam kullanımı için uygundur.",
  is_photosensitive: true, safety_notes: SN_BERGAMOT,
  contraindications: "Fototoksik. Uygulamadan sonra 12–18 saat güneşe çıkılmamalıdır.",
  blends_well_with: ["Lavanta", "Ylang Ylang", "Roma Papatyası"],
});
export const OIL_LAVANTA = oil({
  name: "Lavanta Yağı", latin_name: "Lavandula angustifolia", oil_type: "essential",
  aroma_profile: "Çiçeksi, otsu, yumuşak.", main_components: "Linalol, Linalil asetat",
  therapeutic_properties: ["yatıştırıcı", "antiseptik"], emotional_benefits: "Rahatlatır; uykuya geçişi kolaylaştırır.",
  safety_notes: "Genelde güvenli kabul edilir; çok düşük seyreltmelerde bebeklerde bile tolere edilebilir.",
});
export const OIL_SPARSE = oil({ name: "Az Bilgili Yağ", oil_type: "maceration" }); // null-omit senaryosu

export const OILS_MANY: OilExportRow[] = [
  OIL_BERGAMOT, OIL_LAVANTA, OIL_SPARSE,
  oil({ name: "Çay Ağacı Yağı", latin_name: "Melaleuca alternifolia", oil_type: "essential", therapeutic_properties: ["antibakteriyel", "antifungal"], safety_notes: SN_CAYAGACI }),
  oil({ name: "Nane Yağı", latin_name: "Mentha piperita", oil_type: "essential", main_components: "Mentol, Menton", benefits: "Baş ağrısını ve mide bulantısını hafifletmeye yardımcı olur." }),
  oil({ name: "Okaliptus Yağı", latin_name: "Eucalyptus globulus", oil_type: "essential", therapeutic_properties: ["dekonjestan", "ekspektoran"] }),
  oil({ name: "Jojoba Yağı", latin_name: "Simmondsia chinensis", oil_type: "carrier", benefits: "Cilde yakın yapısıyla ideal bir taşıyıcı yağdır." }),
  oil({ name: "Tatlı Badem Yağı", latin_name: "Prunus amygdalus dulcis", oil_type: "carrier", benefits: "Nemlendirici, hassas ciltler için uygundur." }),
  oil({ name: "Çörekotu Yağı", latin_name: "Nigella sativa", oil_type: "carrier", benefits: "Bağışıklık sistemini destekleyici geleneksel kullanım." }),
  oil({ name: "Kalendula Maserasyonu", oil_type: "maceration", benefits: "Cilt yatıştırıcı; tahriş ve kızarıklıkta kullanılır." }),
  oil({ name: "Gül Hidrosolü", oil_type: "hydrosol", aroma_profile: "Yumuşak, çiçeksi." }),
  oil({ name: "Lavanta Hidrosolü", oil_type: "hydrosol", aroma_profile: "Hafif, otsu-çiçeksi tonlama." }),
];

// ─── Blend fixtures ──────────────────────────────────────────────────────────────
export const blend = (over: Partial<BlendExportRow>): BlendExportRow => ({
  id: "b", tenant_id: "t", name: "Sakinleştirici Karışım", notes: "Akşam kullanımı; yatmadan 30 dk önce difüzörde 4–6 damla.", carrier_oil_id: null,
  carrier_oil_name: "Jojoba", bottle_ml: 30, dilution_percent: 2, drops_per_ml: 20, total_drops: 12,
  items: [
    { oil_id: "o1", oil_name: "Lavanta", latin_name: "Lavandula angustifolia", oil_type: "essential", drops: 6, is_photosensitive: false, contraindications: "", safety_notes: "" },
    { oil_id: "o2", oil_name: "Bergamot", latin_name: "Citrus bergamia", oil_type: "essential", drops: 4, is_photosensitive: true, contraindications: "Güneşe çıkmadan kullanmayın.", safety_notes: "" },
    { oil_id: "o3", oil_name: "Roma Papatyası", latin_name: "Chamaemelum nobile", oil_type: "essential", drops: 2, is_photosensitive: false, contraindications: "", safety_notes: "Papatya alerjisi olanlarda dikkatli olunmalı." },
  ],
  is_active: true, created_at: null, updated_at: null, ...over,
});
export const BLENDS_3: BlendExportRow[] = [
  blend({}),
  blend({ id: "b2", name: "Enerji Karışımı", notes: "Sabah kullanımı; canlandırıcı.", items: [
    { oil_id: "e1", oil_name: "Nane", latin_name: "Mentha piperita", oil_type: "essential", drops: 4, is_photosensitive: false, contraindications: "", safety_notes: "Bebeklerde kullanmayın." },
    { oil_id: "e2", oil_name: "Limon", latin_name: "Citrus limon", oil_type: "essential", drops: 5, is_photosensitive: true, contraindications: "Güneşe çıkmadan kullanmayın.", safety_notes: "" },
    { oil_id: "e3", oil_name: "Biberiye", latin_name: "Rosmarinus officinalis", oil_type: "essential", drops: 3, is_photosensitive: false, contraindications: "Yüksek tansiyonda dikkatli kullanılmalı.", safety_notes: "" },
  ] }),
  blend({ id: "b3", name: "Odaklanma Karışımı", notes: "Çalışma sırasında difüzörde kullanım için uygundur." }),
];

// ─── Diğer kaynak fixtures (readTypes any-cast) — gerçekçi içerik ─────────────────
export const taxon = (over: any = {}): any => ({ id: "t1", canonical_name: "Lavandula angustifolia", genus: "Lavandula", species: "angustifolia", family: "Lamiaceae", author_citation: "Mill.", is_hybrid: false, status: "verified", infraspecific_epithet: null, primary_common_name_tr: "Gerçek Lavanta", ...over });
export const TAXA_2: any[] = [taxon(), taxon({ id: "t2", canonical_name: "Salvia officinalis", genus: "Salvia", species: "officinalis", primary_common_name_tr: "Adaçayı" })];
export const PREP: any = { id: "p1", taxon_id: "t1", preparation_type: "Uçucu Yağ", plant_part: "Çiçek başağı", chemotype: "Linalool", status: "verified", taxon_canonical_name: "Lavandula angustifolia", knowledge_record_count: 2 };
export const METHOD: any = {
  series: { id: "s1", method_kind: "faithful_source", method_lang: "tr", source_title: "Ege Uçucu Yağ El Kitabı", passage_locator: "s.42", revision_count: 2, verified_revision: 2, revisions: [{ revision: 1, status: "archived", updated_at: "2026-01-01" }, { revision: 2, status: "verified", updated_at: "2026-02-01" }] },
  content: { revision: 2, status: "verified", method_text: METHOD_TEXT, steps: [
    { order: 1, text: "Lavanta başaklarını sabah erken saatte, çiy kalktıktan sonra hasat edin." },
    { order: 2, text: "Materyali imbik kazanına sıkıştırmadan, gevşek biçimde yerleştirin." },
    { order: 3, text: "Düşük basınçlı buhar damıtmasını kontrollü sıcaklıkta uygulayın." },
    { order: 4, text: "Uçucu yağı hidrosolden ayırın ve koyu cam şişede, serin ortamda saklayın." },
  ], quality_notes: "Berrak, açık sarı; keskin olmayan, dengeli çiçeksi koku.", safety_notes: "Damıtım ürünü fotosensitif değildir.", equipment: "Bakır imbik" },
  prepLabel: "Lavanta Uçucu Yağı",
};
// Enum alanlar KANONİK kodlarla (claimFormConfig.ts allowlist'i); Word sunumunda Türkçeleşir.
export const CLAIM: any = { id: "k1", claim_type: "safety", safety_topic: "hamilelik", conclusion: CLAIM_CONCLUSION, conclusion_provenance: "source_original", evidence_layer: "traditional", rationale: "Tujon ve emmenagog etki, geleneksel materia medica kaynaklarında bildirilmiştir.", rationale_status: "from_source", status: "verified", preparation: { taxon_canonical_name: "Salvia officinalis" }, routes: [{ route_code: "topical" }, { route_code: "inhalation" }], populations: [{ population_code: "pregnancy", age_min: null, age_max: null }], sources: [{ source_id: "src1", source_title: "Botanik Güvenlik Rehberi", source_role: "primary_support", verification_status: "verified", locator_text: "s.10", source_original_excerpt: PASSAGE_ORIGINAL, faithful_translation: PASSAGE_TR }], passages: [], relations: [{ relation_type: "supports", explanation_tr: "Bu iddia, adaçayının gebelikte kullanım kısıtı kaydını destekler." }] };
export const SOURCE: any = { id: "src1", title: "Botanik Güvenlik Rehberi", source_type: "book", status: "verified", authors: "Yılmaz, A.", organization: "Ege Üniversitesi Yayınları", publication_year: 2020, doi: "10.1234/abc", pmid: "12345678", isbn: "978-0-00-000000-0", url: "https://example.com/kaynak", document_no: null, notes: "Uçucu yağların güvenlik profillerini kapsayan referans eser." };
export const PASSAGE: any = { id: "pg1", source_id: "src1", locator_label: "Bölüm 3", passage_kind: "excerpt", original_text: PASSAGE_ORIGINAL, translations: [{ target_lang: "tr", translated_text: PASSAGE_TR }], editorial_explanations: [{ note_text: "Pasaj, tujonun doza bağlı toksisitesini bağlamsallaştırır." }], editorial_interpretations: [{ note_text: "Uzman notu: aromaterapik dozlarda risk düşük olsa da gebelikte kaçınma önerilir." }] };
export const GLOSSARY_3: any[] = [
  { id: "g1", canonical_term_tr: "Fotosensitivite", canonical_term_en: "Phototoxicity", short_definition_tr: "Bazı yağların cildi güneş ışığına karşı aşırı duyarlı hale getirmesi.", professional_definition_tr: GLOSS_PHOTO, status: "verified" },
  { id: "g2", canonical_term_tr: "Kemotip", canonical_term_en: "Chemotype", short_definition_tr: "Aynı türün, baskın kimyasal bileşenine göre ayrılan varyasyonu.", professional_definition_tr: "Kemotip, morfolojik olarak aynı bitki türünün, iklim ve toprak gibi etkenlerle farklı baskın uçucu bileşen üretmesidir. Örneğin kekik, timol veya linalol kemotipi olarak sınıflandırılabilir; bu, hem terapötik etkiyi hem de güvenlik profilini değiştirir.", status: "verified" },
  { id: "g3", canonical_term_tr: "Hidrosol", canonical_term_en: "Hydrosol", short_definition_tr: "Buhar damıtması sırasında elde edilen aromatik su fazı.", professional_definition_tr: "Hidrosol, uçucu yağ damıtımı sırasında yoğuşan ve suda çözünen bileşenleri içeren aromatik su fazıdır. Uçucu yağa göre çok daha düşük konsantrasyonda olduğundan cilt bakımı ve hassas kullanıcı gruplarında yumuşak bir alternatif sunar.", status: "verified" },
];

// ─── İstatistik türetme (count/parity: kapak/özet = gerçek kayıt sayıları) ────────
export function oilTypeStats(oils: OilExportRow[]): { label: string; value: string }[] {
  const by = new Map<string, number>();
  for (const o of oils) by.set(o.oil_type, (by.get(o.oil_type) ?? 0) + 1);
  const ordered = [...OIL_TYPE_ORDER.filter((t) => by.has(t)), ...[...by.keys()].filter((t) => !(OIL_TYPE_ORDER as readonly string[]).includes(t))];
  return [{ label: "Toplam Yağ", value: String(oils.length) }, ...ordered.map((t) => ({ label: OIL_TYPE_LABEL[t] ?? t, value: String(by.get(t)) }))];
}
