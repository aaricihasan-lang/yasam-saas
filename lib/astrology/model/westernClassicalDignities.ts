// Klasik Asalet ve Almuten (#644) — İSTEMCİ + SUNUCU ortak SAF sabitler ve tipler. Hesap kodu İÇERMEZ (motor lib/astrology/dignities;
// birleştirici lib/astrology/engine/classicalDignities.ts). Owner kararları (01.11.2026): varsayılan ekol William Lilly (1647),
// Dorothean alternatif; harita almuteni Yunanlar (CA s. 532) STANDART, diğer setler ALTERNATİF; Lord of the Geniture YORUM etiketli.

import type { buildNatalDignities } from "../dignities/natal";
import type { DignitySchoolId } from "../dignities/schools";
import type { NatalHouseSystemOption } from "./natalHouseSystems";
import type { NodeType } from "./western";

export const CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA = "astro.western.classical_dignities.v1" as const;

export const DIGNITY_SCHOOL_IDS = ["lilly-1647", "dorothean-egyptian"] as const satisfies readonly DignitySchoolId[];
export const DEFAULT_DIGNITY_SCHOOL: DignitySchoolId = "lilly-1647";
export const DIGNITY_SCHOOL_LABELS: Readonly<Record<DignitySchoolId, string>> = { "lilly-1647": "Lilly 1647", "dorothean-egyptian": "Dorothean" };
export const DIGNITY_SCHOOL_HINTS: Readonly<Record<DignitySchoolId, string>> = {
  "lilly-1647": "Lilly üçlüleri + Lilly terimleri, puanlar CA s. 104 ve s. 115.",
  "dorothean-egyptian": "Dorothean üçlüler + Mısır terimleri.",
};
export const isDignitySchool = (x: unknown): x is DignitySchoolId => typeof x === "string" && (DIGNITY_SCHOOL_IDS as readonly string[]).includes(x);

export type NatalDignitiesResult = ReturnType<typeof buildNatalDignities>;

export type ClassicalDignitiesTechnical = {
  schema: typeof CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  /** Ev başı almutenleri ve arızi (ev) asaletinde kullanılan natal ev sistemi. */
  houseSystem: NatalHouseSystemOption;
  nodeType: NodeType;
  /** Gündüz / gece: Güneş'in doğum anındaki geometrik irtifası (> 0 gündüz). */
  sect: { day: boolean; sunAltitude: number; nearHorizon: boolean; disagreesWithEclipticRule: boolean };
  /** Doğum öncesi kavuşum / dolunay (İbn Ezra seti için). Dolunayda Ay derecesi alınır — kaynak teyidi açık (notla gösterilir). */
  syzygy: { kind: "new_moon" | "full_moon"; lon: number; atUtc: string; point: "moon" | "sun" } | null;
  dignities: NatalDignitiesResult;
};

/** Doğum öncesi dolunayda hangi derecenin alındığı (motor varsayılan vermez; kaynak teyidi açık). */
export const SYZYGY_POINT_NOTE = "Doğum öncesi lunasyon: kavuşumda kavuşum derecesi, dolunayda Ay'ın derecesi alındı (dolunayda alınacak derece kaynakta teyit edilmedi; yalnız İbn Ezra setini etkiler).";
export const CLASSICAL_DIGNITIES_SOURCE_TEXT = "Konumlar: hesaplama servisinin natal sonucu (önbellek) · Asalet, kabul ve almuten: Yaşam Sistemi yerel hesap";

// ── Türkçe etiketler (sonuç ekranı + Word/PDF raporu ortak) ──
export const DIGNITY_PLANET_LABELS: Readonly<Record<string, string>> = { sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars", jupiter: "Jüpiter", saturn: "Satürn" };
export const ESSENTIAL_LABELS: Readonly<Record<string, string>> = {
  domicile: "Burç yöneticisi",
  exaltation: "Yücelme",
  triplicity: "Üçlü",
  term: "Terim",
  face: "Yüz",
  detriment: "Zarar",
  fall: "Düşüş",
  peregrine: "Peregrin",
};
const ACCIDENTAL_LABELS: Readonly<Record<string, string>> = {
  retrograde: "Retro",
  direct: "Direkt",
  swift: "Hızlı",
  slow: "Yavaş",
  oriental: "Doğu (oriental)",
  occidental: "Batı (occidental)",
  moon_increasing: "Ay büyüyor",
  moon_decreasing: "Ay azalıyor",
  cazimi: "Cazimi",
  combust: "Yanık",
  under_beams: "Işın altında",
  free_from_combustion: "Yanmadan serbest",
  partile_conj_jupiter: "Jüpiter ile tam kavuşum",
  partile_conj_venus: "Venüs ile tam kavuşum",
  partile_trine_jupiter: "Jüpiter ile tam üçgen",
  partile_trine_venus: "Venüs ile tam üçgen",
  partile_sextile_jupiter: "Jüpiter ile tam altmışlık",
  partile_sextile_venus: "Venüs ile tam altmışlık",
  partile_conj_saturn: "Satürn ile tam kavuşum",
  partile_conj_mars: "Mars ile tam kavuşum",
  partile_opposition_saturn: "Satürn ile tam karşıt",
  partile_opposition_mars: "Mars ile tam karşıt",
  partile_square_saturn: "Satürn ile tam kare",
  partile_square_mars: "Mars ile tam kare",
  partile_conj_north_node: "Kuzey düğümle tam kavuşum",
  partile_conj_south_node: "Güney düğümle tam kavuşum",
  besieged_saturn_mars: "Satürn–Mars kuşatması",
};
export const accidentalLabel = (k: string) => (k.startsWith("house_") ? `${k.slice(6)}. ev` : (ACCIDENTAL_LABELS[k] ?? k));
export const RECEPTION_LABELS: Readonly<Record<string, string>> = { one_sided: "Tek yönlü", mutual: "Karşılıklı", mixed: "Karma", none: "—" };
export const SIGN_ANGLE_LABELS: Readonly<Record<number, string>> = { 0: "Kavuşum", 60: "Altmışlık", 90: "Kare", 120: "Üçgen", 180: "Karşıt" };
export const FIGURE_PRESET_SHORT: Readonly<Record<string, string>> = {
  greeks_ca532: "Yunanlar (CA s. 532)",
  lilly_hylegiacal5_ca507: "Lilly, beş hyleg yeri (CA s. 506–507)",
  ca530_asc_mc_lights: "Yükselen + MC + ışıklar (CA s. 530)",
  ibn_ezra_5: "İbn Ezra, beş nokta",
};
export const FIGURE_POINT_LABELS: Readonly<Record<string, string>> = { sun: "Güneş", moon: "Ay", asc: "Yükselen", mc: "MC", fortune: "Şans Noktası", prenatal_syzygy: "Doğum öncesi lunasyon" };
const SIGNS_TR = ["Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak", "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık"];
/** Ekliptik boylam → "21°58′ Oğlak" (dakika; yuvarlama taşıması dahil). */
export function dignityLon(lon: number): string {
  const l = ((lon % 360) + 360) % 360;
  let s = Math.floor(l / 30);
  let d = Math.floor(l - s * 30);
  let m = Math.round((l - s * 30 - d) * 60);
  if (m === 60) {
    m = 0;
    d += 1;
  }
  if (d === 30) {
    d = 0;
    s = (s + 1) % 12;
  }
  return `${d}°${String(m).padStart(2, "0")}′ ${SIGNS_TR[s]}`;
}
/** İşaretli puan metni ("+5", "−10", "0", null → "—"). */
export const signedPoints = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
