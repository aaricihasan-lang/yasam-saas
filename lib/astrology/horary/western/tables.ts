// Gökyüzü Atlası — Klasik Batı Horary: geleneksel asalet tabloları (SAF; hesap katmanı, ÜRÜNE BAĞLI DEĞİL).
//
// DURUM: "GELİŞTİRİLDİ — TEST BEKLİYOR / EĞİTMEN ONAYI GEREKİYOR". Bu dosya hiçbir route, motor veya ekran tarafından
// import edilmez. Tablolar yayımlanmış klasik kaynaklardan alınmıştır; hangi varyantın kullanılacağı eğitmen kararıdır:
//   • Burç yöneticileri (yalnız yedi klasik gezegen) ve yücelme dereceleri: Ptolemy, Tetrabiblos I.17–19; W. Lilly,
//     Christian Astrology (1647) I, "A Table of the Essential Dignities of the Planets" (s. 104). Bu ikisinde gelenekler
//     arasında fark yoktur.
//   • Üçlü yöneticiler: (a) Dorotheus (Carmen Astrologicum I.1) gündüz / gece / ortak; (b) Lilly'nin tablosu (Ptolemaik:
//     su üçlüsünde gündüz ve gece Mars, ortak yönetici yok). İKİ VARYANT birlikte sunulur; seçim eğitmenindir.
//   • Terimler (bounds / sınırlar): (a) Mısır terimleri (Ptolemy, Tetrabiblos I.20'de aktarılan; Vettius Valens); (b)
//     Ptolemaik terimler (Lilly'nin tablosu). Mısır terimlerinin gezegen toplamları geleneksel "küçük yıllar"a eşittir
//     (Satürn 57, Jüpiter 79, Mars 66, Venüs 82, Merkür 76 = 360) — bu, tablonun bağımsız sağlama toplamıdır (testte).
//   • Yüzler (dekanlar): Kalde sırası (Satürn, Jüpiter, Mars, Güneş, Venüs, Merkür, Ay), Koç 0°'da Mars'tan başlayarak.
//     Algoritmik olarak üretilir; tablo yazım hatası riski yoktur.
//   • Puanlar (Lilly, CA s. 115): ev 5, yücelme 4, üçlü 3, terim 2, yüz 1; zarar −5, düşüş −4, peregrine −5.

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

export type TermsVariant = "egyptian" | "ptolemaic";
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
  ptolemaic: {
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
