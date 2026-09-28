/**
 * lib/calendar/hijriUmmAlQura.ts — KANONİK Hicri takvim çekirdeği (tek kaynak, NÖTR).
 *
 * Kozmik Ajanda (lib/cosmic/hijri.ts), Hacamat, raporlar, arama ve Kupa takvimi
 * (lib/cupping/hijri.ts) Hicri günü YALNIZ bu modülden alır. Modül yalnız takvim dönüşümü yapar;
 * hiçbir gün hükmü/tavsiye (altın/sünnet/yasaklı vb.) İÇERMEZ — modüller arası nötr ortak katman.
 * Tarayıcı/ICU (Intl "islamic-umalqura") KULLANILMAZ: ICU tablosu 1450 AH (≈Mayıs 2029) sonrasında
 * resmî Umm al-Qura kuralından sapıyor ve ortama göre farklı sonuç verebilir (denetim G1).
 *
 * Yöntem (gün bazında etiketlenir — bkz. hijriUmmAlQuraTable.ts başlığı):
 *   • "umm-al-qura-official"  — Resmî Umm al-Qura tablosu (KACST), 1446–1500 AH (… 16.11.2077).
 *   • "umm-al-qura-criterion" — Resmî tablo yayımlanmamış dönem (17.11.2077 …): Umm al-Qura
 *     kuralı Mekke için Swiss Ephemeris ile uygulanarak hesaplanmış ay başları. "Resmî" DEĞİLDİR.
 * Tablo dışı tarih → null (sessiz tahmin/fallback YOK — fail-closed).
 *
 * Gün sınırı: sivil (Miladi) gün. Hicri günün akşam başladığı kural Hacamat notlarında ayrıca
 * metin olarak ele alınır; burada her Miladi gün, o günün gündüzüne denk gelen Hicri güne eşlenir.
 */
import {
  UQ_MONTH_START_JDN, UQ_FIRST_HIJRI_YEAR, UQ_OFFICIAL_MONTH_COUNT, UQ_MARGINAL_MONTH_INDEXES,
} from "./hijriUmmAlQuraTable";

export const HIJRI_MONTHS_TR: ReadonlyArray<string> = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir",
  "Cemaziyelevvel", "Cemaziyelahir", "Recep", "Şaban",
  "Ramazan", "Şevval", "Zilkade", "Zilhicce",
];

export type HijriMethod = "umm-al-qura-official" | "umm-al-qura-criterion";

export type HijriDay = {
  year: number;
  month: number;        // 1-12
  day: number;          // 1-30
  monthName: string;
  formatted: string;    // "20 Zilhicce 1447"
  method: HijriMethod;
  /** Kriter segmentinde kaynaklar arasında 1 gün fark doğabilecek sınırda ay. */
  marginal: boolean;
};

/** UI metodoloji notu (tek kaynak). */
export const HIJRI_METHOD_NOTE =
  "Hicri tarihler Ümmü'l-Kurâ (Umm al-Qura) takvimine göredir: 16.11.2077'ye kadar resmî Umm al-Qura " +
  "tablosu; sonrasında resmî tablo yayımlanmadığı için Umm al-Qura kuralı (Mekke'de gün batımında " +
  "kavuşum gerçekleşmiş ve Ay güneşten sonra batıyor) astronomik olarak uygulanarak hesaplanır. " +
  "Türkiye'de Diyanet takvimi farklı ölçüt kullandığından ay başları 1 gün farklı olabilir.";

export function hijriMethodLabel(method: HijriMethod): string {
  return method === "umm-al-qura-official"
    ? "Umm al-Qura (resmî tablo)"
    : "Umm al-Qura kuralıyla hesaplanmış (resmî tablo yok)";
}

const MARGINAL = new Set(UQ_MARGINAL_MONTH_INDEXES);
const FIRST_JDN = UQ_MONTH_START_JDN[0]!;
const END_JDN = UQ_MONTH_START_JDN[UQ_MONTH_START_JDN.length - 1]!; // hariç

/** Gregoryen takvim günü → Julian Day Number (tam sayı, saat dilimi bağımsız). */
export function gregorianToJdn(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000) + 2_440_588;
}

function isRealDay(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Gregoryen takvim günü (m: 1-12) → Hicri gün. Geçersiz gün veya tablo dışı → null. */
export function hijriFromGregorian(y: number, m: number, d: number): HijriDay | null {
  if (!isRealDay(y, m, d)) return null;
  const jdn = gregorianToJdn(y, m, d);
  if (jdn < FIRST_JDN || jdn >= END_JDN) return null;
  // ikili arama: UQ_MONTH_START_JDN[i] <= jdn < [i+1]
  let lo = 0, hi = UQ_MONTH_START_JDN.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (UQ_MONTH_START_JDN[mid]! <= jdn) lo = mid; else hi = mid - 1;
  }
  const idx = lo;
  const year = UQ_FIRST_HIJRI_YEAR + Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  const day = jdn - UQ_MONTH_START_JDN[idx]! + 1;
  const monthName = HIJRI_MONTHS_TR[month - 1]!;
  return {
    year, month, day, monthName,
    formatted: `${day} ${monthName} ${year}`,
    method: idx < UQ_OFFICIAL_MONTH_COUNT ? "umm-al-qura-official" : "umm-al-qura-criterion",
    marginal: MARGINAL.has(idx),
  };
}

/** Date'in YEREL takvim günü → Hicri gün. Geçersiz Date → null (fail-closed). */
export function hijriFromLocalDate(date: Date): HijriDay | null {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return hijriFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Tam hicri tarih: "20 Zilhicce 1447" — hesaplanamıyorsa "—". */
export function getHijriDate(date: Date): string {
  return hijriFromLocalDate(date)?.formatted ?? "—";
}

/** Ay + yıl: "Zilhicce 1447" (takvim başlığı için) — hesaplanamıyorsa "—". */
export function getHijriMonthYear(date: Date): string {
  const h = hijriFromLocalDate(date);
  return h ? `${h.monthName} ${h.year}` : "—";
}
