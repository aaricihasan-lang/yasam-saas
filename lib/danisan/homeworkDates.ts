/**
 * Ödev (client_homeworks) tarih doğrulaması — SAF (client + server).
 *
 * start_date / end_date DATE kolonlarıdır ("YYYY-MM-DD"). Kural: bitiş, başlangıçtan
 * önce olamaz. PATCH'te kısmi gövde KAYITLI satırla birleştirilip doğrulanır (yalnız
 * end_date gönderen bir düzenleme de kontrol edilir).
 */
import { isDateOnlyString, parseCalendarDate } from "@/lib/time/reportTime";

export const HOMEWORK_END_BEFORE_START = "Bitiş tarihi başlangıç tarihinden önce olamaz.";
export const HOMEWORK_INVALID_DATE = "Geçersiz ödev tarihi.";

type DateVal = string | null | undefined;

function norm(v: unknown): DateVal | "invalid" {
  if (v === null || v === undefined) return v as null | undefined;
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (!s) return null;
  if (!isDateOnlyString(s) || !parseCalendarDate(s)) return "invalid";
  return s;
}

/** Hata metni ya da null (geçerli). */
export function validateHomeworkDates(input: { start_date?: unknown; end_date?: unknown }): string | null {
  const start = norm(input.start_date);
  const end = norm(input.end_date);
  if (start === "invalid" || end === "invalid") return HOMEWORK_INVALID_DATE;
  if (start && end && end < start) return HOMEWORK_END_BEFORE_START;
  return null;
}

/** PATCH: kayıtlı satır + gövde birleşimi (gövdede olan alan önceliklidir). */
export function mergeHomeworkDates(
  existing: { start_date?: DateVal; end_date?: DateVal } | null,
  patch: Record<string, unknown>,
): { start_date: unknown; end_date: unknown } {
  return {
    start_date: "start_date" in patch ? patch.start_date : existing?.start_date ?? null,
    end_date: "end_date" in patch ? patch.end_date : existing?.end_date ?? null,
  };
}
