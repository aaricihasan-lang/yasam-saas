// Astroloji — KP Ruling Planets ZAMAN ARALIĞI TARAMASI teknik modeli (SAF; 2026-10-22; teknik kimliği `kp.ruling_interval`).
//
// Mevcut "KP ruling planets" (kp.ruling) tekniğinden AYRI bir analizdir: her adımda gözlem yerinde o anın gökyüzü haritası (Placidus
// prashna) kurulur; significator'lar O ANIN haritasından gelir. kp.ruling ise tek an + doğum haritasının (natal) significator'larıdır.
// Doğum verisi kullanılmaz. Hesap motoru sağlayıcıdır; burada yalnız tip, sınırlar, etiketler ve türetilmiş GÖSTERİM (değişim anları).

import type { VedicGrahaId } from "./vedic";
import type { KpAyanamsaId, KpLordSet } from "./kp";

export const KP_RULING_INTERVAL_TECHNICAL_SCHEMA = "astro.kp.ruling_interval.v1" as const;

/** Adım seçenekleri (dk) ve sınırlar: en çok 24 saat, en çok 121 an (yanıt + kayıt boyutu; ~2,5 KB/an). */
export const KP_RI_STEPS = [1, 2, 5, 10, 15, 30, 60] as const;
export const KP_RI_MAX_MINUTES = 1440;
export const KP_RI_MAX_POINTS = 121;
export const KP_RI_DEFAULT = { durationMinutes: 120, intervalMinutes: 10 } as const;

export type KpLevelHouses = { 1: number[]; 2: number[]; 3: number[]; 4: number[] };
export type KpRulingIntervalRow = {
  /** Gözlem yerinin yerel saati (pencere boyunca tek ofset) "YYYY-MM-DDTHH:MM". */
  local: string;
  /** Aynı anın UTC karşılığı "YYYY-MM-DDTHH:MM". */
  utc: string;
  dayLord: VedicGrahaId;
  moon: KpLordSet;
  lagna: KpLordSet;
  /** Klasik 5 öğe kümesi (gün lordu, Ay burç + yıldız lordu, Lagna burç + yıldız lordu) — sağlayıcı sırası. */
  rulingPlanets: VedicGrahaId[];
  /** Her ruling planet'in O ANIN haritasında gösterdiği evler (sağlayıcının güç sırası). */
  significators: { id: VedicGrahaId; houses: number[] }[];
  /** Ay zincirinin 4 düzeyli significator kırılımı (o anın haritası). */
  moonLevels: { signLord: KpLevelHouses; starLord: KpLevelHouses; subLord: KpLevelHouses; moon: KpLevelHouses };
};
export type KpRulingIntervalTechnical = {
  schema: typeof KP_RULING_INTERVAL_TECHNICAL_SCHEMA;
  frame: { ayanamsa: KpAyanamsaId };
  nodeType: "mean" | "true";
  method: "moment_chart";
  window: { startUtc: string; endUtc: string; startLocal: string; endLocal: string; utcOffsetHours: number; durationMinutes: number; intervalMinutes: number };
  place: { latitude: number; longitude: number; label: string | null };
  rows: KpRulingIntervalRow[];
};

export const KP_RI_METHOD_NOTE =
  "Zaman aralığı taraması: her adımda gözlem yerinde o anın gökyüzü haritası (Placidus) kurulur; significator'lar o anın haritasındaki evlerdir. Bu, “KP ruling planets” tekniğindeki doğum haritası (natal) significator'larından FARKLI bir yöntemdir; iki tablo birbirinin yerine kullanılmamalıdır. Doğum verisi kullanılmaz.";
export const KP_RI_RULE_NOTE =
  "Ruling planets kümesi klasik beş öğedir: gün lordu (Vara, yerel gün doğumunda değişir), Ay'ın burç ve yıldız lordu, Lagna'nın burç ve yıldız lordu. Sub ve sub-sub lordlar kümeye katılmaz; yalnız gösterilir.";
export const KP_RI_NUMBER_NOTE = "Bu taramada KP numarası (1–249) verilmez; sign / star / sub / sub-sub lord zinciri KP alt bölüm tablosuyla tek tek denetlenir.";

export const KP_RI_CHANGE_KEYS = ["dayLord", "lagna.sign", "lagna.star", "lagna.sub", "lagna.subSub", "moon.sign", "moon.star", "moon.sub", "moon.subSub", "rulingPlanets"] as const;
export type KpRiChangeKey = (typeof KP_RI_CHANGE_KEYS)[number];
export const KP_RI_CHANGE_LABEL: Readonly<Record<KpRiChangeKey, string>> = {
  dayLord: "gün lordu",
  "lagna.sign": "Lagna burç lordu",
  "lagna.star": "Lagna yıldız lordu",
  "lagna.sub": "Lagna sub lordu",
  "lagna.subSub": "Lagna sub-sub lordu",
  "moon.sign": "Ay burç lordu",
  "moon.star": "Ay yıldız lordu",
  "moon.sub": "Ay sub lordu",
  "moon.subSub": "Ay sub-sub lordu",
  rulingPlanets: "ruling planets kümesi",
};

const val = (r: KpRulingIntervalRow, k: KpRiChangeKey): string => {
  if (k === "dayLord") return r.dayLord;
  if (k === "rulingPlanets") return [...r.rulingPlanets].sort().join();
  const [a, b] = k.split(".") as ["lagna" | "moon", keyof KpLordSet];
  return r[a][b];
};
/** Türetilmiş GÖSTERİM: her satırda bir önceki satıra göre değişen alanlar (ilk satır boş). Hesap değildir. */
export function kpIntervalChanges(rows: KpRulingIntervalRow[]): KpRiChangeKey[][] {
  return rows.map((r, i) => (i === 0 ? [] : KP_RI_CHANGE_KEYS.filter((k) => val(r, k) !== val(rows[i - 1], k))));
}
/** Pencere sınırları geçerli mi (adım listede, süre adımın katı, ≤ 24 sa, ≤ 121 an)? */
export function kpIntervalWindowOk(durationMinutes: number, intervalMinutes: number): boolean {
  return (
    Number.isInteger(durationMinutes) &&
    (KP_RI_STEPS as readonly number[]).includes(intervalMinutes) &&
    durationMinutes >= intervalMinutes &&
    durationMinutes <= KP_RI_MAX_MINUTES &&
    durationMinutes % intervalMinutes === 0 &&
    durationMinutes / intervalMinutes + 1 <= KP_RI_MAX_POINTS
  );
}
