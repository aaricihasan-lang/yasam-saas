/**
 * KUPA & HACAMAT — FAZ 5 — NÖTR HİCRÎ TAKVİM YARDIMCISI.
 *
 * AMAÇ: Gregoryen (miladî) SİVİL bir tarihi Hicrî (Umm al-Qura) tarih gösterimine
 *   çevirir. YALNIZCA tarih dönüşümü yapar.
 *
 * NÖTRLÜK SÖZLEŞMESİ (KESİN):
 *   Bu dosya TIBBEN ve GELENEKSEL olarak NÖTRDÜR. Şu kavramların HİÇBİRİNİ içermez:
 *   "altın/sünnet/uygun/yasaklı" gün sınıflandırması, 17/19/21 gibi tavsiye sayıları,
 *   haftagünü yasağı, geleneksel hacamat tavsiyesi, Kozmik durum bağlaması.
 *   Kozmik Hacamat (lib/cosmic/hacamat.ts, app/cosmic-calendar/**, app/api/hacamat/**)
 *   ile HİÇBİR kod bağı YOKTUR ve buraya kopyalanmamıştır.
 *
 * ZAMAN DİLİMİ SÖZLEŞMESİ: Sivil tarih, sunucu/tarayıcı saat dilimine göre ASLA
 *   kaymaz. Dönüşüm, `Date.UTC(y, ay-1, gün, 12, 0, 0)` (gün ortası, UTC) ile kurulur
 *   ve `timeZone: "UTC"` ile biçimlenir. Öğlen sabiti, DST/negatif-offset kaymalarını
 *   önler (00:00 yerine 12:00).
 *
 * NOT: "Hicrî gösterim, Gregoryen sivil tarihe karşılık gelen Umm al-Qura takvim
 *   değerini temsil eder. Gün batımı/akşam Hicrî devri (sunset rollover) FAZ 5'te
 *   MODELLENMEZ."
 */

export type HijriDate = {
  /** Hicrî ay-günü (1–30). */
  day: number;
  /** Hicrî ay numarası (1–12). */
  month: number;
  /** Hicrî ay adı (Türkçe; yalnız ad — herhangi bir hüküm/tavsiye İÇERMEZ). */
  monthName: string;
  /** Hicrî yıl. */
  year: number;
  /** İnsan-okunur Hicrî gösterim, ör. "24 Ramazan 1420". */
  formatted: string;
};

/**
 * Hicrî ay adları (Türkçe). YALNIZ AD'dır — hiçbir gün hükmü / tavsiye taşımaz.
 * Ay numarası Intl (Umm al-Qura) tarafından belirlenir; ad buradan eşlenir → tam
 * deterministik gösterim (ICU dil paketinden bağımsız).
 */
export const HIJRI_MONTHS_TR = [
  "Muharrem",
  "Safer",
  "Rebiülevvel",
  "Rebiülahir",
  "Cemaziyelevvel",
  "Cemaziyelahir",
  "Recep",
  "Şaban",
  "Ramazan",
  "Şevval",
  "Zilkade",
  "Zilhicce",
] as const;

/** Bileşenlere ayrılmış Gregoryen sivil tarih. */
export type GregorianParts = { year: number; month: number; day: number };

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "YYYY-MM-DD" biçimini KATI olarak ayrıştırır. Takvim olarak GERÇEK bir gün değilse
 * (ör. 2027-02-30) null döner. Saat dilimi devreye girmez (saf bileşen doğrulaması).
 */
export function parseYmd(input: unknown): GregorianParts | null {
  if (typeof input !== "string") return null;
  const m = YMD_RE.exec(input.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Gün, ilgili ayda gerçekten var mı? (UTC ile round-trip; ay taşması reddedilir.)
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** "YYYY-MM-DD" değerini normalize eder (geçersizse null). */
export function toYmd(parts: GregorianParts): string {
  const y = String(parts.year).padStart(4, "0");
  const mo = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const HIJRI_NUM_FMT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  timeZone: "UTC",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/**
 * Gregoryen sivil tarihi ("YYYY-MM-DD" veya {year,month,day}) → Hicrî (Umm al-Qura).
 * Geçersiz/gerçek-olmayan tarih → null (istisna FIRLATMAZ; çağıran güvenli hata döner).
 */
export function gregorianToHijri(input: string | GregorianParts): HijriDate | null {
  const parts = typeof input === "string" ? parseYmd(input) : normalizeParts(input);
  if (!parts) return null;

  // Gün ortası + UTC → saat dilimi kayması imkânsız.
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const raw = Object.fromEntries(
    HIJRI_NUM_FMT.formatToParts(dt)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as { day?: string; month?: string; year?: string };

  const day = Number(raw.day);
  const month = Number(raw.month);
  const year = Number(raw.year);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12) return null;

  const monthName = HIJRI_MONTHS_TR[month - 1] ?? "";
  return {
    day,
    month,
    monthName,
    year,
    formatted: `${day} ${monthName} ${year}`,
  };
}

function normalizeParts(p: GregorianParts | null | undefined): GregorianParts | null {
  if (!p || typeof p !== "object") return null;
  return parseYmd(toYmd(p));
}

/** Bir Hicrî tarih hücresi: kaynak Gregoryen "YYYY-MM-DD" + türetilmiş Hicrî. */
export type HijriCell = { gregorian: string; hijri: HijriDate };

/**
 * Bir Gregoryen ay (year, month 1–12) için tüm günlerin Hicrî hücrelerini üretir.
 * Aylık takvim gösterimi için yeniden kullanılabilir temel (UI FAZ 5'te DEĞİL).
 */
export function monthHijriCells(year: number, month: number): HijriCell[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  const out: HijriCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const gregorian = toYmd({ year, month, day: d });
    const hijri = gregorianToHijri(gregorian);
    if (hijri) out.push({ gregorian, hijri });
  }
  return out;
}

/**
 * Bir Gregoryen yıl için 12 ayın Hicrî hücrelerini üretir (yıllık takvim temeli).
 * Motor/DB değişmeden yeniden kullanılır — hiçbir tavsiye/durum eklemez.
 */
export function annualHijriCells(year: number): HijriCell[][] {
  if (!Number.isInteger(year)) return [];
  const out: HijriCell[][] = [];
  for (let m = 1; m <= 12; m++) out.push(monthHijriCells(year, m));
  return out;
}
