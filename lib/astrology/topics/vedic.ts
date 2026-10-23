// Astroloji — VEDİK konu taksonomisi (Aşama 5; SAF, istemci güvenli).
//
// Vedik gelenek (tradition = "vedic") Batı'dan AYRIDIR: KB kayıtları gelenek sütunuyla ayrışır, anahtar
// türleri de ayrı adlandırılır (graha_*, navamsa_*, varga_*, dasha_*, yoga). Böylece Batı "planet_in_house"
// notu Vedik D1 yorumu gibi GÖRÜNMEZ; D1 ile D9 konuları da ayrı türlerdir.
//
//   graha_in_rashi:<graha>:<rashi>            (D1)
//   graha_in_bhava:<graha>:<ev 1-12>           (D1, Lagna'dan bütün-burç)
//   graha_in_nakshatra:<graha>:<nakshatra>     (D1)
//   graha_nakshatra_pada:<graha>:<nakshatra>:<pada 1-4>
//   lagna_rashi:<rashi> · lagna_nakshatra:<nakshatra>
//   yoga:<yoga-id>                             (D1'de oluşan yoga)
//   navamsa_graha_in_rashi:<graha>:<rashi> · navamsa_lagna_rashi:<rashi> · navamsa_vargottama:<graha>
//   varga_graha_in_rashi:<dN>:<graha>:<rashi>  (D2…D60, D9 hariç; dN = d2, d3, …)
//   dasha_mahadasha:<lord> · dasha_antardasha:<mahadasha lord>:<antardasha lord>
//   gochara_graha_in_rashi:<graha>:<rashi> · gochara_from_moon:<graha>:<ev> · gochara_in_bhava:<graha>:<ev>
//   gochara_drishti:<transit graha>:<natal graha>   (5.1A Vedik transit; Batı transit konularından AYRI tür)
//
// DB biçim kısıtı (topic_key) ile uyumlu: ^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$

import { SIGN_IDS, type SignId } from "../model/western";
import {
  KARANA_IDS,
  NAKSHATRAS,
  VEDIC_GRAHAS,
  type VedicD1Technical,
  type VedicDashaTechnical,
  type VedicDrishtiTechnical,
  type VedicPanchangaTechnical,
  type VedicShadbalaTechnical,
  type VedicTransitTechnical,
  type VedicVargaTechnical,
} from "../model/vedic";
import { SIGN_LABELS } from "../labels/tr";
import type { KpChartTechnical, KpHoraryTechnical, KpRulingTechnical, KpTimingTechnical, KpTransitTechnical } from "../model/kp";
import { ARUDHA_ABBR, ARUDHA_NAMES, ARUDHA_PADA_IDS, CHARA_KARAKA_ABBR, CHARA_KARAKA_IDS_EIGHT, CHARA_KARAKA_NAMES, type ArudhaPadaId, type CharaKarakaId } from "../model/vedicHarita";
import type { VedicArudhaTechnical, VedicBhavaBalaTechnical, VedicBhavChalitTechnical, VedicCharaKarakaTechnical } from "../model/vedicHarita";

export const VEDIC_CONTEXTS = ["vedic_d1", "vedic_varga", "vedic_dasha", "vedic_drishti", "vedic_strength", "vedic_panchanga", "vedic_gochara", "vedic_chalit", "vedic_jaimini", "vedic_bhava_bala", "vedic_match", "vedic_porutham", "vedic_papasamyam"] as const;
// 22.10.2026 Vedik eşleştirme (Gun Milan / Manglik) konu türleri — kimlik ve etiketler modelden (tek kaynak).
// 22.10.2026 gece: On Porutham / Papasamyam konu türleri — kimlik ve etiketler modelden (tek kaynak).
import { PAPA_GRAHAS, PAPA_HOUSES, PAPA_REFERENCE_LABELS, PAPA_REFERENCES, PORUTHAM_IDS, PORUTHAM_LABELS, type PapaReference, type PoruthamId } from "../model/vedicPorutham";
import { DOSHA_IDS, DOSHA_LABELS, KOOTA_IDS, KOOTA_LABELS, MANGLIK_HOUSE_GROUP, MANGLIK_SEVERITIES, MANGLIK_SEVERITY_LABELS, type GunMilanDoshaId, type KootaId, type ManglikSeverity } from "../model/vedicMatch";

export type VedicContext = (typeof VEDIC_CONTEXTS)[number];

/**
 * Aşama 6: KP (Krishnamurti Paddhati) bağlamları — AYRI gelenek ("kp"). Anahtar türleri "kp_" önekli; Vedik/Batı ayrıştırıcıları
 * bunları KABUL ETMEZ (parseVedicTopicKey gelenek parametresi). Evler Placidus cusp'larıdır (bütün-burç bhava DEĞİL).
 */
export const KP_CONTEXTS = ["kp_principle", "kp_cusp", "kp_planet", "kp_significator", "kp_dasha", "kp_ruling", "kp_transit", "kp_horary"] as const;
export type KpContext = (typeof KP_CONTEXTS)[number];
export const KP_CONTEXT_LABELS: Record<KpContext, string> = {
  kp_principle: "KP temel prensipler",
  kp_cusp: "KP cusp (Placidus)",
  kp_planet: "KP gezegen (star / sub lord)",
  kp_significator: "KP significator",
  kp_dasha: "KP dasha",
  kp_ruling: "KP ruling planets",
  kp_transit: "KP transit",
  kp_horary: "KP horary",
};
/** KP temel prensip konuları (harita dışı genel bilgi; teknik eşleşme üretmez, yalnız elle seçilir). */
export const KP_PRINCIPLES: Record<string, string> = {
  cusp_sublord_rule: "Cusp sub-lord kuralı (vaat)",
  significator_levels: "4 düzeyli significator sırası",
  star_lord_rule: "Star lord ilkesi",
  node_agency: "Rahu/Ketu ajanlığı",
  retrograde_rule: "Retro gezegen ilkesi",
  ruling_planets_rule: "Ruling planets ile doğrulama",
  horary_method: "Horary (1–249) yöntemi",
  dasha_timing: "Dasha ile zamanlama",
};
export const VEDIC_CONTEXT_LABELS: Record<VedicContext, string> = {
  vedic_d1: "Vedik D1 (Rashi)",
  vedic_varga: "Vedik Varga (D9 / Dn)",
  vedic_dasha: "Vimshottari Dasha",
  vedic_drishti: "Graha Drishti",
  vedic_strength: "Graha gücü (Shadbala / Ashtakavarga)",
  vedic_panchanga: "Janma Panchanga",
  vedic_gochara: "Gochara (Vedik transit)",
  // 22.10.2026 Vedik harita: chalit bhavası D1 bütün-burç evinden; ev gücü (Bhava Bala) graha gücünden (Shadbala) AYRI bağlam.
  vedic_chalit: "Bhav Chalit (bhava yerleşimi)",
  vedic_jaimini: "Jaimini (Chara Karaka / Arudha)",
  vedic_bhava_bala: "Bhava Bala (ev gücü)",
  // 22.10.2026: iki kişilik Ashtakoot eşleştirme + Manglik — natal D1 konularından AYRI bağlam.
  vedic_match: "Eşleştirme (Ashtakoot / Manglik)",
  // 22.10.2026 gece: Güney Hint On Porutham ve Papasamyam — Ashtakoot konularından AYRI bağlamlar (puanlar karışmaz).
  vedic_porutham: "On Porutham (Dashakoot)",
  vedic_papasamyam: "Papasamyam (malefik denge)",
};

/** Geleneksel ad listeleri (yalnız etiket; hesap DEĞİL). */
export const TITHI_LABELS: string[] = [
  ...["Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi"].map((n) => `Shukla ${n}`),
  "Purnima",
  ...["Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi"].map((n) => `Krishna ${n}`),
  "Amavasya",
];
export const NITYA_YOGA_LABELS: string[] = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana",
  "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];
export const KARANA_LABELS: Record<string, string> = {
  bava: "Bava", balava: "Balava", kaulava: "Kaulava", taitila: "Taitila", gara: "Gara", vanija: "Vanija", vishti: "Vishti (Bhadra)",
  shakuni: "Shakuni", chatushpada: "Chatushpada", naga: "Naga", kimstughna: "Kimstughna",
};

export const GRAHA_LABELS: Record<string, string> = {
  sun: "Güneş (Surya)",
  moon: "Ay (Chandra)",
  mars: "Mars (Mangala)",
  mercury: "Merkür (Budha)",
  jupiter: "Jüpiter (Guru)",
  venus: "Venüs (Shukra)",
  saturn: "Satürn (Shani)",
  rahu: "Rahu",
  ketu: "Ketu",
};
export const NAKSHATRA_LABELS: Record<string, string> = Object.fromEntries(
  NAKSHATRAS.map((n) => [n, n.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")]),
);
export const VARGA_DIVISIONS = [2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60] as const;

/**
 * Roxy D1 yanıtındaki 48 yoga denetiminin kimlik + adı (golden vedic-d1, @roxyapi v2). Konu seçici için
 * liste; doğrulama yine kalıpla yapılır (sağlayıcı yeni yoga eklerse anahtar geçerli kalır).
 * Not: "chandra" kimliği sağlayıcıda "Chakra Yoga" adını taşır — kimlik değiştirilmez.
 */
export const VEDIC_YOGA_NAMES: Record<string, string> = {
  gajakesari: "Gajakesari", sunapha: "Sunapha", anapha: "Anapha", dhurdhura: "Dhurdhura", kemadruma: "Kemadruma",
  chandramangala: "Chandra Mangala", budhaaditya: "Budha-Aditya", ruchaka: "Ruchaka", bhadra: "Bhadra", hamsa: "Hamsa",
  malavya: "Malavya", sasa: "Sasa", dhana: "Dhana", daridra: "Daridra", lakshmi: "Lakshmi", dhanamalika: "Dhana Malika",
  gada: "Gada", "sakata-2": "Sakata", vihaga: "Vihaga", sringhataka: "Sringhataka", hala: "Hala", kamala: "Kamala",
  vapee: "Vapee", yupa: "Yupa", ishu: "Ishu", sakti: "Sakti", danda: "Danda", nav: "Nav", kuta: "Kuta", chhatra: "Chhatra",
  "chapa-2": "Chapa", ardhachandra: "Ardha Chandra", chandra: "Chakra", samudra: "Samudra", vajra: "Vajra", yava: "Yava",
  rajju: "Rajju", musala: "Musala", nala: "Nala", sarpa: "Sarpa", mala: "Mala", "gola-2": "Gola", yuga: "Yuga", sula: "Sula",
  kedara: "Kedara", pasa: "Pasa", damni: "Damni", vallaki: "Vallaki",
};

export type VedicArgType = "graha" | "rashi" | "bhava" | "nakshatra" | "pada" | "yoga" | "division" | "tithi" | "nitya_yoga" | "karana" | "kp_number" | "kp_principle" | "karaka" | "arudha" | "koota" | "koota_band" | "match_dosha" | "manglik_level" | "porutham" | "porutham_result" | "porutham_constraint" | "papa_reference" | "papa_graha" | "papa_house" | "papa_comparison";
const PORUTHAM_RESULTS = ["matched", "unmatched"] as const;
const PORUTHAM_RESULT_LABELS: Record<string, string> = { matched: "karşılandı", unmatched: "karşılanmadı" };
const PORUTHAM_CONSTRAINTS = ["rajju", "vedha"] as const;
const PAPA_COMPARISONS = ["within", "exceeds"] as const;
const PAPA_COMPARISON_LABELS: Record<string, string> = { within: "2. rol toplamı 1. rolü aşmıyor (karşılaştırma kuralı sağlanıyor)", exceeds: "2. rol toplamı 1. rolü aşıyor (karşılaştırma kuralı sağlanmıyor)" };
/** Koota puan bandı (puanın kendisi değil; konu = "tam / kısmi / sıfır puan"). */
export const KOOTA_BANDS = ["full", "partial", "zero"] as const;
const KOOTA_BAND_LABELS: Record<string, string> = { full: "tam puan", partial: "kısmi puan", zero: "sıfır puan" };
type ArgType = VedicArgType;
export type TopicTradition = "vedic" | "kp";
type Spec = { args: ArgType[]; context: VedicContext | KpContext; label: (p: string[]) => string; tradition?: "kp" };

const g = (s: string) => GRAHA_LABELS[s] ?? s;
const r = (s: string) => (SIGN_LABELS as Record<string, string>)[s] ?? s;
const n = (s: string) => NAKSHATRA_LABELS[s] ?? s;

export const VEDIC_SPECS: Record<string, Spec> = {
  graha_in_rashi: { args: ["graha", "rashi"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${r(p[1])} rashisinde` },
  graha_in_bhava: { args: ["graha", "bhava"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${p[1]}. bhavada` },
  graha_in_nakshatra: { args: ["graha", "nakshatra"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${n(p[1])} nakshatrasında` },
  graha_nakshatra_pada: { args: ["graha", "nakshatra", "pada"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${n(p[1])} ${p[2]}. pada` },
  lagna_rashi: { args: ["rashi"], context: "vedic_d1", label: (p) => `D1: Lagna ${r(p[0])}` },
  lagna_nakshatra: { args: ["nakshatra"], context: "vedic_d1", label: (p) => `D1: Lagna ${n(p[0])} nakshatrasında` },
  yoga: { args: ["yoga"], context: "vedic_d1", label: (p) => `Yoga: ${VEDIC_YOGA_NAMES[p[0]] ? `${VEDIC_YOGA_NAMES[p[0]]} Yoga` : p[0]}` },
  navamsa_graha_in_rashi: { args: ["graha", "rashi"], context: "vedic_varga", label: (p) => `D9 Navamsa: ${g(p[0])} ${r(p[1])} rashisinde` },
  navamsa_lagna_rashi: { args: ["rashi"], context: "vedic_varga", label: (p) => `D9 Navamsa: Lagna ${r(p[0])}` },
  navamsa_vargottama: { args: ["graha"], context: "vedic_varga", label: (p) => `D9 Navamsa: ${g(p[0])} vargottama` },
  navamsa_graha_in_bhava: { args: ["graha", "bhava"], context: "vedic_varga", label: (p) => `D9 Navamsa: ${g(p[0])} ${p[1]}. bhavada` },
  varga_graha_in_rashi: { args: ["division", "graha", "rashi"], context: "vedic_varga", label: (p) => `${p[0].toUpperCase()}: ${g(p[1])} ${r(p[2])} rashisinde` },
  varga_graha_in_bhava: { args: ["division", "graha", "bhava"], context: "vedic_varga", label: (p) => `${p[0].toUpperCase()}: ${g(p[1])} ${p[2]}. bhavada` },
  varga_lagna_rashi: { args: ["division", "rashi"], context: "vedic_varga", label: (p) => `${p[0].toUpperCase()}: Lagna ${r(p[1])}` },
  varga_vargottama: { args: ["division", "graha"], context: "vedic_varga", label: (p) => `${p[0].toUpperCase()}: ${g(p[1])} vargottama` },
  dasha_mahadasha: { args: ["graha"], context: "vedic_dasha", label: (p) => `Mahadasha: ${g(p[0])}` },
  dasha_antardasha: { args: ["graha", "graha"], context: "vedic_dasha", label: (p) => `Antardasha: ${g(p[0])} / ${g(p[1])}` },
  graha_drishti: { args: ["graha", "graha"], context: "vedic_drishti", label: (p) => `Drishti: ${g(p[0])} → ${g(p[1])}` },
  shadbala_above_min: { args: ["graha"], context: "vedic_strength", label: (p) => `Shadbala: ${g(p[0])} asgari gücün üstünde` },
  shadbala_below_min: { args: ["graha"], context: "vedic_strength", label: (p) => `Shadbala: ${g(p[0])} asgari gücün altında` },
  panchanga_tithi: { args: ["tithi"], context: "vedic_panchanga", label: (p) => `Janma tithi: ${p[0]}. ${TITHI_LABELS[Number(p[0]) - 1] ?? ""}` },
  panchanga_nitya_yoga: { args: ["nitya_yoga"], context: "vedic_panchanga", label: (p) => `Janma nitya yoga: ${p[0]}. ${NITYA_YOGA_LABELS[Number(p[0]) - 1] ?? ""}` },
  panchanga_karana: { args: ["karana"], context: "vedic_panchanga", label: (p) => `Janma karana: ${KARANA_LABELS[p[0]] ?? p[0]}` },
  dasha_pratyantardasha: { args: ["graha", "graha", "graha"], context: "vedic_dasha", label: (p) => `Pratyantardasha: ${g(p[0])} / ${g(p[1])} / ${g(p[2])}` },
  // ─── Aşama 6: KP (tradition "kp") ───
  kp_principle: { args: ["kp_principle"], context: "kp_principle", tradition: "kp", label: (p) => `KP prensip: ${KP_PRINCIPLES[p[0]] ?? p[0]}` },
  kp_cusp_rashi: { args: ["bhava", "rashi"], context: "kp_cusp", tradition: "kp", label: (p) => `KP: ${p[0]}. cusp ${r(p[1])} burcunda` },
  kp_cusp_starlord: { args: ["bhava", "graha"], context: "kp_cusp", tradition: "kp", label: (p) => `KP: ${p[0]}. cusp star lord ${g(p[1])}` },
  kp_cusp_sublord: { args: ["bhava", "graha"], context: "kp_cusp", tradition: "kp", label: (p) => `KP: ${p[0]}. cusp sub-lord ${g(p[1])}` },
  kp_planet_in_house: { args: ["graha", "bhava"], context: "kp_planet", tradition: "kp", label: (p) => `KP: ${g(p[0])} ${p[1]}. evde (Placidus)` },
  kp_planet_starlord: { args: ["graha", "graha"], context: "kp_planet", tradition: "kp", label: (p) => `KP: ${g(p[0])} ${g(p[1])} yıldızında (star lord)` },
  kp_planet_sublord: { args: ["graha", "graha"], context: "kp_planet", tradition: "kp", label: (p) => `KP: ${g(p[0])} sub-lord ${g(p[1])}` },
  kp_significator: { args: ["graha", "bhava"], context: "kp_significator", tradition: "kp", label: (p) => `KP significator: ${g(p[0])} → ${p[1]}. ev` },
  kp_dasha_lord: { args: ["graha"], context: "kp_dasha", tradition: "kp", label: (p) => `KP dasha lordu: ${g(p[0])}` },
  kp_dasha_signifies: { args: ["graha", "bhava"], context: "kp_dasha", tradition: "kp", label: (p) => `KP dasha: ${g(p[0])} dönemi ${p[1]}. evi gösterir` },
  kp_ruling_planet: { args: ["graha"], context: "kp_ruling", tradition: "kp", label: (p) => `KP ruling planet: ${g(p[0])}` },
  kp_transit_sublord: { args: ["graha", "graha"], context: "kp_transit", tradition: "kp", label: (p) => `KP transit: ${g(p[0])} sub-lord ${g(p[1])}` },
  kp_transit_starlord: { args: ["graha", "graha"], context: "kp_transit", tradition: "kp", label: (p) => `KP transit: ${g(p[0])} ${g(p[1])} yıldızında` },
  kp_horary_number: { args: ["kp_number"], context: "kp_horary", tradition: "kp", label: (p) => `KP horary sayısı: ${p[0]}` },
  kp_horary_cusp_sublord: { args: ["bhava", "graha"], context: "kp_horary", tradition: "kp", label: (p) => `KP horary: ${p[0]}. cusp sub-lord ${g(p[1])}` },
  gochara_graha_in_rashi: { args: ["graha", "rashi"], context: "vedic_gochara", label: (p) => `Gochara: transit ${g(p[0])} ${r(p[1])} rashisinde` },
  gochara_from_moon: { args: ["graha", "bhava"], context: "vedic_gochara", label: (p) => `Gochara: transit ${g(p[0])} Janma Rashi'den ${p[1]}. evde` },
  gochara_in_bhava: { args: ["graha", "bhava"], context: "vedic_gochara", label: (p) => `Gochara: transit ${g(p[0])} Lagna'dan ${p[1]}. bhavada` },
  gochara_drishti: { args: ["graha", "graha"], context: "vedic_gochara", label: (p) => `Gochara drishti: transit ${g(p[0])} → natal ${g(p[1])}` },
  // ─── 22.10.2026 Vedik harita (D1 / Shadbala türlerinden AYRI) ───
  chalit_graha_in_bhava: { args: ["graha", "bhava"], context: "vedic_chalit", label: (p) => `Bhav Chalit: ${g(p[0])} ${p[1]}. chalit bhavasında` },
  chara_karaka: { args: ["karaka", "graha"], context: "vedic_jaimini", label: (p) => `Chara karaka: ${CHARA_KARAKA_NAMES[p[0] as CharaKarakaId] ?? p[0]} = ${g(p[1])}` },
  arudha_pada_in_rashi: { args: ["arudha", "rashi"], context: "vedic_jaimini", label: (p) => `${ARUDHA_NAMES[p[0] as ArudhaPadaId] ?? p[0]} (${ARUDHA_ABBR[p[0] as ArudhaPadaId] ?? p[0]}) ${r(p[1])} rashisinde` },
  arudha_pada_in_bhava: { args: ["arudha", "bhava"], context: "vedic_jaimini", label: (p) => `${ARUDHA_NAMES[p[0] as ArudhaPadaId] ?? p[0]} (${ARUDHA_ABBR[p[0] as ArudhaPadaId] ?? p[0]}) Lagna'dan ${p[1]}. evde` },
  bhava_bala_strongest: { args: ["bhava"], context: "vedic_bhava_bala", label: (p) => `Bhava Bala: ${p[0]}. ev en güçlü bhava` },
  bhava_bala_weakest: { args: ["bhava"], context: "vedic_bhava_bala", label: (p) => `Bhava Bala: ${p[0]}. ev en zayıf bhava` },
  // ─── 22.10.2026 Vedik eşleştirme (ayrı bağlam; KB otomatik doldurulmaz, uzmanın kendi kaydı eşleşir) ───
  match_koota_score: { args: ["koota", "koota_band"], context: "vedic_match", label: (p) => `Ashtakoot: ${KOOTA_LABELS[p[0] as KootaId] ?? p[0]} — ${KOOTA_BAND_LABELS[p[1]] ?? p[1]}` },
  match_dosha: { args: ["match_dosha"], context: "vedic_match", label: (p) => `Ashtakoot: ${DOSHA_LABELS[p[0] as GunMilanDoshaId] ?? p[0]} etkin` },
  match_dosha_cancelled: { args: ["match_dosha"], context: "vedic_match", label: (p) => `Ashtakoot: ${DOSHA_LABELS[p[0] as GunMilanDoshaId] ?? p[0]} klasik kuralla iptal` },
  // ─── 22.10.2026 gece: On Porutham / Papasamyam (ayrı bağlamlar; KB otomatik doldurulmaz) ───
  porutham_result: { args: ["porutham", "porutham_result"], context: "vedic_porutham", label: (p) => `On Porutham: ${PORUTHAM_LABELS[p[0] as PoruthamId] ?? p[0]} — ${PORUTHAM_RESULT_LABELS[p[1]] ?? p[1]}` },
  porutham_constraint: { args: ["porutham_constraint"], context: "vedic_porutham", label: (p) => `On Porutham: ${p[0] === "rajju" ? "Rajju" : "Vedha"} kısıtı etkin` },
  papa_affliction: { args: ["papa_reference", "papa_graha", "papa_house"], context: "vedic_papasamyam", label: (p) => `Papasamyam: ${g(p[1])} ${PAPA_REFERENCE_LABELS[p[0] as PapaReference] ?? p[0]} ${p[2]}. evde` },
  papa_comparison: { args: ["papa_comparison"], context: "vedic_papasamyam", label: (p) => `Papasamyam: ${PAPA_COMPARISON_LABELS[p[0]] ?? p[0]}` },
  manglik: { args: ["manglik_level"], context: "vedic_match", label: (p) => `Manglik: ${MANGLIK_HOUSE_GROUP[p[0] as ManglikSeverity] ?? p[0]} (${MANGLIK_SEVERITY_LABELS[p[0] as ManglikSeverity] ?? p[0]})` },
};
export const VEDIC_KINDS = Object.keys(VEDIC_SPECS).filter((k) => !VEDIC_SPECS[k].tradition);
export const KP_KINDS = Object.keys(VEDIC_SPECS).filter((k) => VEDIC_SPECS[k].tradition === "kp");
export const traditionOfSpec = (kind: string): TopicTradition => (VEDIC_SPECS[kind]?.tradition === "kp" ? "kp" : "vedic");

function valid(t: ArgType, v: string): boolean {
  switch (t) {
    case "graha":
      return (VEDIC_GRAHAS as readonly string[]).includes(v);
    case "rashi":
      return (SIGN_IDS as readonly string[]).includes(v);
    case "bhava":
      return /^(?:[1-9]|1[0-2])$/.test(v);
    case "nakshatra":
      return (NAKSHATRAS as readonly string[]).includes(v);
    case "pada":
      return /^[1-4]$/.test(v);
    case "yoga":
      return /^[a-z0-9-]{2,40}$/.test(v);
    case "division":
      return VARGA_DIVISIONS.some((d) => d !== 9 && `d${d}` === v);
    case "tithi":
      return /^(?:[1-9]|[12]\d|30)$/.test(v);
    case "nitya_yoga":
      return /^(?:[1-9]|1\d|2[0-7])$/.test(v);
    case "karana":
      return (KARANA_IDS as readonly string[]).includes(v);
    case "kp_number":
      return /^(?:[1-9]|[1-9]\d|1\d\d|2[0-3]\d|24[0-9])$/.test(v);
    case "kp_principle":
      return Object.prototype.hasOwnProperty.call(KP_PRINCIPLES, v);
    case "karaka":
      return (CHARA_KARAKA_IDS_EIGHT as readonly string[]).includes(v);
    case "arudha":
      return (ARUDHA_PADA_IDS as readonly string[]).includes(v);
    case "koota":
      return (KOOTA_IDS as readonly string[]).includes(v);
    case "koota_band":
      return (KOOTA_BANDS as readonly string[]).includes(v);
    case "match_dosha":
      return (DOSHA_IDS as readonly string[]).includes(v);
    case "manglik_level":
      return (MANGLIK_SEVERITIES as readonly string[]).includes(v);
    case "porutham":
      return (PORUTHAM_IDS as readonly string[]).includes(v);
    case "porutham_result":
      return (PORUTHAM_RESULTS as readonly string[]).includes(v);
    case "porutham_constraint":
      return (PORUTHAM_CONSTRAINTS as readonly string[]).includes(v);
    case "papa_reference":
      return (PAPA_REFERENCES as readonly string[]).includes(v);
    case "papa_graha":
      return (PAPA_GRAHAS as readonly string[]).includes(v);
    case "papa_house":
      return (PAPA_HOUSES as readonly number[]).map(String).includes(v);
    case "papa_comparison":
      return (PAPA_COMPARISONS as readonly string[]).includes(v);
  }
}

/** Konu seçici: argüman türüne göre seçenekler (kimlik, Türkçe etiket). */
export function vedicArgOptions(t: VedicArgType): [string, string][] {
  switch (t) {
    case "graha":
      return VEDIC_GRAHAS.map((x): [string, string] => [x, g(x)]);
    case "rashi":
      return SIGN_IDS.map((x): [string, string] => [x, r(x)]);
    case "bhava":
      return Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), `${i + 1}. bhava`]);
    case "nakshatra":
      return NAKSHATRAS.map((x, i): [string, string] => [x, `${i + 1}. ${n(x)}`]);
    case "pada":
      return ["1", "2", "3", "4"].map((x): [string, string] => [x, `${x}. pada`]);
    case "yoga":
      return Object.entries(VEDIC_YOGA_NAMES).map(([k, v]): [string, string] => [k, `${v} Yoga`]);
    case "division":
      return VARGA_DIVISIONS.filter((d) => d !== 9).map((d): [string, string] => [`d${d}`, `D${d}`]);
    case "tithi":
      return TITHI_LABELS.map((l, i): [string, string] => [String(i + 1), `${i + 1}. ${l}`]);
    case "nitya_yoga":
      return NITYA_YOGA_LABELS.map((l, i): [string, string] => [String(i + 1), `${i + 1}. ${l}`]);
    case "karana":
      return KARANA_IDS.map((k): [string, string] => [k, KARANA_LABELS[k]]);
    case "kp_number":
      return Array.from({ length: 249 }, (_, i): [string, string] => [String(i + 1), String(i + 1)]);
    case "kp_principle":
      return Object.entries(KP_PRINCIPLES);
    case "karaka":
      return CHARA_KARAKA_IDS_EIGHT.map((k): [string, string] => [k, `${CHARA_KARAKA_NAMES[k]} (${CHARA_KARAKA_ABBR[k]})`]);
    case "arudha":
      return ARUDHA_PADA_IDS.map((k): [string, string] => [k, `${ARUDHA_NAMES[k]} (${ARUDHA_ABBR[k]})`]);
    case "koota":
      return KOOTA_IDS.map((k): [string, string] => [k, KOOTA_LABELS[k]]);
    case "koota_band":
      return KOOTA_BANDS.map((b): [string, string] => [b, KOOTA_BAND_LABELS[b]]);
    case "match_dosha":
      return DOSHA_IDS.map((d): [string, string] => [d, DOSHA_LABELS[d]]);
    case "porutham":
      return PORUTHAM_IDS.map((k): [string, string] => [k, PORUTHAM_LABELS[k]]);
    case "porutham_result":
      return PORUTHAM_RESULTS.map((k): [string, string] => [k, PORUTHAM_RESULT_LABELS[k]]);
    case "porutham_constraint":
      return [
        ["rajju", "Rajju"],
        ["vedha", "Vedha"],
      ];
    case "papa_reference":
      return PAPA_REFERENCES.map((k): [string, string] => [k, PAPA_REFERENCE_LABELS[k]]);
    case "papa_graha":
      return PAPA_GRAHAS.map((k): [string, string] => [k, g(k)]);
    case "papa_house":
      return PAPA_HOUSES.map((h): [string, string] => [String(h), `${h}. ev`]);
    case "papa_comparison":
      return PAPA_COMPARISONS.map((k): [string, string] => [k, PAPA_COMPARISON_LABELS[k]]);
    case "manglik_level":
      return MANGLIK_SEVERITIES.map((m): [string, string] => [m, `${MANGLIK_HOUSE_GROUP[m]} (${MANGLIK_SEVERITY_LABELS[m]})`]);
  }
}

export function vedicDefaultParts(kind: string): string[] {
  const spec = VEDIC_SPECS[kind];
  return spec.args.map((t, i) => (t === "graha" && i > 0 && spec.args[i - 1] === "graha" ? vedicArgOptions(t)[1][0] : vedicArgOptions(t)[0][0]));
}

export function vedicTopicKey(kind: string, parts: string[]): string {
  return [kind, ...parts].join(":");
}

export type ParsedVedicTopic = { kind: string; parts: string[]; context: VedicContext | KpContext; label: string };

/** Gelenek ayrımı: "vedic" yalnız Vedik türleri, "kp" yalnız KP türlerini kabul eder (KP anahtarı Vedik olarak ASLA ayrışmaz). */
export function parseVedicTopicKey(key: unknown, tradition: TopicTradition = "vedic"): ParsedVedicTopic | null {
  if (typeof key !== "string" || key.length > 160) return null;
  const [kind, ...parts] = key.split(":");
  const spec = Object.prototype.hasOwnProperty.call(VEDIC_SPECS, kind) ? VEDIC_SPECS[kind] : undefined;
  if (!spec || parts.length !== spec.args.length) return null;
  if ((spec.tradition ?? "vedic") !== tradition) return null;
  if (!spec.args.every((t, i) => valid(t, parts[i]))) return null;
  return { kind, parts, context: spec.context, label: spec.label(parts) };
}

export type VedicTopic = { key: string; kind: string; label: string };

export function vedicCollect(items: [string, string[]][]): VedicTopic[] {
  const out = new Map<string, VedicTopic>();
  for (const [kind, parts] of items) {
    const key = [kind, ...parts].join(":");
    const p = parseVedicTopicKey(key, traditionOfSpec(kind));
    if (p && !out.has(key)) out.set(key, { key, kind, label: p.label });
  }
  return [...out.values()];
}

/** Varga konuları: D9 kendi türlerini (navamsa_*), diğer bölümler varga_*:dN anahtarlarını kullanır — D1 ile karışmaz. */
export function topicsFromVedicVarga(t: VedicVargaTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  if (t.division.number === 9) {
    items.push(["navamsa_lagna_rashi", [t.lagna.rashi]]);
    for (const x of t.grahas) {
      items.push(["navamsa_graha_in_rashi", [x.id, x.rashi]], ["navamsa_graha_in_bhava", [x.id, String(x.house)]]);
      if (x.vargottama) items.push(["navamsa_vargottama", [x.id]]);
    }
  } else {
    const d = `d${t.division.number}`;
    items.push(["varga_lagna_rashi", [d, t.lagna.rashi]]);
    for (const x of t.grahas) {
      items.push(["varga_graha_in_rashi", [d, x.id, x.rashi]], ["varga_graha_in_bhava", [d, x.id, String(x.house)]]);
      if (x.vargottama) items.push(["varga_vargottama", [d, x.id]]);
    }
  }
  return vedicCollect(items);
}

/** Dasha konuları düzeye göre: MD listesi → dasha_mahadasha; AD → dasha_antardasha:md:ad; PD → dasha_pratyantardasha:md:ad:pd. */
export function topicsFromVedicDasha(t: VedicDashaTechnical): VedicTopic[] {
  // 2026-10-21: Sookshma / Prana düzeylerinin Bilgi Bankası konu türü YOK → konu üretilmez (üst düzey konusuna yanlış atanmaz).
  if (t.level === "sookshma" || t.level === "prana") return [];
  const md = t.path.mahadasha;
  const ad = t.path.antardasha;
  const items: [string, string[]][] = t.periods.map((p): [string, string[]] =>
    md && ad ? ["dasha_pratyantardasha", [md, ad, p.lord]] : md ? ["dasha_antardasha", [md, p.lord]] : ["dasha_mahadasha", [p.lord]],
  );
  return vedicCollect(items);
}

/** Gochara konuları: transit graha rashisi, Janma Rashi'den ev (klasik), Lagna'dan ev, transit→natal drishti. */
export function topicsFromVedicTransit(t: VedicTransitTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const x of t.transits) {
    items.push(["gochara_graha_in_rashi", [x.id, x.rashi]], ["gochara_from_moon", [x.id, String(x.houseFromMoon)]], ["gochara_in_bhava", [x.id, String(x.natalHouse)]]);
    for (const d of x.drishti) items.push(["gochara_drishti", [x.id, d.to]]);
  }
  return vedicCollect(items);
}

export function topicsFromVedicDrishti(t: VedicDrishtiTechnical): VedicTopic[] {
  return vedicCollect(t.aspects.map((a): [string, string[]] => ["graha_drishti", [a.from, a.to]]));
}
/** Oran ≥ 1 → BPHS asgari gücün üstünde (Roxy'nin strengthRatio değeri; eşik bizim yorumumuz değil, BPHS asgarisi). */
export function topicsFromVedicShadbala(t: VedicShadbalaTechnical): VedicTopic[] {
  return vedicCollect(t.planets.map((p): [string, string[]] => [p.strengthRatio >= 1 ? "shadbala_above_min" : "shadbala_below_min", [p.id]]));
}
export function topicsFromVedicPanchanga(t: VedicPanchangaTechnical): VedicTopic[] {
  return vedicCollect([
    ["panchanga_tithi", [String(t.tithi.number)]],
    ["panchanga_nitya_yoga", [String(t.nityaYoga.number)]],
    ["panchanga_karana", [t.karana.id]],
  ]);
}

export function topicsFromVedicD1(t: VedicD1Technical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const x of t.grahas) {
    items.push(["graha_in_rashi", [x.id, x.rashi]], ["graha_in_bhava", [x.id, String(x.house)]], ["graha_in_nakshatra", [x.id, x.nakshatra.id]], ["graha_nakshatra_pada", [x.id, x.nakshatra.id, String(x.nakshatra.pada)]]);
  }
  items.push(["lagna_rashi", [t.lagna.rashi]], ["lagna_nakshatra", [t.lagna.nakshatra.id]]);
  for (const y of t.yogas) if (y.present) items.push(["yoga", [y.id]]);
  return vedicCollect(items);
}

/** Aşama 6 KP haritası konuları: cusp (burç / star / sub lord), gezegen (Placidus evi / star / sub lord), significator (herhangi düzey). */
export function topicsFromKpChart(t: KpChartTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const c of t.cusps) {
    const h = String(c.house);
    items.push(["kp_cusp_rashi", [h, c.rashi]], ["kp_cusp_starlord", [h, c.starLord]], ["kp_cusp_sublord", [h, c.subLord]]);
  }
  for (const b of t.bodies) items.push(["kp_planet_in_house", [b.id, String(b.house)]], ["kp_planet_starlord", [b.id, b.starLord]], ["kp_planet_sublord", [b.id, b.subLord]]);
  for (const p of t.significators.planets) for (const h of [...new Set([1, 2, 3, 4].flatMap((l) => p.levels[l as 1 | 2 | 3 | 4]))].sort((a, b) => a - b)) items.push(["kp_significator", [p.id, String(h)]]);
  return vedicCollect(items);
}

/** 6E KP dasha konuları: dönem lordu + lordun gösterdiği evler (Roxy KP significator'ları, herhangi düzey). */
export function topicsFromKpDasha(t: VedicDashaTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const p of t.periods) {
    items.push(["kp_dasha_lord", [p.lord]]);
    if (p.kp) for (const h of [...new Set([1, 2, 3, 4].flatMap((l) => p.kp!.levels[l as 1 | 2 | 3 | 4]))].sort((x, y) => x - y)) items.push(["kp_dasha_signifies", [p.lord, String(h)]]);
  }
  return vedicCollect(items);
}

/** 6F KP ruling planets / transit / horary konuları. */
export function topicsFromKpRuling(t: KpRulingTechnical): VedicTopic[] {
  return vedicCollect(t.rulingPlanets.map((g): [string, string[]] => ["kp_ruling_planet", [g]]));
}
export function topicsFromKpTransit(t: KpTransitTechnical): VedicTopic[] {
  return vedicCollect(t.bodies.flatMap((b): [string, string[]][] => [["kp_transit_starlord", [b.id, b.starLord]], ["kp_transit_sublord", [b.id, b.subLord]]]));
}
/** TRANSİT-03: zaman aralığı — geçilen yıldız / sub-lord konuları (mevcut KP transit konu türleri; yeni tür yok). */
export function topicsFromKpTiming(t: KpTimingTechnical): VedicTopic[] {
  return vedicCollect(t.sublord.flatMap((x) => x.changes.flatMap((c): [string, string[]][] => [["kp_transit_starlord", [x.planet, c.toStar]], ["kp_transit_sublord", [x.planet, c.toSub]]])));
}
export function topicsFromKpHorary(t: KpHoraryTechnical): VedicTopic[] {
  return vedicCollect([["kp_horary_number", [String(t.horaryNumber)]], ...t.cusps.map((c): [string, string[]] => ["kp_horary_cusp_sublord", [String(c.house), c.subLord]])]);
}

export type { SignId };

// ─── 22.10.2026 Vedik harita konuları (D1 / Shadbala konularından AYRI türler) ─────────────────────────────
/** Bhav Chalit: graha → chalit bhavası (D1 graha_in_bhava ile KARIŞMAZ). */
export function topicsFromVedicBhavChalit(t: VedicBhavChalitTechnical): VedicTopic[] {
  return vedicCollect(t.grahas.map((x): [string, string[]] => ["chalit_graha_in_bhava", [x.id, String(x.bhava)]]));
}
export function topicsFromVedicCharaKaraka(t: VedicCharaKarakaTechnical): VedicTopic[] {
  return vedicCollect(t.karakas.map((k): [string, string[]] => ["chara_karaka", [k.id, k.graha]]));
}
export function topicsFromVedicArudha(t: VedicArudhaTechnical): VedicTopic[] {
  return vedicCollect(t.padas.flatMap((p): [string, string[]][] => [["arudha_pada_in_rashi", [p.id, p.rashi]], ["arudha_pada_in_bhava", [p.id, String(p.houseFromLagna)]]]));
}
/** Sağlayıcı sırası: 1 = en güçlü, 12 = en zayıf (eşik bizim yorumumuz değil). */
export function topicsFromVedicBhavaBala(t: VedicBhavaBalaTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const b of t.bhavas) {
    if (b.rank === 1) items.push(["bhava_bala_strongest", [String(b.house)]]);
    if (b.rank === 12) items.push(["bhava_bala_weakest", [String(b.house)]]);
  }
  return vedicCollect(items);
}
