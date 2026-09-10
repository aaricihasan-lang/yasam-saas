/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — NÖTR TOPLU GÜN SEÇİMİ (saf mantık).
 *
 * Profesyonel KENDİ ölçütünü tanımlar; sistem ASLA "doğru/uygun/önerilen" gün üretmez.
 * Bu modül yalnızca kullanıcının seçtiği ölçütleri SOMUT Gregoryen tarihlere çözer.
 *
 * NÖTRLÜK SÖZLEŞMESİ (KESİN):
 *   - Ön-seçili / önerilen / varsayılan ölçüt YOK.
 *   - 17/19/21 gibi sabit gün seti YOK; ekol/gelenek preset'i YOK.
 *   - "sünnet/uygun/altın/yasaklı" kavramı YOK; haftagünü yasağı YOK.
 *   - Kozmik Hacamat (lib/cosmic/hacamat.ts) ile HİÇBİR bağ YOK.
 *   - Ölçütler EPHEMERAL'dir; burada/DB'de/localStorage'da KALICILAŞTIRILMAZ.
 *
 * ÇOKLU GRUP → AND: birden fazla ölçüt grubu verilirse HEPSİNİ sağlayan günler döner.
 *   Tek grup verilirse yalnız o grup filtreler. Hiç grup yoksa BOŞ döner (yıl geneli seçilmez).
 */
import { gregorianToHijri, monthHijriCells } from "@/lib/cupping/hijri";

/** Kullanıcının serbestçe seçtiği ölçütler (hiçbiri ön-doldurulmaz). */
export type BulkCriteria = {
  /** Opsiyonel Gregoryen tarih aralığı (plan yılı içinde), "YYYY-MM-DD". */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Kullanıcının seçtiği Hicrî ay-günü numaraları (1–30). */
  hijriDays?: number[];
  /** Kullanıcının seçtiği haftagünleri; ISO 1=Pazartesi … 7=Pazar. */
  weekdays?: number[];
  /**
   * Kullanıcının seçtiği Gregoryen ay numaraları (1=Ocak … 12=Aralık).
   * EPHEMERAL UI durumu; DB'ye/localStorage'a KALICILAŞTIRILMAZ. Ön-seçili DEĞİL.
   * Seçiliyse sonuçlar YALNIZ bu aylarda kalır (diğer ölçütlerle AND). Boşsa ay filtresi
   * uygulanmaz (mevcut yıl-geneli/aralık davranışı korunur).
   */
  months?: number[];
};

/** Türkçe haftagünü etiketleri (ISO 1=Pzt … 7=Paz). YALNIZ AD — hiçbir hüküm taşımaz. */
export const WEEKDAYS_TR: { iso: number; long: string; short: string }[] = [
  { iso: 1, long: "Pazartesi", short: "Pzt" },
  { iso: 2, long: "Salı", short: "Sal" },
  { iso: 3, long: "Çarşamba", short: "Çar" },
  { iso: 4, long: "Perşembe", short: "Per" },
  { iso: 5, long: "Cuma", short: "Cum" },
  { iso: 6, long: "Cumartesi", short: "Cmt" },
  { iso: 7, long: "Pazar", short: "Paz" },
];

/** Bir "YYYY-MM-DD" tarihin ISO haftagünü (1=Pzt … 7=Paz). UTC öğle → kayma yok. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); // 0=Paz … 6=Cmt
  return dow === 0 ? 7 : dow;
}

export function validHijriDay(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 30;
}
export function validWeekday(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7;
}
/** Gregoryen ay numarası doğrulaması (1=Ocak … 12=Aralık). */
export function validMonth(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 12;
}

/** Verilen ölçütlerin en az bir aktif grubu var mı? (Yoksa sonuç kümesi boştur.) */
export function hasAnyCriteria(c: BulkCriteria): boolean {
  const hasRange = !!(c.rangeStart && c.rangeEnd);
  const hasHijri = Array.isArray(c.hijriDays) && c.hijriDays.length > 0;
  const hasWeekday = Array.isArray(c.weekdays) && c.weekdays.length > 0;
  const hasMonths = Array.isArray(c.months) && c.months.length > 0;
  return hasRange || hasHijri || hasWeekday || hasMonths;
}

/**
 * Ölçütleri plan yılı içindeki SOMUT Gregoryen tarihlere (YYYY-MM-DD) çözer.
 * AND semantiği; sonuç artan sırada, tekilleştirilmiş. Geçersiz Hicrî gün (ör. o ayda
 * 30 yoksa) o ay için EŞLEŞME ÜRETMEZ — sahte tarih UYDURULMAZ.
 */
export function computeBulkDates(year: number, c: BulkCriteria): string[] {
  if (!Number.isInteger(year) || !hasAnyCriteria(c)) return [];

  const hijriSet =
    Array.isArray(c.hijriDays) && c.hijriDays.length > 0
      ? new Set(c.hijriDays.filter(validHijriDay))
      : null;
  const weekdaySet =
    Array.isArray(c.weekdays) && c.weekdays.length > 0
      ? new Set(c.weekdays.filter(validWeekday))
      : null;
  const monthSet =
    Array.isArray(c.months) && c.months.length > 0
      ? new Set(c.months.filter(validMonth))
      : null;
  const rangeStart = c.rangeStart && c.rangeEnd ? c.rangeStart : null;
  const rangeEnd = c.rangeStart && c.rangeEnd ? c.rangeEnd : null;
  // Geçersiz aralık (start>end) → boş sonuç (sessiz uydurma yok).
  if (rangeStart && rangeEnd && rangeStart > rangeEnd) return [];
  // Aktif grup filtrelenip hiçbir geçerli değer kalmadıysa (ör. tüm Hicrî günler geçersiz) boş dön.
  if (hijriSet && hijriSet.size === 0) return [];
  if (weekdaySet && weekdaySet.size === 0) return [];
  if (monthSet && monthSet.size === 0) return [];

  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    // Gregoryen ay filtresi (seçiliyse yalnız o aylar; AND). Ay hiç seçilmezse tüm aylar.
    if (monthSet && !monthSet.has(m)) continue;
    for (const cell of monthHijriCells(year, m)) {
      const ymd = cell.gregorian;
      if (rangeStart && (ymd < rangeStart || ymd > rangeEnd!)) continue;
      if (hijriSet && !hijriSet.has(cell.hijri.day)) continue;
      if (weekdaySet && !weekdaySet.has(isoWeekday(ymd))) continue;
      out.push(ymd);
    }
  }
  return out;
}

/** Bir tarihin insan-okunur Hicrî gösterimi (a11y/etiket için); geçersizse "". */
export function hijriLabel(ymd: string): string {
  return gregorianToHijri(ymd)?.formatted ?? "";
}
