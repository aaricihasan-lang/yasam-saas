// Gökyüzü Atlası — PROFESYONEL klasik asalet katmanı: ekol (tablo seti) ve puan politikası tanımları (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// DURUM: "GELİŞTİRİLDİ — OWNER/EĞİTMEN ONAYI BEKLİYOR". Hiçbir route, ekran veya motor bu klasörü import etmez.
// Tablolar YENİDEN YAZILMAZ: burç yöneticisi, yücelme, üçlü, terim, yüz ve Lilly puanları mevcut horary katmanından
// (`lib/astrology/horary/western/tables.ts`, `calc.ts`) import edilir. Bu dosya yalnız (a) hangi tablo setinin, (b) hangi puan
// politikasının kullanıldığını ADLANDIRIR ve kaynak atıflarını taşır. Ekol tabloları birbirine KARIŞTIRILMAZ: bir tablo seti
// başka ekolün puanlarıyla kullanılırsa sonuç `mixedPolicy` uyarısı taşır.

import { PROFILE_DOROTHEAN_EGYPTIAN, PROFILE_LILLY_1647, type HoraryProfile } from "../../horary/western/calc";
import { LILLY_POINTS } from "../../horary/western/tables";

/** Kaynak atfı. `verified` = birincil kaynakta (tıpkıbasım/OCR) metin bu çalışmada okunarak teyit edildi. */
export type SourceRef = { id: string; text: string; verified: boolean; note?: string };

/**
 * Atıflar. "CA" = W. Lilly, Christian Astrology (1647), Wellcome tıpkıbasımı archive.org `b30338724` (OCR metni
 * `b30338724_djvu.txt`, 2026-10-31 indirildi; kanıt QA klasöründe). Sayfa numaraları tıpkıbasım sayfa başlıklarıdır.
 */
export const SOURCES = {
  ca104: { id: "CA s. 104", text: "A Table of the Essential Dignities of the Planets (burç yöneticisi, yücelme, üçlü, terim, yüz, zarar, düşüş)", verified: true, note: "12/12 terim satırı 2026-10-19'da tıpkıbasımla teyit (tables.ts)" },
  ca115: { id: "CA s. 115", text: "A ready Table whereby to examine the Fortitudes and Debilities: 5/4/3/2/1, −5/−4, peregrine −5; arızi kalemler", verified: true, note: "2026-10-28 satır satır görsel teyit (tables.ts)" },
  ca113: { id: "CA s. 113", text: "Yanma 8°30′ (aynı burç), ışın altı 17°, cazimi 17′", verified: true },
  ca114: { id: "CA s. 114", text: "Doğulu/batılı, kuşatılma", verified: true },
  ca48: { id: "CA s. 48", text: "\"Almuten of any house is that Planet who hath most dignities in the Signe ascending or descending upon the Cusp of any house\"; \"Almuten of a Figure, that Planet who in Essentiall and Accidentall dignities, is most powerfull in the whole Scheame of Heaven\"", verified: true, note: "OCR okunaklı (2026-10-31)" },
  ca507: { id: "CA s. 506–507", text: "Beş hyleg (asıl) yeri: Yükselen, Tepe noktası (MC), Güneş, Ay, Şans noktası (\"these five are called the Hylegiacall or principall places\")", verified: true, note: "OCR'de Ay ve Şans noktası glifle; bağlam okunaklı" },
  ca530: { id: "CA s. 530", text: "Bölüm CV 'Of the Lord of the Geniture': bazı yazarlara göre 'most essentiall dignities in the ascendant, mid-heaven, place of the ☉/☽ …'", verified: false, note: "OCR satırı bozuk ('place of Jhe a > and 0'): nokta listesinin tamamı görsel teyit ister" },
  ca532: { id: "CA s. 532", text: "Lilly'nin kendi görüşü: 'most essentiall and accidentall dignities in the Figure, and is posited best, and elevated most'; 'The Greeks did use to account that Planet Lord of the Geniture who had most dignities in the place of the ☉ and ☽'", verified: true, note: "Sayısal birleştirme kuralı kaynakta YOK" },
  dorotheus: { id: "Dorotheus, Carmen Astrologicum I.1", text: "Üçlü yöneticileri gündüz/gece/ortak", verified: false, note: "Depodaki tablo #438'den; bu çalışmada birincil metin yeniden okunmadı" },
  tetrabiblos120: { id: "Ptolemy, Tetrabiblos I.20", text: "Mısır terimleri (gezegen toplamları küçük yıllar: 57/79/66/82/76)", verified: false, note: "Sağlama toplamı testle doğrulanır; satır metni bu çalışmada yeniden okunmadı" },
  ibnEzra: { id: "İbn Ezra (Book of Nativities / Reshit Hokhmah)", text: "Harita almuten'i: Güneş, Ay, Yükselen, Şans noktası ve doğum öncesi kavuşum/dolunay derecelerinde en çok asalet", verified: false, note: "Yalnız ikincil kaynak bilgisi; birincil metin bu çalışmada okunamadı" },
} as const satisfies Record<string, SourceRef>;

export type DignitySchoolId = "lilly-1647" | "dorothean-egyptian";
export type DignitySchool = {
  id: DignitySchoolId;
  label: string;
  /** Mevcut horary profili (tablo seçimi + yanma eşikleri + puan yöntemi bu profilden okunur; DEĞİŞTİRİLMEZ). */
  profile: HoraryProfile;
  sources: SourceRef[];
};

export const DIGNITY_SCHOOLS: Readonly<Record<DignitySchoolId, DignitySchool>> = {
  "lilly-1647": { id: "lilly-1647", label: "William Lilly (1647): Lilly üçlüleri + Lilly terimleri", profile: PROFILE_LILLY_1647, sources: [SOURCES.ca104, SOURCES.ca113, SOURCES.ca115] },
  "dorothean-egyptian": { id: "dorothean-egyptian", label: "Dorothean üçlüler + Mısır terimleri", profile: PROFILE_DOROTHEAN_EGYPTIAN, sources: [SOURCES.dorotheus, SOURCES.tetrabiblos120] },
};

/**
 * Puan politikası. Asal asalet / almuten puanları için ayrı seçilir:
 *   • "school": ekolün kendi puan yöntemi (Lilly → CA s. 115; Dorothean setinde sayısal puan yöntemi YOK → puan null).
 *   • "lilly_ca115": Lilly puanları (5/4/3/2/1, −5/−4, peregrine −5) seçilen tablo setine uygulanır. Tablo seti Lilly değilse
 *     sonuç `mixedPolicy: true` taşır (ekol karışımı → eğitmen kararı).
 */
export type ScorePolicyId = "school" | "lilly_ca115";
export const LILLY_SCORE = LILLY_POINTS;

/**
 * Almuten politikası (belirli derecenin "en çok asaleti olan" gezegeni). Puan ağırlıkları CA s. 115 (5/4/3/2/1).
 * Üçlü yöneticilerinin sayımı:
 *   • "sect_only": yalnız haritanın sect'ine (gündüz/gece) göre üçlü yöneticisi +3. Lilly tablosunda ortak yönetici yoktur.
 *   • "sect_plus_participating": sect yöneticisi + (varsa) ortak yönetici, her biri +3. DOĞRULANMADI (ikincil kaynak pratiği).
 *   • "all_three": gündüz + gece + ortak yöneticilerin hepsi +3. DOĞRULANMADI.
 * Not: essentialDignity (calc.ts) Dorothean setinde ortak yöneticiyi üçlü asaleti sayar — bu, almuten politikasından bağımsızdır.
 */
export type AlmutenPolicyId = "lilly_ca115_sect" | "lilly_ca115_sect_participating" | "lilly_ca115_all_triplicity";
export type AlmutenPolicy = {
  id: AlmutenPolicyId;
  label: string;
  points: { domicile: number; exaltation: number; triplicity: number; term: number; face: number };
  triplicity: "sect_only" | "sect_plus_participating" | "all_three";
  verified: boolean;
  source: SourceRef;
};
const PTS = { domicile: LILLY_POINTS.domicile, exaltation: LILLY_POINTS.exaltation, triplicity: LILLY_POINTS.triplicity, term: LILLY_POINTS.term, face: LILLY_POINTS.face };
export const ALMUTEN_POLICIES: Readonly<Record<AlmutenPolicyId, AlmutenPolicy>> = {
  lilly_ca115_sect: { id: "lilly_ca115_sect", label: "CA s. 115 puanları, yalnız sect üçlü yöneticisi", points: PTS, triplicity: "sect_only", verified: true, source: SOURCES.ca115 },
  lilly_ca115_sect_participating: { id: "lilly_ca115_sect_participating", label: "CA s. 115 puanları, sect + ortak üçlü yöneticisi (DOĞRULANMADI)", points: PTS, triplicity: "sect_plus_participating", verified: false, source: SOURCES.ca115 },
  lilly_ca115_all_triplicity: { id: "lilly_ca115_all_triplicity", label: "CA s. 115 puanları, üç üçlü yöneticisinin hepsi (DOĞRULANMADI)", points: PTS, triplicity: "all_three", verified: false, source: SOURCES.ca115 },
};

/**
 * Harita (figür) almuten'i nokta setleri. `verified` false olan set hesaplanır ama `standard: false` olarak döner; ürün
 * varsayılanı yapılamaz. Hiçbir set arızi ek puan (gün/saat yöneticisi, ev konumu) EKLEMEZ — bu eklerin sayısal değerleri
 * birincil kaynakta bu çalışmada teyit edilemedi (açık karar).
 */
export type FigurePointId = "sun" | "moon" | "asc" | "mc" | "fortune" | "prenatal_syzygy";
export type FigurePresetId = "greeks_ca532" | "lilly_hylegiacal5_ca507" | "ca530_asc_mc_lights" | "ibn_ezra_5";
export type FigurePreset = { id: FigurePresetId; label: string; points: FigurePointId[]; verified: boolean; sources: SourceRef[]; note: string };
export const FIGURE_PRESETS: Readonly<Record<FigurePresetId, FigurePreset>> = {
  greeks_ca532: { id: "greeks_ca532", label: "Güneş ve Ay derecelerinde en çok asalet (CA s. 532 'The Greeks')", points: ["sun", "moon"], verified: true, sources: [SOURCES.ca532], note: "Lilly'nin aktardığı Yunan görüşü; metin okunaklı" },
  lilly_hylegiacal5_ca507: { id: "lilly_hylegiacal5_ca507", label: "Beş hyleg yeri (ASC, MC, Güneş, Ay, Şans noktası) toplamı", points: ["asc", "mc", "sun", "moon", "fortune"], verified: false, sources: [SOURCES.ca507, SOURCES.ca48], note: "Yerler CA s. 506–507'de teyitli; ancak almuten'in bu beş yerin puan TOPLAMI olduğu Lilly'de yazmıyor (yorum)" },
  ca530_asc_mc_lights: { id: "ca530_asc_mc_lights", label: "ASC, MC, Güneş, Ay (CA s. 530 'bazı yazarlar')", points: ["asc", "mc", "sun", "moon"], verified: false, sources: [SOURCES.ca530], note: "OCR satırı bozuk; nokta listesi görsel teyit ister" },
  ibn_ezra_5: { id: "ibn_ezra_5", label: "İbn Ezra: Güneş, Ay, ASC, Şans noktası, doğum öncesi kavuşum/dolunay", points: ["sun", "moon", "asc", "fortune", "prenatal_syzygy"], verified: false, sources: [SOURCES.ibnEzra], note: "Birincil metin okunamadı; dolunayda hangi ışığın derecesinin alınacağı da açık karar" },
};
