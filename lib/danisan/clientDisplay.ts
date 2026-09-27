/**
 * Danışan Yolculuğu görüntü yardımcıları — SAF (client + server + harness).
 *
 *  - relativeDayInfo: takvim günü farkı (İstanbul "bugün"e göre); gelecek tarih artık
 *    "bugün" gösterilmez → "X gün sonra".
 *  - activityStatus: son görüşme tarihine göre Aktif/Takip/Pasif/Yeni (takvim günü).
 *  - totalChargesAmount: toplam ücret = client_charges toplamı + (charges'a hiç
 *    aktarılmamış) eski seans ücretleri. Backfill edilen seans (charges.source_session_id)
 *    ÇİFT SAYILMAZ.
 */
import { calendarDayDiff, looseDayKey, todayInZone } from "@/lib/time/reportTime";

export type RelativeDayInfo =
  | { kind: "today" }
  | { kind: "future"; days: number }
  | { kind: "days"; n: number }
  | { kind: "weeks"; n: number }
  | { kind: "months"; n: number }
  | { kind: "years"; n: number };

/** Değerin bugüne göre takvim günü farkı (pozitif = geçmiş). Geçersiz → null. */
export function daysSince(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  const key = looseDayKey(value);
  if (!key) return null;
  return calendarDayDiff(key, todayInZone(undefined, now));
}

export function relativeDayInfo(value: string | null | undefined, now: Date = new Date()): RelativeDayInfo | null {
  const diff = daysSince(value, now);
  if (diff === null) return null;
  if (diff < 0) return { kind: "future", days: -diff };
  if (diff === 0) return { kind: "today" };
  if (diff < 7) return { kind: "days", n: diff };
  if (diff < 30) return { kind: "weeks", n: Math.floor(diff / 7) };
  if (diff < 365) return { kind: "months", n: Math.floor(diff / 30) };
  return { kind: "years", n: Math.floor(diff / 365) };
}

export type ActivityStatus = "aktif" | "takip" | "pasif" | "yeni";

export function activityStatus(gorusme: string | null | undefined, now: Date = new Date()): ActivityStatus {
  if (!gorusme) return "yeni";
  const diff = daysSince(gorusme, now);
  if (diff === null) return "yeni";
  if (diff <= 30) return "aktif"; // gelecek (planlı) tarih de aktif sayılır
  if (diff <= 90) return "takip";
  return "pasif";
}

type SessionFeeLike = { id?: string | null; fee?: number | string | null };
type ChargeLike = { amount?: number | string | null; source_session_id?: string | null };

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Toplam ücret. Hiç kayıt yoksa null ("—").
 * Tanım: Σ client_charges.amount + Σ session.fee (yalnız charges'a aktarılmamış seanslar).
 */
export function totalChargesAmount(
  sessions: readonly SessionFeeLike[],
  charges: readonly ChargeLike[],
): number | null {
  const migrated = new Set(
    charges.map((c) => c.source_session_id).filter((x): x is string => typeof x === "string" && x.length > 0),
  );
  let any = false;
  let total = 0;
  for (const c of charges) {
    const a = num(c.amount);
    if (a === null) continue;
    any = true;
    total += a;
  }
  for (const s of sessions) {
    if (s.id && migrated.has(s.id)) continue;
    const f = num(s.fee);
    if (f === null) continue;
    any = true;
    total += f;
  }
  return any ? total : null;
}
