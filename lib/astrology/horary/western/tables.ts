// Gökyüzü Atlası — Klasik Batı Horary: geleneksel asalet tabloları (SAF; hesap katmanı, ÜRÜNE BAĞLI DEĞİL).
//
// DURUM: "GELİŞTİRİLDİ — TEST BEKLİYOR / EĞİTMEN ONAYI GEREKİYOR". Bu dosya hiçbir route, motor veya ekran tarafından
// import edilmez. Tablolar yayımlanmış klasik kaynaklardan alınmıştır; hangi varyantın kullanılacağı eğitmen kararıdır.
// Birincil kaynak: W. Lilly, Christian Astrology (1647), Wellcome tıpkıbasımı archive.org `b30338724` (CA).
//   • Burç yöneticileri (yalnız yedi klasik gezegen) ve yücelme dereceleri: Ptolemy, Tetrabiblos I.17–19; CA s. 104
//     "A Table of the Essential Dignities of the Planets". Bu ikisinde gelenekler arasında fark yoktur.
//   • Üçlü yöneticiler: (a) Dorotheus (Carmen Astrologicum I.1) gündüz / gece / ortak; (b) Lilly'nin tablosu (su
//     üçlüsünde gündüz ve gece Mars, ortak yönetici yok). İKİ VARYANT birlikte sunulur; seçim eğitmenindir.
//   • Terimler (bounds / sınırlar): (a) Mısır terimleri (Tetrabiblos I.20'de aktarılan; Vettius Valens) — gezegen
//     toplamları "küçük yıllar"a eşittir (Satürn 57, Jüpiter 79, Mars 66, Venüs 82, Merkür 76 = 360; testte sağlama);
//     (b) LILLY'NİN terim tablosu (CA s. 104). #438 bu varyanta "ptolemaic" demişti: 2026-10-19 bağımsız doğrulamada
//     12/12 satır CA s. 104 tıpkıbasımıyla birebir çıktı, ancak Robbins'in Tetrabiblos I.21 "Ptolemaik terimleri"nden 7
//     burçta farklıdır → kimliği "lilly" olarak düzeltildi (Ptolemy'nin kendi tablosu bu dosyada YOKTUR).
//   • Yüzler (dekanlar): Kalde sırası (Satürn, Jüpiter, Mars, Güneş, Venüs, Merkür, Ay), Koç 0°'da Mars'tan başlayarak.
//     Algoritmik olarak üretilir; tablo yazım hatası riski yoktur.
//   • Puanlar (CA s. 115 "A ready Table whereby to examine the Fortitudes and Debilities"): ev ya da ev yöneticiliğiyle
//     karşılıklı kabul 5, yücelme ya da yücelmeyle kabul 4, üçlü 3, terim 2, yüz 1; zarar −5, düşüş −4, peregrine −5.
//   • Arızi asalet puanları, orb (moiety) ve ortalama hız tabloları: aşağıda, her biri sayfa numarası ve OCR teyidiyle.

import type { SignId } from "../../model/western";

export const CLASSICAL_PLANETS = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"] as const;
export type ClassicalPlanet = (typeof CLASSICAL_PLANETS)[number];

export const SIGNS: readonly SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
export const signOf = (lon: number): SignId => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
export const degInSign = (lon: number): number => (((lon % 360) + 360) % 360) % 30;

/** Geleneksel burç yöneticisi (dış gezegenler YOK). */
export const DOMICILE: Readonly<Record<SignId, ClassicalPlanet>> = {
  aries: "mars", taurus: "venus", gemini: "mercury", cancer: "moon", leo: "sun", virgo: "mercury",
  libra: "venus", scorpio: "mars", sagittarius: "jupiter", capricorn: "saturn", aquarius: "saturn", pisces: "jupiter",
};

/** Yücelme burcu + derecesi (Lilly CA s. 104 = Ptolemy). Burç düzeyi tüm geleneklerde aynıdır; derece yalnız bilgi. */
export const EXALTATION: Readonly<Record<ClassicalPlanet, { sign: SignId; degree: number }>> = {
  sun: { sign: "aries", degree: 19 },
  moon: { sign: "taurus", degree: 3 },
  mercury: { sign: "virgo", degree: 15 },
  venus: { sign: "pisces", degree: 27 },
  mars: { sign: "capricorn", degree: 28 },
  jupiter: { sign: "cancer", degree: 15 },
  saturn: { sign: "libra", degree: 21 },
};

const opposite = (s: SignId): SignId => SIGNS[(SIGNS.indexOf(s) + 6) % 12];
export const detrimentSigns = (p: ClassicalPlanet): SignId[] => (Object.keys(DOMICILE) as SignId[]).filter((s) => DOMICILE[s] === p).map(opposite);
export const fallSign = (p: ClassicalPlanet): SignId => opposite(EXALTATION[p].sign);

export type Element = "fire" | "earth" | "air" | "water";
export const elementOf = (s: SignId): Element => (["fire", "earth", "air", "water"] as const)[SIGNS.indexOf(s) % 4];

export type TriplicityVariant = "dorothean" | "lilly";
/** Üçlü yöneticiler: [gündüz, gece, ortak|null]. */
export const TRIPLICITY: Readonly<Record<TriplicityVariant, Record<Element, [ClassicalPlanet, ClassicalPlanet, ClassicalPlanet | null]>>> = {
  dorothean: { fire: ["sun", "jupiter", "saturn"], earth: ["venus", "moon", "mars"], air: ["saturn", "mercury", "jupiter"], water: ["venus", "mars", "moon"] },
  lilly: { fire: ["sun", "jupiter", null], earth: ["venus", "moon", null], air: ["saturn", "mercury", null], water: ["mars", "mars", null] },
};

export type TermsVariant = "egyptian" | "lilly";
type TermRow = [ClassicalPlanet, number][]; // [yönetici, bitiş derecesi]
export const TERMS: Readonly<Record<TermsVariant, Record<SignId, TermRow>>> = {
  egyptian: {
    aries: [["jupiter", 6], ["venus", 12], ["mercury", 20], ["mars", 25], ["saturn", 30]],
    taurus: [["venus", 8], ["mercury", 14], ["jupiter", 22], ["saturn", 27], ["mars", 30]],
    gemini: [["mercury", 6], ["jupiter", 12], ["venus", 17], ["mars", 24], ["saturn", 30]],
    cancer: [["mars", 7], ["venus", 13], ["mercury", 19], ["jupiter", 26], ["saturn", 30]],
    leo: [["jupiter", 6], ["venus", 11], ["saturn", 18], ["mercury", 24], ["mars", 30]],
    virgo: [["mercury", 7], ["venus", 17], ["jupiter", 21], ["mars", 28], ["saturn", 30]],
    libra: [["saturn", 6], ["mercury", 14], ["jupiter", 21], ["venus", 28], ["mars", 30]],
    scorpio: [["mars", 7], ["venus", 11], ["mercury", 19], ["jupiter", 24], ["saturn", 30]],
    sagittarius: [["jupiter", 12], ["venus", 17], ["mercury", 21], ["saturn", 26], ["mars", 30]],
    capricorn: [["mercury", 7], ["jupiter", 14], ["venus", 22], ["saturn", 26], ["mars", 30]],
    aquarius: [["mercury", 7], ["venus", 13], ["jupiter", 20], ["mars", 25], ["saturn", 30]],
    pisces: [["venus", 12], ["jupiter", 16], ["mercury", 19], ["mars", 28], ["saturn", 30]],
  },
  // CA s. 104 (Lilly). #438'deki adı "ptolemaic" idi; içerik DEĞİŞMEDİ.
  lilly: {
    aries: [["jupiter", 6], ["venus", 14], ["mercury", 21], ["mars", 26], ["saturn", 30]],
    taurus: [["venus", 8], ["mercury", 15], ["jupiter", 22], ["saturn", 26], ["mars", 30]],
    gemini: [["mercury", 7], ["jupiter", 14], ["venus", 21], ["saturn", 25], ["mars", 30]],
    cancer: [["mars", 6], ["jupiter", 13], ["mercury", 20], ["venus", 27], ["saturn", 30]],
    leo: [["saturn", 6], ["mercury", 13], ["venus", 19], ["jupiter", 25], ["mars", 30]],
    virgo: [["mercury", 7], ["venus", 13], ["jupiter", 18], ["saturn", 24], ["mars", 30]],
    libra: [["saturn", 6], ["venus", 11], ["jupiter", 19], ["mercury", 24], ["mars", 30]],
    scorpio: [["mars", 6], ["jupiter", 14], ["venus", 21], ["mercury", 27], ["saturn", 30]],
    sagittarius: [["jupiter", 8], ["venus", 14], ["mercury", 19], ["saturn", 25], ["mars", 30]],
    capricorn: [["venus", 6], ["mercury", 12], ["jupiter", 19], ["mars", 25], ["saturn", 30]],
    aquarius: [["saturn", 6], ["mercury", 12], ["venus", 20], ["jupiter", 25], ["mars", 30]],
    pisces: [["venus", 8], ["jupiter", 14], ["mercury", 20], ["mars", 26], ["saturn", 30]],
  },
};

const CHALDEAN: readonly ClassicalPlanet[] = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
/** Yüz (dekan) yöneticisi: 36 dekan, Koç 0°'da Mars'tan Kalde sırasıyla. */
export function faceRuler(lon: number): ClassicalPlanet {
  const decan = Math.floor((((lon % 360) + 360) % 360) / 10);
  return CHALDEAN[(CHALDEAN.indexOf("mars") + decan) % 7];
}
export function termRuler(lon: number, variant: TermsVariant): ClassicalPlanet {
  const d = degInSign(lon);
  return TERMS[variant][signOf(lon)].find(([, end]) => d < end)![0];
}

export const LILLY_POINTS = { domicile: 5, exaltation: 4, triplicity: 3, term: 2, face: 1, detriment: -5, fall: -4, peregrine: -5 } as const;

// ─── Gezegen ağırlık sırası (Lilly "ponderous/light": küre sırası) ────────────────────────────────────
/** Ağırdan hafife (CA s. 113: "Saturne, Jupiter and Mars … superiour, ponderous"; Venüs, Merkür, Ay aşağı). Işık aktarımı/
 *  toplanmasındaki "daha hafif / daha ağır gezegen" karşılaştırması bu sırayla yapılır (anlık hız DEĞİL). */
export const WEIGHT_ORDER: readonly ClassicalPlanet[] = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
export const heavier = (a: ClassicalPlanet, b: ClassicalPlanet) => WEIGHT_ORDER.indexOf(a) < WEIGHT_ORDER.indexOf(b);

// ─── Orblar (CA s. 107 tablosu; s. 110 moiety kuralı) ───────────────────────────────────────────────
/** Lilly'nin orbları KİTABIN İÇİNDE TUTARLI DEĞİLDİR; s. 107 tablosunun sütunları OCR'de kaymıştır (okunamadı). Bu yüzden her
 *  değer METİN İÇİ kanıtıyla seçilmiş, çelişen ikinci değer `LILLY_ORB_ALT`'ta tutulmuştur (seçim eğitmenindir):
 *   • Satürn 10 — s. 107 platik örneği: "the moity of ♄ his Rayes or Orbs is five" (gezegen bölümünde ise "nine degrees").
 *   • Jüpiter 9 — gezegen bölümü "His Radiation or Orbe is nine degrees"; tablo değeri okunamadı.
 *   • Mars 7 — s. 107 tablosunda okunan tek satır "All consent 7"; yaygın 7°30′ değeri OCR'de YOK.
 *   • Güneş 15 — s. 110 ayrılma örneği: "half the orbs of the ☉ 7 degr. and 30 min."
 *   • Venüs 8 — s. 107 platik örneği: "[moiety] of ♀ 4" (gezegen bölümünde "Her Orbe is 7").
 *   • Merkür 7 — gezegen bölümü "His Orbe is seven degrees".
 *   • Ay 12 — s. 110 ayrılma örneği: "6 degr. the moity of her owne orbes".
 *  Moiety = orbun yarısı; iki gezegen arası açı etkisi sınırı = iki moiety'nin toplamı (s. 107 Venüs–Satürn: 5 + 4 = 9;
 *  s. 110: "every Planet that applies is allowed halfe his owne orbs and halfe the orbs of that Planet"). */
export const LILLY_ORB: Readonly<Record<ClassicalPlanet, number>> = { saturn: 10, jupiter: 9, mars: 7, sun: 15, venus: 8, mercury: 7, moon: 12 };
export const LILLY_ORB_ALT: Readonly<Partial<Record<ClassicalPlanet, number>>> = { saturn: 9, venus: 7, mars: 7.5 };
export const moiety = (p: ClassicalPlanet, orbs: Readonly<Record<ClassicalPlanet, number>> = LILLY_ORB) => orbs[p] / 2;

// ─── Ortalama günlük hız (CA gezegen bölümleri) ─────────────────────────────────────────────────────
/** Derece/gün; hızlı/yavaş arızi asaleti için. OCR'de okunan: Satürn "two minutes and one second", Jüpiter "4 min. 59 seconds",
 *  Güneş, Venüs ve Merkür "59 min. and 8 seconds", Ay "13 degr. 10 min. and 36 seconds".
 *  Mars (2026-10-28 görsel teyit): 1647 s. 65 "His mean motion is 31 degr. 27 min." — BASKI HATASI (aynı sayfa günlük hareketi
 *  "32 34 36 38 40 42 44 min. a day"); 1659 2. baskı (Wellcome b30328524_0001) "His mean motion is 31 min. 27 seconds" ve Lilly'nin
 *  kendi örneği "which you see in page 65, is 31…". Değer 31′27″. */
export const MEAN_MOTION: Readonly<Record<ClassicalPlanet, number>> = {
  saturn: 2 / 60 + 1 / 3600,
  jupiter: 4 / 60 + 59 / 3600,
  mars: 31 / 60 + 27 / 3600,
  sun: 59 / 60 + 8 / 3600,
  venus: 59 / 60 + 8 / 3600,
  mercury: 59 / 60 + 8 / 3600,
  moon: 13 + 10 / 60 + 36 / 3600,
};
export const MEAN_MOTION_UNVERIFIED: readonly ClassicalPlanet[] = [];

// ─── Arızi asalet puanları (CA s. 115) ─────────────────────────────────────────────────────────────
/** CA s. 115 tablosu — 2026-10-28 TIPKIBASIM GÖRSELİYLE satır satır teyit edildi (1647 Wellcome b30338724 yaprak n148; 1659
 *  b30328524_0001 yaprak n148). 3. ev "1" ve doğrudan "4" 1647 görselinde okunur. "Under the ☉ Beames" 1647'de bozuk dizilmiş
 *  ("+" benzeri) glif; 1659'da açıkça "4" → −4.
 *  Sabit yıldız satırları 1647 konumlarıyla yazılmıştır (Regulus Aslan 24°, Spica Terazi 18°, Algol Boğa 20° "veya 5° içinde");
 *  presesyonlu güncel konum mu, Lilly'nin derecesi mi kullanılacağı ve Regulus/Spica orbu kaynakta YOK → eğitmen kararı. */
export const LILLY_ACCIDENTAL = {
  house: { 1: 5, 10: 5, 7: 4, 4: 4, 11: 4, 2: 3, 5: 3, 9: 2, 3: 1, 12: -5, 8: -2, 6: -2 } as Readonly<Record<number, number>>,
  direct: 4,
  retrograde: -5,
  swift: 2,
  slow: -2,
  /** Satürn/Jüpiter/Mars doğulu, Venüs/Merkür batılı, Ay ışığı artarken: +2; tersi −2. */
  orientalOccidental: 2,
  freeFromCombustion: 5,
  cazimi: 5,
  combust: -5,
  underBeams: -4,
  partileConjBenefic: 5,
  partileConjNorthNode: 4,
  partileTrineBenefic: 4,
  partileSextileBenefic: 3,
  partileConjMalefic: -5,
  partileConjSouthNode: -4,
  besieged: -5,
  partileOppositionMalefic: -4,
  partileSquareMalefic: -3,
  regulus: 6,
  spica: 5,
  algol: -5,
} as const;
export const ACCIDENTAL_UNVERIFIED: readonly string[] = ["stars:position-and-orb"];
