// Transit Taraması (#646) — İSTEMCİ + SUNUCU ortak SAF sabitler, seçenek doğrulaması ve etiketler. Hesap kodu İÇERMEZ (motor
// lib/astrology/transits; birleştirici lib/astrology/engine/transitScan.ts). Owner kararları (01.11.2026): tek orb 1° varsayılan,
// 0,1–15° ayarlanabilir; tarama aralığı ilk sürümde en çok 1 yıl.

import type { ScanResult, TransitEvent } from "../transits/model";
import type { NodeType } from "./western";

export const TRANSIT_SCAN_TECHNICAL_SCHEMA = "astro.western.transit_scan.v1" as const;

/** Transit gezegenler (prototip: Ay hariç dokuz gövde; Ay ilk sürümde taramaya alınmaz). */
export const TRANSIT_SCAN_BODIES = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
export type TransitScanBody = (typeof TRANSIT_SCAN_BODIES)[number];
/** Natal noktalar: yedi klasik gezegen + Yükselen + MC. */
export const TRANSIT_SCAN_POINTS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "asc", "mc"] as const;
export type TransitScanPoint = (typeof TRANSIT_SCAN_POINTS)[number];
export const TRANSIT_SCAN_ASPECTS = ["conjunction", "opposition", "square", "trine", "sextile"] as const;
export type TransitScanAspect = (typeof TRANSIT_SCAN_ASPECTS)[number];

export const TRANSIT_SCAN_ORB_DEFAULT = 1;
export const TRANSIT_SCAN_ORB_MIN = 0.1;
export const TRANSIT_SCAN_ORB_MAX = 15;
/** İlk sürüm üst sınırı: 1 yıl (366 gün, bitiş günü dahil). Motor aralığı 1900–2100. */
export const TRANSIT_SCAN_MAX_DAYS = 366;
export const TRANSIT_SCAN_MIN_YEAR = 1900;
export const TRANSIT_SCAN_MAX_YEAR = 2100;

export type TransitScanOptions = {
  start: string;
  end: string;
  orb: number;
  bodies: TransitScanBody[];
  points: TransitScanPoint[];
  aspects: TransitScanAspect[];
  stations: boolean;
  ingresses: boolean;
  nodeType: NodeType;
  /** Gösterim saat dilimi (yalnız sunum; hesaba girmez). */
  displayTz: string;
};

export type TransitScanTechnical = {
  schema: typeof TRANSIT_SCAN_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  nodeType: NodeType;
  range: { start: string; end: string };
  orb: number;
  bodies: TransitScanBody[];
  points: TransitScanPoint[];
  aspects: TransitScanAspect[];
  include: { stations: boolean; ingresses: boolean };
  displayTz: string;
  /** Hedef natal boylamlar (Natal sonucundan). */
  natal: { id: TransitScanPoint; lon: number }[];
  /** Motor çıktısı ("closest_approach" olayları ve pencere içi yakın yaklaşma listesi gösterilmediği için çıkarılır). */
  scan: Omit<ScanResult, "events"> & { events: TransitEvent[] };
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function transitScanDayMs(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === s ? ms : null;
}

const subsetOf = <T extends string>(all: readonly T[], raw: unknown, fallback: readonly T[]): T[] | null => {
  if (raw === undefined) return [...fallback];
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((x) => typeof x !== "string" || !(all as readonly string[]).includes(x))) return null;
  return all.filter((x) => (raw as string[]).includes(x));
};

/** Aralık / sınır hatasının kullanıcı metni (yoksa null). İstemci ayarlarında ve sunucuda aynı kural. */
export function transitScanRangeIssue(start: unknown, end: unknown): string | null {
  const t0 = transitScanDayMs(start);
  const t1 = transitScanDayMs(end);
  if (t0 === null || t1 === null) return "başlangıç ve bitiş tarihini tamamlayın";
  if (t1 < t0) return "bitiş başlangıçtan önce olamaz";
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  if (y0 < TRANSIT_SCAN_MIN_YEAR || y1 > TRANSIT_SCAN_MAX_YEAR - 1) return `desteklenen yıllar ${TRANSIT_SCAN_MIN_YEAR}–${TRANSIT_SCAN_MAX_YEAR - 1}`;
  if ((t1 - t0) / 86_400_000 + 1 > TRANSIT_SCAN_MAX_DAYS) return `tarama aralığı en çok 1 yıl (${TRANSIT_SCAN_MAX_DAYS} gün)`;
  return null;
}

/** Seçenek doğrulaması (sunucu kaynağı; istemci yalnız ön kontrol için kullanır). Geçersiz → null (400). */
export function parseTransitScanOptions(raw: unknown, isValidTz: (tz: string) => boolean): TransitScanOptions | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (transitScanRangeIssue(o.start, o.end)) return null;
  const orbRaw = o.orb ?? TRANSIT_SCAN_ORB_DEFAULT;
  // Sınır yuvarlamadan ÖNCE uygulanır (0,05° → 0,1° gibi sessiz düzeltme yok); geçerli değer 0,1° adımına yuvarlanır.
  if (typeof orbRaw !== "number" || !Number.isFinite(orbRaw) || orbRaw < TRANSIT_SCAN_ORB_MIN || orbRaw > TRANSIT_SCAN_ORB_MAX) return null;
  const orb = Math.round(orbRaw * 10) / 10;
  const bodies = subsetOf(TRANSIT_SCAN_BODIES, o.bodies, TRANSIT_SCAN_BODIES);
  const points = subsetOf(TRANSIT_SCAN_POINTS, o.points, TRANSIT_SCAN_POINTS);
  const aspects = subsetOf(TRANSIT_SCAN_ASPECTS, o.aspects, TRANSIT_SCAN_ASPECTS);
  if (!bodies || !points || !aspects) return null;
  const stations = o.stations === undefined ? true : o.stations;
  const ingresses = o.ingresses === undefined ? true : o.ingresses;
  if (typeof stations !== "boolean" || typeof ingresses !== "boolean") return null;
  const nodeType = o.nodeType ?? "true";
  if (nodeType !== "true" && nodeType !== "mean") return null;
  const displayTz = o.displayTz ?? "Europe/Istanbul";
  if (typeof displayTz !== "string" || !isValidTz(displayTz)) return null;
  return { start: o.start as string, end: o.end as string, orb, bodies, points, aspects, stations, ingresses, nodeType, displayTz };
}

// ── Türkçe etiketler (sonuç ekranı + Word/PDF ortak) ──
export const TRANSIT_SCAN_LABELS: Readonly<Record<string, string>> = {
  sun: "Güneş",
  moon: "Ay",
  mercury: "Merkür",
  venus: "Venüs",
  mars: "Mars",
  jupiter: "Jüpiter",
  saturn: "Satürn",
  uranus: "Uranüs",
  neptune: "Neptün",
  pluto: "Plüton",
  asc: "Yükselen",
  mc: "MC",
};
export const TRANSIT_SCAN_ASPECT_LABELS: Readonly<Record<string, string>> = { conjunction: "Kavuşum", opposition: "Karşıt", square: "Kare", trine: "Üçgen", sextile: "Altmışlık" };
export const TRANSIT_SCAN_CLASS_LABELS: Readonly<Record<string, string>> = { single: "Tek geçiş", multiple: "Çoklu geçiş", tangential: "Teğet (tam olmadan döner)", none_in_range: "Aralıkta yok" };
export const TRANSIT_SCAN_SIGNS = ["Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak", "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık"];
export const TRANSIT_SCAN_SIGN_KEYS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
export const TRANSIT_SCAN_SOURCE_TEXT = "Natal noktalar: hesaplama servisinin natal sonucu (önbellek) · Transit taraması: Yaşam Sistemi yerel hesap";

/** Belirsizlik metni (±sn / ±dk / ±sa). */
export function transitScanUnc(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "";
  if (sec < 90) return `±${Math.round(sec)} sn`;
  if (sec < 5400) return `±${Math.round(sec / 60)} dk`;
  return `±${(sec / 3600).toFixed(1).replace(".", ",")} sa`;
}
