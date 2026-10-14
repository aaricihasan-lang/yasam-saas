// Astroloji — SABİT YILDIZ KATALOĞU (Yaşam'ın kendi sözlüğü; SAF, istemci güvenli).
//
// Kimlikler Roxy /astrology/fixed-stars kanonik `id`'leridir (2026-10-14 gerçek yanıt: 43 yıldız).
// Alanlar:
//   • name: görüntü adı (Roxy ile aynı Latin harfli ad)
//   • bayer: Bayer adlandırması (Swiss Ephemeris sefstars.txt / SIMBAD nomenklatürü)
//   • constellation: takımyıldızın Türkçe adı (Latince ad parantezde)
//   • altNames: yaygın diğer adlar (yalnız doğrulanabilenler; emin olunmayan Türkçe halk adı EKLENMEZ)
//   • latJ2000: ekliptik enlem (derece, J2000) — Yaşam hesaplaması: SIMBAD ICRS J2000 konumu (Swiss Ephemeris
//     sefstars.txt üzerinden) → J2000 ekliptiği. Sağlayıcı enlem VERMEZ; bu değer yalnız "ekliptiğe uzaklık"
//     uyarısı için gösterilir (presesyonla yüzyılda yalnız ~0,01° değişir).
//   • royal: dört "Kraliyet yıldızı" (Pers geleneği; Aldebaran, Regulus, Antares, Fomalhaut)
//   • behenian: Agrippa'nın (De Occulta Philosophia, 1533) 15 Behenian yıldızından biri (Ülker → Alcyone)
// Bilinmeyen kimlik (sağlayıcı ileride yeni yıldız eklerse) ATILMAZ: kimlikten türetilen adla gösterilir.

export type FixedStarCatalogEntry = {
  name: string;
  bayer: string;
  constellation: string;
  altNames: string[];
  latJ2000: number;
  royal?: true;
  behenian?: true;
};

export const FIXED_STAR_CATALOG: Readonly<Record<string, FixedStarCatalogEntry>> = Object.freeze({
  algenib: { name: "Algenib", bayer: "γ Pegasi", constellation: "Kanatlı At (Pegasus)", altNames: [], latJ2000: 12.6 },
  alpheratz: { name: "Alpheratz", bayer: "α Andromedae", constellation: "Andromeda", altNames: ["Sirrah"], latJ2000: 25.7 },
  mirach: { name: "Mirach", bayer: "β Andromedae", constellation: "Andromeda", altNames: [], latJ2000: 25.9 },
  achernar: { name: "Achernar", bayer: "α Eridani", constellation: "Irmak (Eridanus)", altNames: ["Ağız"], latJ2000: -59.4 },
  hamal: { name: "Hamal", bayer: "α Arietis", constellation: "Koç (Aries)", altNames: [], latJ2000: 10.0 },
  polaris: { name: "Polaris", bayer: "α Ursae Minoris", constellation: "Küçük Ayı (Ursa Minor)", altNames: ["Kutup Yıldızı", "Demirkazık", "Şimal Yıldızı"], latJ2000: 66.1 },
  menkar: { name: "Menkar", bayer: "α Ceti", constellation: "Balina (Cetus)", altNames: ["Menkab"], latJ2000: -12.6 },
  algol: { name: "Algol", bayer: "β Persei", constellation: "Kahraman (Perseus)", altNames: [], latJ2000: 22.4, behenian: true },
  mirfak: { name: "Mirfak", bayer: "α Persei", constellation: "Kahraman (Perseus)", altNames: ["Algenib Persei"], latJ2000: 30.1 },
  alcyone: { name: "Alcyone", bayer: "η Tauri", constellation: "Boğa (Taurus) — Ülker kümesi", altNames: ["Ülker (Pleiades) kümesinin en parlak yıldızı"], latJ2000: 4.1, behenian: true },
  aldebaran: { name: "Aldebaran", bayer: "α Tauri", constellation: "Boğa (Taurus)", altNames: [], latJ2000: -5.5, royal: true, behenian: true },
  rigel: { name: "Rigel", bayer: "β Orionis", constellation: "Avcı (Orion)", altNames: [], latJ2000: -31.1 },
  capella: { name: "Capella", bayer: "α Aurigae", constellation: "Arabacı (Auriga)", altNames: ["Kapella"], latJ2000: 22.9, behenian: true },
  bellatrix: { name: "Bellatrix", bayer: "γ Orionis", constellation: "Avcı (Orion)", altNames: [], latJ2000: -16.8 },
  betelgeuse: { name: "Betelgeuse", bayer: "α Orionis", constellation: "Avcı (Orion)", altNames: [], latJ2000: -16.0 },
  canopus: { name: "Canopus", bayer: "α Carinae", constellation: "Karina (Carina)", altNames: ["Kanopus"], latJ2000: -75.8 },
  sirius: { name: "Sirius", bayer: "α Canis Majoris", constellation: "Büyük Köpek (Canis Major)", altNames: ["Akyıldız"], latJ2000: -39.6, behenian: true },
  castor: { name: "Castor", bayer: "α Geminorum", constellation: "İkizler (Gemini)", altNames: [], latJ2000: 10.1 },
  procyon: { name: "Procyon", bayer: "α Canis Minoris", constellation: "Küçük Köpek (Canis Minor)", altNames: [], latJ2000: -16.0, behenian: true },
  pollux: { name: "Pollux", bayer: "β Geminorum", constellation: "İkizler (Gemini)", altNames: [], latJ2000: 6.7 },
  alphard: { name: "Alphard", bayer: "α Hydrae", constellation: "Suyılanı (Hydra)", altNames: [], latJ2000: -22.4 },
  regulus: { name: "Regulus", bayer: "α Leonis", constellation: "Aslan (Leo)", altNames: ["Kalb-ül-esed", "Cor Leonis"], latJ2000: 0.5, royal: true, behenian: true },
  denebola: { name: "Denebola", bayer: "β Leonis", constellation: "Aslan (Leo)", altNames: [], latJ2000: 12.3 },
  acrux: { name: "Acrux", bayer: "α Crucis", constellation: "Güney Haçı (Crux)", altNames: [], latJ2000: -52.9 },
  algorab: { name: "Algorab", bayer: "δ Corvi", constellation: "Karga (Corvus)", altNames: [], latJ2000: -12.2, behenian: true },
  vindemiatrix: { name: "Vindemiatrix", bayer: "ε Virginis", constellation: "Başak (Virgo)", altNames: [], latJ2000: 16.2 },
  spica: { name: "Spica", bayer: "α Virginis", constellation: "Başak (Virgo)", altNames: ["Başakçı", "Azimech"], latJ2000: -2.1, behenian: true },
  arcturus: { name: "Arcturus", bayer: "α Boötis", constellation: "Çoban (Boötes)", altNames: [], latJ2000: 30.7, behenian: true },
  hadar: { name: "Hadar", bayer: "β Centauri", constellation: "Erboğa (Centaurus)", altNames: ["Agena"], latJ2000: -44.1 },
  toliman: { name: "Toliman", bayer: "α Centauri", constellation: "Erboğa (Centaurus)", altNames: ["Rigil Kentaurus", "Alpha Centauri (α Cen sistemi; IAU \"Toliman\" adını yalnız α Cen B için kullanır)"], latJ2000: -42.6 },
  "zuben-elgenubi": { name: "Zuben Elgenubi", bayer: "α² Librae", constellation: "Terazi (Libra)", altNames: ["Zubenelgenubi"], latJ2000: 0.3 },
  "zuben-eschamali": { name: "Zuben Eschamali", bayer: "β Librae", constellation: "Terazi (Libra)", altNames: ["Zubeneschamali"], latJ2000: 8.5 },
  alphecca: { name: "Alphecca", bayer: "α Coronae Borealis", constellation: "Kuzey Tacı (Corona Borealis)", altNames: ["Gemma"], latJ2000: 44.3, behenian: true },
  antares: { name: "Antares", bayer: "α Scorpii", constellation: "Akrep (Scorpius)", altNames: ["Cor Scorpii"], latJ2000: -4.6, royal: true, behenian: true },
  sabik: { name: "Sabik", bayer: "η Ophiuchi", constellation: "Yılancı (Ophiuchus)", altNames: [], latJ2000: 7.2 },
  rasalhague: { name: "Rasalhague", bayer: "α Ophiuchi", constellation: "Yılancı (Ophiuchus)", altNames: [], latJ2000: 35.8 },
  vega: { name: "Vega", bayer: "α Lyrae", constellation: "Çalgı (Lyra)", altNames: ["Wega"], latJ2000: 61.7, behenian: true },
  altair: { name: "Altair", bayer: "α Aquilae", constellation: "Kartal (Aquila)", altNames: ["Atair"], latJ2000: 29.3 },
  deneb: { name: "Deneb", bayer: "α Cygni", constellation: "Kuğu (Cygnus)", altNames: ["Deneb Adige"], latJ2000: 59.9 },
  "deneb-algedi": { name: "Deneb Algedi", bayer: "δ Capricorni", constellation: "Oğlak (Capricornus)", altNames: ["Deneb Algiedi"], latJ2000: -2.6, behenian: true },
  fomalhaut: { name: "Fomalhaut", bayer: "α Piscis Austrini", constellation: "Güney Balığı (Piscis Austrinus)", altNames: [], latJ2000: -21.1, royal: true },
  scheat: { name: "Scheat", bayer: "β Pegasi", constellation: "Kanatlı At (Pegasus)", altNames: [], latJ2000: 31.1 },
  markab: { name: "Markab", bayer: "α Pegasi", constellation: "Kanatlı At (Pegasus)", altNames: [], latJ2000: 19.4 },
});

export const FIXED_STAR_IDS = Object.keys(FIXED_STAR_CATALOG);

/** Ekliptik enlemi bu değerden büyük yıldızlarda boylam kavuşumu bir İZDÜŞÜMDÜR (yıldız gökte o gezegenden uzaktır). */
export const FIXED_STAR_FAR_LAT = 30;

/** Görüntü adı: katalogdan; bilinmeyen kimlik → kimlikten türetilen ad (sağlayıcı metni değil). */
export function fixedStarName(id: string): string {
  return FIXED_STAR_CATALOG[id]?.name ?? id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export const TRADITIONAL_PLANET_LABELS: Record<string, string> = {
  sun: "Güneş",
  moon: "Ay",
  mercury: "Merkür",
  venus: "Venüs",
  mars: "Mars",
  jupiter: "Jüpiter",
  saturn: "Satürn",
};

/** Geleneksel doğa etiketi: ["saturn","jupiter"] → "Satürn + Jüpiter". */
export function fixedStarNatureLabel(nature: readonly string[] | null | undefined): string {
  if (!nature || nature.length === 0) return "—";
  return nature.map((p) => TRADITIONAL_PLANET_LABELS[p] ?? p).join(" + ");
}

/**
 * Roxy anahtar kelimeleri lang=tr ile de İngilizce gelir (2026-10-14 gerçek yanıt: 105 farklı sözcük). Görüntüde
 * bu sabit sözlükle Türkçeleştirilir; sözlükte olmayan sözcük OLDUĞU GİBİ (İngilizce) gösterilir — uydurulmaz.
 */
export const STAR_KEYWORD_TR: Readonly<Record<string, string>> = Object.freeze({
  activity: "etkinlik",
  adventure: "macera",
  adversity: "zorluk",
  ambition: "hırs",
  art: "sanat",
  artistry: "sanatkârlık",
  audacity: "cüret",
  beauty: "güzellik",
  beneficence: "iyilikseverlik",
  boldness: "atılganlık",
  brilliance: "parlaklık",
  caution: "temkin",
  ceremony: "tören",
  charisma: "karizma",
  command: "komuta",
  competition: "rekabet",
  courage: "cesaret",
  crisis: "kriz",
  cunning: "kurnazlık",
  curiosity: "merak",
  danger: "tehlike",
  deceit: "aldatma",
  defiance: "meydan okuma",
  determination: "kararlılık",
  devotion: "bağlılık",
  dignity: "vakar",
  direction: "yön",
  disgrace: "itibar kaybı",
  distinction: "seçkinlik",
  downfall: "düşüş",
  eloquence: "belagat",
  eminence: "yüksek mevki",
  endurance: "dayanıklılık",
  excess: "aşırılık",
  falsity: "sahtelik",
  fame: "şöhret",
  folly: "akılsızlık",
  force: "güç kullanımı",
  forcefulness: "zorlayıcılık",
  fortune: "talih",
  friendship: "dostluk",
  "good fortune": "iyi talih",
  guidance: "rehberlik",
  healing: "şifa",
  honor: "onur",
  honors: "onurlar",
  humanitarianism: "insaniyetçilik",
  idealism: "idealizm",
  independence: "bağımsızlık",
  ingenuity: "yaratıcı zekâ",
  inheritance: "miras",
  integrity: "dürüstlük",
  intellect: "akıl",
  intelligence: "zekâ",
  intensity: "yoğunluk",
  judgment: "yargı",
  justice: "adalet",
  kindness: "nezaket",
  knowledge: "bilgi",
  law: "hukuk",
  leadership: "liderlik",
  learning: "öğrenme",
  loss: "kayıp",
  love: "sevgi",
  malevolence: "kötü niyet",
  melancholy: "melankoli",
  misfortune: "talihsizlik",
  mysticism: "mistisizm",
  nobility: "asalet",
  notoriety: "kötü şöhret",
  obstinacy: "inatçılık",
  obstruction: "engel",
  passion: "tutku",
  philosophy: "felsefe",
  piety: "dindarlık",
  poetry: "şiir",
  power: "güç",
  preferment: "terfi",
  pride: "gurur",
  prosperity: "refah",
  "public office": "kamu görevi",
  rashness: "düşüncesizlik",
  recovery: "iyileşme",
  refinement: "incelik",
  religion: "din",
  renown: "ün",
  riches: "zenginlik",
  royalty: "krallık",
  ruin: "yıkım",
  "self-control": "öz denetim",
  sorrow: "keder",
  spirituality: "maneviyat",
  strategy: "strateji",
  strength: "kuvvet",
  success: "başarı",
  "sudden success": "ani başarı",
  talent: "yetenek",
  transformation: "dönüşüm",
  travel: "yolculuk",
  vision: "vizyon",
  voyages: "seyahatler",
  wastefulness: "savurganlık",
  wealth: "servet",
  wisdom: "bilgelik",
  writing: "yazı",
});

export function starKeywordTr(k: string): string {
  return STAR_KEYWORD_TR[k.trim().toLowerCase()] ?? k;
}

/** Kadir (magnitude) sınıfı — küçük değer = daha parlak. */
export function magnitudeClass(m: number): string {
  if (m < 0.5) return "1. kadir (çok parlak)";
  if (m < 1.5) return "1. kadir";
  if (m < 2.5) return "2. kadir";
  return "3. kadir";
}

const GREEK_LATIN: Record<string, string> = { "α": "Alpha", "β": "Beta", "γ": "Gamma", "δ": "Delta", "ε": "Epsilon", "η": "Eta" };
/** Bayer adının okunur Latince yazımı ("γ Pegasi" → "Gamma Pegasi"; "α² Librae" → "Alpha-2 Librae"). */
export function bayerLatin(bayer: string): string {
  return bayer.replace(/^([αβγδεη])(²|¹)?\s/, (_, g: string, sup: string | undefined) => `${GREEK_LATIN[g]}${sup === "²" ? "-2" : sup === "¹" ? "-1" : ""} `);
}

/** Özgün astronomik gösterim + okunur karşılık: "γ Pegasi (Gamma Pegasi)" (owner kararı 2026-10-14: Yunan harfi kaldırılmaz). */
export function bayerBoth(bayer: string): string {
  const latin = bayerLatin(bayer);
  return latin === bayer ? bayer : `${bayer} (${latin})`;
}
