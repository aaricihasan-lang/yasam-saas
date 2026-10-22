// Astroloji — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" SEÇENEĞİ teknik modeli (SAF; 2026-10-22).
//
// Seçilen GÜN + KONUM için sağlayıcının hora (12 gündüz + 12 gece) ve choghadiya (8 gündüz + 8 gece) dilimleri. Doğum anı
// panchangasından ve "Ayrıntılı Panchanga"dan AYRI parçalardır; eski kayıtlarda alan yoktur. Hesap YOK: yalnız sağlayıcı verisi;
// klasik sıra tabloları adaptörde TUTARLILIK denetimi içindir (bağımsız doğrulama testte ayrıca yapılır).

import type { VedicGrahaId, VedicPanchangaTechnical } from "./vedic";

export const VEDIC_HORA_SCHEMA = "astro.vedic.panchanga.hora.v1" as const;
export const VEDIC_CHOGHADIYA_SCHEMA = "astro.vedic.panchanga.choghadiya.v1" as const;

export type HoursPlace = { latitude: number; longitude: number; utcOffsetHours: number; label: string | null };
/** Saatler seçilen yerin o günkü yerel saatidir ("YYYY-MM-DDTHH:MM:SS", sağlayıcı dakika hassasiyeti). */
export type HoraSlot = { n: number; lord: Exclude<VedicGrahaId, "rahu" | "ketu">; start: string; end: string };
export type VedicHoraTechnical = {
  schema: typeof VEDIC_HORA_SCHEMA;
  date: string;
  place: HoursPlace;
  /** Haftanın günü yöneticisi (gün doğumunda başlar) = 1. gündüz horası. */
  dayLord: Exclude<VedicGrahaId, "rahu" | "ketu">;
  day: HoraSlot[];
  night: HoraSlot[];
};

export const CHOGHADIYA_NAMES = ["udveg", "amrit", "rog", "labh", "shubh", "char", "kaal"] as const;
export type ChoghadiyaName = (typeof CHOGHADIYA_NAMES)[number];
export type ChoghadiyaSlot = { n: number; name: ChoghadiyaName; lord: Exclude<VedicGrahaId, "rahu" | "ketu">; effect: "good" | "bad"; start: string; end: string };
export type VedicChoghadiyaTechnical = {
  schema: typeof VEDIC_CHOGHADIYA_SCHEMA;
  date: string;
  place: HoursPlace;
  dayLord: Exclude<VedicGrahaId, "rahu" | "ketu">;
  day: ChoghadiyaSlot[];
  night: ChoghadiyaSlot[];
};

/** vedic.panchanga birleşik teknik verisine eklenen alan (seçenek yoksa alan YOK). Eksik parça null + missing. */
export type PanchangaHours = { date: string; hora: VedicHoraTechnical | null; choghadiya: VedicChoghadiyaTechnical | null; missing: ("hora" | "choghadiya")[] };
export type VedicPanchangaWithHours = VedicPanchangaTechnical & { hours?: PanchangaHours | null };

/** Klasik Kaldani (Chaldean) hora sırası (Güneş'ten): her hora bir sonraki gezegene geçer. */
export const HORA_SEQUENCE = ["sun", "venus", "mercury", "moon", "saturn", "jupiter", "mars"] as const;
/** Choghadiya adı ↔ yöneticisi ↔ klasik sınıf (iyi: Amrit, Shubh, Labh, Char · kötü: Udveg, Rog, Kaal). */
export const CHOGHADIYA_LORD: Readonly<Record<ChoghadiyaName, (typeof HORA_SEQUENCE)[number]>> = { udveg: "sun", char: "venus", labh: "mercury", amrit: "moon", kaal: "saturn", shubh: "jupiter", rog: "mars" };
export const CHOGHADIYA_GOOD: ReadonlySet<ChoghadiyaName> = new Set(["amrit", "shubh", "labh", "char"]);

export const CHOGHADIYA_LABELS: Readonly<Record<ChoghadiyaName, string>> = {
  amrit: "Amrit",
  shubh: "Shubh",
  labh: "Labh",
  char: "Char",
  udveg: "Udveg",
  rog: "Rog",
  kaal: "Kaal",
};
export const CHOGHADIYA_EFFECT_LABEL = { good: "olumlu", bad: "olumsuz" } as const;

export const PANCHANGA_HOURS_NOTE =
  "Hora: gündüz (gün doğumu → gün batımı) ve gece (gün batımı → ertesi gün doğumu) 12'şer eşit parça; yönetici sırası haftanın günü yöneticisinden başlayarak Kaldani sırasıyla ilerler. Choghadiya: gündüz ve gece 8'er eşit parça; olumlu/olumsuz sınıfı geleneksel sınıflamadır. Saatler seçilen yerin o günkü yerel saatidir.";
