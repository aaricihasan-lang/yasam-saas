/**
 * lib/danisan/appointmentNotifications.ts — Randevu bildirimi SAF kuralları (AŞAMA 2 · §4.2).
 *
 * Server (GET /api/appointments/notifications) + client (NotificationBell) AYNI kuralı
 * kullanır; bağımlılıksız, saf (Date/now parametre olarak gelir → test edilebilir).
 *
 * GÖRÜNÜRLÜK (isNotifiable):
 *   - status "bekliyor" (null/boş = bekliyor; büyük/küçük harf + boşluk normalize),
 *   - randevunun İSTANBUL takvim günü = bugünün İstanbul günü (UTC kayması yok),
 *   - appointment_date >= now − 30 dk (başlamış randevu 30 dk daha görünür; tolerans),
 *   - kullanıcı bu randevu+tarih için "done"/"muted" kararı VERMEMİŞ.
 *     Durum anahtarı = appointment_id + appointment_at (epoch ms) → randevu yeniden
 *     planlanırsa eski karar eşleşmez, bildirim TEKRAR görünür.
 *
 * HATIRLATMA (shouldRemind) — owner kararı 9 "saatlik tekrar":
 *   - Randevu zamanı geldiyse/geçtiyse (now >= appointment_date) hatırlatma DURUR.
 *   - Cihazda hiç hatırlatılmamışsa → hatırlat (ilk görüldüğü an).
 *   - Son hatırlatmadan bu yana ≥ 60 dk geçtiyse → tekrar hatırlat (koşullar sürdükçe).
 *   - Randevuya ≤ 30 dk kala: 30 dk penceresine girildikten sonra henüz hatırlatılmadıysa
 *     → hatırlat ("30 dk kala" hatırlatması saatlik döngüyü beklemez).
 *   Çağıran yalnız isNotifiable olan randevular için çağırır (done/muted/iptal → asla).
 */

import { formatInstantTime, toInstant, zonedDayKey, DEFAULT_TIME_ZONE } from "@/lib/time/reportTime";

/** Başlamış randevunun görünür kaldığı süre. */
export const NOTIFY_TOLERANCE_MS = 30 * 60 * 1000;
/** "Randevuya X dk kala" hatırlatma penceresi. */
export const FIRST_REMIND_BEFORE_MS = 30 * 60 * 1000;
/** Koşullar sürdükçe tekrar hatırlatma aralığı (saatlik). */
export const REMIND_REPEAT_MS = 60 * 60 * 1000;

export const NOTIFICATION_STATES = ["done", "muted"] as const;
export type NotificationStateValue = (typeof NOTIFICATION_STATES)[number];

export function isNotificationStateValue(v: unknown): v is NotificationStateValue {
  return v === "done" || v === "muted";
}

export type NotificationAppointment = {
  id: string;
  title: string | null;
  appointment_date: string;
  status: string | null;
  client_id: string | null;
};

export type NotificationStateRow = {
  appointment_id: string;
  appointment_at: string;
  state: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** null/boş → "bekliyor"; diğerleri trim + küçük harf. */
export function normalizeAppointmentStatus(status: string | null | undefined): string {
  const s = String(status ?? "").trim().toLocaleLowerCase("tr-TR");
  return s === "" ? "bekliyor" : s;
}

/**
 * Durum anahtarı: randevu id + randevu anı (epoch ms). Aynı an farklı ISO yazımıyla
 * ("…Z" / "…+00:00" / "+03:00") gelse de eşleşir. Geçersiz tarih → null.
 */
export function notificationStateKey(appointmentId: string, appointmentAt: string | Date | null | undefined): string | null {
  const d = toInstant(appointmentAt ?? null);
  if (!d || !appointmentId) return null;
  return `${appointmentId}|${d.getTime()}`;
}

/** done/muted kayıtlarından anahtar kümesi (bilinmeyen state değerleri yok sayılır). */
export function buildStateIndex(states: readonly NotificationStateRow[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const s of states ?? []) {
    if (!isNotificationStateValue(s.state)) continue;
    const key = notificationStateKey(s.appointment_id, s.appointment_at);
    if (key) out.add(key);
  }
  return out;
}

// ─── İstanbul günü penceresi ─────────────────────────────────────────────────

const partsFmtCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(d: Date, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  let f = partsFmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFmtCache.set(timeZone, f);
  }
  const parts = f.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Saat diliminin verilen andaki UTC farkı (ms; İstanbul = +3 sa). */
function tzOffsetMs(d: Date, timeZone: string): number {
  const p = zonedParts(d, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Yerel takvim gününün (YYYY-MM-DD) başlangıç anı (00:00, hedef saat dilimi). */
function zonedDayStart(dayKey: string, timeZone: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // İki adım: DST geçişinde de doğru (İstanbul'da DST yok; genel güvence).
  let ts = guess - tzOffsetMs(new Date(guess), timeZone);
  ts = guess - tzOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

export type DayWindow = {
  /** İstanbul bugünü "YYYY-MM-DD". */
  dayKey: string;
  /** Günün başlangıcı (dahil). */
  dayStart: Date;
  /** Günün sonu (dahil; ertesi gün başlangıcı − 1 ms). */
  dayEnd: Date;
};

/** İstanbul'a göre "bugün" penceresi. */
export function istanbulTodayWindow(now: Date, timeZone: string = DEFAULT_TIME_ZONE): DayWindow {
  const dayKey = zonedDayKey(now, { timeZone });
  const dayStart = zonedDayStart(dayKey, timeZone);
  // Ertesi gün: başlangıca 36 saat ekleyip gün anahtarını al (DST güvenli).
  const nextKey = zonedDayKey(new Date(dayStart.getTime() + 36 * 3600 * 1000), { timeZone });
  const nextStart = zonedDayStart(nextKey, timeZone);
  return { dayKey, dayStart, dayEnd: new Date(nextStart.getTime() - 1) };
}

/**
 * Sunucu sorgu penceresi: [max(gün başı, now − tolerans), gün sonu].
 * (Görünürlük yine isNotifiable ile kesinleşir.)
 */
export function notificationQueryWindow(now: Date, timeZone: string = DEFAULT_TIME_ZONE): { fromIso: string; toIso: string } {
  const w = istanbulTodayWindow(now, timeZone);
  const from = Math.max(w.dayStart.getTime(), now.getTime() - NOTIFY_TOLERANCE_MS);
  return { fromIso: new Date(from).toISOString(), toIso: w.dayEnd.toISOString() };
}

// ─── Görünürlük ──────────────────────────────────────────────────────────────

export function isNotifiable(
  a: Pick<NotificationAppointment, "id" | "appointment_date" | "status">,
  now: Date,
  states?: Set<string> | readonly NotificationStateRow[] | null,
): boolean {
  if (normalizeAppointmentStatus(a.status) !== "bekliyor") return false;
  const at = toInstant(a.appointment_date);
  if (!at) return false;
  if (zonedDayKey(at) !== zonedDayKey(now)) return false;
  if (at.getTime() < now.getTime() - NOTIFY_TOLERANCE_MS) return false;
  const index = states instanceof Set ? states : buildStateIndex(states ?? []);
  const key = notificationStateKey(a.id, at);
  if (key && index.has(key)) return false;
  return true;
}

// ─── Hatırlatma ──────────────────────────────────────────────────────────────

export function shouldRemind(
  a: Pick<NotificationAppointment, "appointment_date">,
  now: Date,
  lastRemindedAt: number | null | undefined,
): boolean {
  const at = toInstant(a.appointment_date);
  if (!at) return false;
  const t = at.getTime();
  const n = now.getTime();
  // Randevu zamanı geldi/geçti → hatırlatma durur (bildirim tolerans süresince görünür kalır).
  if (n >= t) return false;
  const last = typeof lastRemindedAt === "number" && Number.isFinite(lastRemindedAt) ? lastRemindedAt : null;
  if (last === null) return true;
  if (n - last >= REMIND_REPEAT_MS) return true;
  // "30 dk kala" hatırlatması: pencereye girildi ve son hatırlatma pencere öncesinde kaldı.
  const windowStart = t - FIRST_REMIND_BEFORE_MS;
  if (n >= windowStart && last < windowStart) return true;
  return false;
}

// ─── Görünüm ─────────────────────────────────────────────────────────────────

export type NotificationKind = "client" | "general" | "hidden_client";

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  heading: string;
  subtitle: string | null;
  whenLabel: string;
  href: string;
  clientHref: string | null;
};

export const GENERAL_APPOINTMENT_HEADING = "Genel randevu";
export const HIDDEN_CLIENT_HEADING = "Kayıtlı danışan";

/** "25 dk" / "1 sa" / "2 sa 15 dk". */
function durationLabel(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} dk`;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

/** "Bugün 14:30 · 25 dk sonra" | "Şimdi" | "Bugün 14:30 · 10 dk önce başladı". */
export function buildWhenLabel(appointmentDate: string, now: Date): string {
  const at = toInstant(appointmentDate);
  if (!at) return "";
  const diff = at.getTime() - now.getTime();
  if (Math.abs(diff) < 60_000) return "Şimdi";
  const sameDay = zonedDayKey(at) === zonedDayKey(now);
  const time = formatInstantTime(at);
  const dayPart = sameDay ? `Bugün ${time}` : time;
  return diff > 0 ? `${dayPart} · ${durationLabel(diff)} sonra` : `${dayPart} · ${durationLabel(-diff)} önce başladı`;
}

export function buildNotificationView(
  a: NotificationAppointment,
  opts: { clientName?: string | null; canOpenClient?: boolean; now?: Date },
): NotificationView {
  const now = opts.now ?? new Date();
  const name = (opts.clientName ?? "").replace(/\s+/g, " ").trim();
  let kind: NotificationKind;
  let heading: string;
  if (!a.client_id) {
    kind = "general";
    heading = GENERAL_APPOINTMENT_HEADING;
  } else if (opts.canOpenClient && name) {
    kind = "client";
    heading = name;
  } else {
    kind = "hidden_client";
    heading = HIDDEN_CLIENT_HEADING;
  }
  const title = (a.title ?? "").trim();
  const id = encodeURIComponent(a.id);
  return {
    id: a.id,
    kind,
    heading,
    subtitle: title || null,
    whenLabel: buildWhenLabel(a.appointment_date, now),
    href: `/dashboard/ajanda?randevu=${id}`,
    clientHref:
      a.client_id && opts.canOpenClient
        ? `/dashboard/clients/${encodeURIComponent(a.client_id)}?tab=randevular&randevu=${id}`
        : null,
  };
}

/** Danışan görünen adı (ad + soyad; soyadsız/boş güvenli). Boşsa null. */
export function clientDisplayName(c: { ad?: string | null; soyad?: string | null } | null | undefined): string | null {
  if (!c) return null;
  const s = `${c.ad ?? ""} ${c.soyad ?? ""}`.replace(/\s+/g, " ").trim();
  return s || null;
}
