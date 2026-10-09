/**
 * Ödev "Kaç gün sonra?" — SAF yardımcılar (WT7). DB alanı DEĞİL (migration yok): yalnız
 * bitiş tarihini hesaplamak için form yardımcısıdır; kalıcı olan start_date / end_date'tir.
 *
 * KURALLAR
 *   - Bitiş = Başlangıç + N TAKVİM günü (UTC aritmetiği → saat dilimi/DST kayması yok).
 *     Ör. 2026-01-31 + 1 = 2026-02-01; 2028-02-28 + 1 = 2028-02-29 (artık yıl); 2026-12-31 + 1 = 2027-01-01.
 *   - N = 0 → aynı gün biter (bitiş = başlangıç; bitiş<başlangıç kuralını ihlal etmez).
 *   - Negatif, ondalık, metin → reddedilir; N > HOMEWORK_MAX_DAYS → reddedilir.
 *   - "Son yapılan işlem kazanır":
 *       · gün sayısı yazılırsa bitiş yeniden hesaplanır (anchor = "days");
 *       · bitiş tarihi elle seçilirse gün sayısı GERÇEK farka eşitlenir (anchor = "end") ve
 *         eski hesaplama bir daha uygulanmaz;
 *       · başlangıç değişirse: anchor "days" → bitiş yeni başlangıç + N; anchor "end" → bitiş
 *         KORUNUR, gün sayısı yeni farka güncellenir (negatifse boşaltılır).
 *   - Düzenlemede kayıtlı tarihler aynen korunur (anchor = "end").
 */
import { isDateOnlyString, parseCalendarDate } from "@/lib/time/reportTime";

export const HOMEWORK_MAX_DAYS = 3650;

export type DurationParse =
  | { kind: "empty" }
  | { kind: "ok"; days: number }
  | { kind: "error"; reason: "notInteger" | "negative" | "tooLarge" };

/** Kullanıcı girdisini (string) doğrular. Boşluk kırpılır; yalnız tam sayı kabul edilir. */
export function parseDurationDays(raw: string): DurationParse {
  const s = (raw ?? "").trim();
  if (!s) return { kind: "empty" };
  if (/^-\s*\d+$/.test(s)) return { kind: "error", reason: "negative" };
  if (!/^\d+$/.test(s)) return { kind: "error", reason: "notInteger" };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > HOMEWORK_MAX_DAYS) return { kind: "error", reason: "tooLarge" };
  return { kind: "ok", days: n };
}

function validYmd(s: string | null | undefined): s is string {
  return typeof s === "string" && isDateOnlyString(s) && !!parseCalendarDate(s);
}

/** "YYYY-MM-DD" + n takvim günü → "YYYY-MM-DD" (UTC gün aritmetiği). Geçersiz girişte null. */
export function addCalendarDays(ymd: string, n: number): string | null {
  if (!validYmd(ymd) || !Number.isSafeInteger(n)) return null;
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** İki takvim günü arası fark (end - start), geçersizse null. */
export function calendarDaysBetween(start: string, end: string): number | null {
  if (!validYmd(start) || !validYmd(end)) return null;
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
}

export type DateAnchor = "days" | "end";

export type HomeworkDateFields = {
  startDate: string;
  endDate: string;
  /** Formdaki "Kaç gün sonra?" girdisi (string; boş olabilir). */
  durationDays: string;
  dateAnchor: DateAnchor;
};

/** Kayıtlı tarihlerden form alanları (düzenleme açılışı): tarihler AYNEN korunur. */
export function initDateFields(startDate: string, endDate: string): HomeworkDateFields {
  const diff = startDate && endDate ? calendarDaysBetween(startDate, endDate) : null;
  return { startDate, endDate, durationDays: diff !== null && diff >= 0 ? String(diff) : "", dateAnchor: "end" };
}

/** Tek bir tarih alanı değişikliğini uygular ("son işlem kazanır"). */
export function applyDateFieldChange(
  f: HomeworkDateFields,
  key: "startDate" | "endDate" | "durationDays",
  value: string,
): HomeworkDateFields {
  if (key === "durationDays") {
    const p = parseDurationDays(value);
    if (p.kind === "ok" && validYmd(f.startDate)) {
      return { ...f, durationDays: value, endDate: addCalendarDays(f.startDate, p.days) ?? f.endDate, dateAnchor: "days" };
    }
    // Boş/geçersiz/başlangıçsız: bitişe DOKUNULMAZ (yanlış tarih üretilmez); geçersizlik UI'da gösterilir.
    return { ...f, durationDays: value, dateAnchor: p.kind === "empty" ? "end" : "days" };
  }
  if (key === "endDate") {
    const diff = validYmd(f.startDate) && validYmd(value) ? calendarDaysBetween(f.startDate, value) : null;
    return { ...f, endDate: value, durationDays: diff !== null && diff >= 0 ? String(diff) : "", dateAnchor: "end" };
  }
  // startDate
  const next = { ...f, startDate: value };
  if (f.dateAnchor === "days") {
    const p = parseDurationDays(f.durationDays);
    if (p.kind === "ok" && validYmd(value)) next.endDate = addCalendarDays(value, p.days) ?? f.endDate;
    return next; // geçersiz N → kullanıcının girdisi ve bitiş olduğu gibi kalır
  }
  const diff = validYmd(value) && validYmd(f.endDate) ? calendarDaysBetween(value, f.endDate) : null;
  next.durationDays = diff !== null && diff >= 0 ? String(diff) : "";
  return next;
}
