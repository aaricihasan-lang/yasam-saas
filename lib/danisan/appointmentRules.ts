/**
 * Randevu (appointments) kuralları — SAF (pure), client + server güvenli.
 *
 * FA-44 / DY-A:
 *  - Saklanan statü ASLA sessizce değiştirilmez. Geçmiş tarihli ama hâlâ "bekliyor"
 *    olan randevu yalnız GÖRÜNTÜDE "Sonuç girilmedi" (türetilmiş) olarak gösterilir.
 *  - Sayaçlar: "Bekliyor (yaklaşan)" = bekliyor && gelecekte; "Sonuç girilmedi" =
 *    bekliyor && geçmişte. Tamamlanan/iptal hiçbir zaman "yaklaşan" sayılmaz.
 *  - PATCH alan izin listesi + statü enum + gelecekteki randevuyu "tamamlandı"
 *    yapma yasağı (sunucu 409, istemci önce uyarır).
 *  - clients.gorusme (TEXT, "YYYY-MM-DD") yalnız ileri alınır; gelecek tarih ASLA yazılmaz.
 */
import { looseDayKey, todayInZone, toInstant, isDateOnlyString } from "@/lib/time/reportTime";

export const APPOINTMENT_STATUSES = ["bekliyor", "tamamlandi", "iptal"] as const;
export type AppointmentStatusCode = (typeof APPOINTMENT_STATUSES)[number];

/** Görüntü amaçlı türetilmiş statü (DB değeri değildir). */
export type DerivedAppointmentStatus = AppointmentStatusCode | "sonuc_girilmedi";

export function isAppointmentStatus(value: unknown): value is AppointmentStatusCode {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

/** Boş/null statü eski kayıtlarda "bekliyor" kabul edilir (mevcut davranış). */
export function normalizeAppointmentStatus(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "bekliyor";
}

/**
 * Randevu geçmişte mi?
 *  - Saatli değer (timestamptz) → mutlak an karşılaştırması (now'dan önce → geçmiş).
 *  - Saatsiz "YYYY-MM-DD" → İstanbul takvim günü bugünden önceyse geçmiş.
 *  - Geçersiz/boş → geçmiş sayılmaz (güvenli).
 */
export function isAppointmentPast(value: unknown, now: Date = new Date()): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string" && isDateOnlyString(value)) {
    return value.trim() < todayInZone(undefined, now);
  }
  const d = toInstant(value as string);
  if (!d) return false;
  return d.getTime() < now.getTime();
}

/** Randevunun gerçekleşme anı/günü şimdiden ileride mi? (tamamlama yasağı için) */
export function isAppointmentInFuture(value: unknown, now: Date = new Date()): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string" && isDateOnlyString(value)) {
    return value.trim() > todayInZone(undefined, now);
  }
  const d = toInstant(value as string);
  if (!d) return false;
  return d.getTime() > now.getTime();
}

/** Görüntü statüsü: geçmiş + bekliyor → "sonuc_girilmedi" (DB değişmez). */
export function deriveAppointmentStatus(
  status: unknown,
  appointmentDate: unknown,
  now: Date = new Date(),
): DerivedAppointmentStatus {
  const s = normalizeAppointmentStatus(status);
  if (s === "tamamlandi") return "tamamlandi";
  if (s === "iptal") return "iptal";
  // "bekliyor" (ve bilinmeyen eski değerler — mevcut UI davranışı) → tarihe göre.
  return isAppointmentPast(appointmentDate, now) ? "sonuc_girilmedi" : "bekliyor";
}

export type AppointmentLike = { status?: unknown; appointment_date?: unknown };

export type AppointmentCounts = {
  total: number;
  /** bekliyor && gelecekte */
  upcoming: number;
  /** bekliyor && geçmişte (sonuç girilmedi) */
  noResult: number;
  completed: number;
  cancelled: number;
  /** tarihi geçmiş tüm randevular (statüden bağımsız) */
  past: number;
};

export function countAppointments(list: readonly AppointmentLike[], now: Date = new Date()): AppointmentCounts {
  const out: AppointmentCounts = { total: list.length, upcoming: 0, noResult: 0, completed: 0, cancelled: 0, past: 0 };
  for (const a of list) {
    const derived = deriveAppointmentStatus(a.status, a.appointment_date, now);
    if (derived === "bekliyor") out.upcoming++;
    else if (derived === "sonuc_girilmedi") out.noResult++;
    else if (derived === "tamamlandi") out.completed++;
    else if (derived === "iptal") out.cancelled++;
    if (isAppointmentPast(a.appointment_date, now)) out.past++;
  }
  return out;
}

// ─── Sunucu PATCH / POST doğrulaması ──────────────────────────────────────────

/** PATCH ile değiştirilebilen alanlar (tenant_id/id/client_id/created_at ASLA). */
export const APPOINTMENT_PATCH_FIELDS = ["title", "notes", "appointment_date", "status"] as const;
/** POST ile yazılabilen alanlar (client_id route tarafından ayrıca doğrulanır). */
export const APPOINTMENT_CREATE_FIELDS = ["title", "notes", "appointment_date", "status", "client_id"] as const;

export type AppointmentValidation =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; status: 400 | 409; code: string; error: string };

function pick(body: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return out;
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

function validateFieldTypes(fields: Record<string, unknown>): AppointmentValidation | null {
  if ("status" in fields && !isAppointmentStatus(fields.status)) {
    return { ok: false, status: 400, code: "INVALID_STATUS", error: "Geçersiz randevu durumu." };
  }
  if ("appointment_date" in fields) {
    const v = fields.appointment_date;
    if (typeof v !== "string" || !toInstant(v)) {
      return { ok: false, status: 400, code: "INVALID_DATE", error: "Geçersiz randevu tarihi." };
    }
  }
  for (const k of ["title", "notes"] as const) {
    if (k in fields && fields[k] !== null && typeof fields[k] !== "string") {
      return { ok: false, status: 400, code: "INVALID_FIELD", error: "Geçersiz alan değeri." };
    }
  }
  return null;
}

export const FUTURE_COMPLETION_ERROR =
  "Henüz gerçekleşmemiş bir randevu tamamlandı olarak işaretlenemez.";

/**
 * PATCH gövdesini izin listesine göre süzer ve doğrular.
 * @param existing  Kayıtlı randevu (tarih; gelecekte-tamamlama kontrolü için).
 */
export function validateAppointmentPatch(
  body: Record<string, unknown> | null | undefined,
  existing: { appointment_date?: unknown } | null,
  now: Date = new Date(),
): AppointmentValidation {
  const fields = pick(body, APPOINTMENT_PATCH_FIELDS);
  if (Object.keys(fields).length === 0) {
    return { ok: false, status: 400, code: "NO_FIELDS", error: "Güncellenecek alan yok." };
  }
  const bad = validateFieldTypes(fields);
  if (bad) return bad;
  if (fields.status === "tamamlandi") {
    const effectiveDate = "appointment_date" in fields ? fields.appointment_date : existing?.appointment_date;
    if (isAppointmentInFuture(effectiveDate, now)) {
      return { ok: false, status: 409, code: "APPOINTMENT_IN_FUTURE", error: FUTURE_COMPLETION_ERROR };
    }
  }
  return { ok: true, fields };
}

/** POST gövdesini süzer + doğrular (statü yoksa "bekliyor"). */
export function validateAppointmentCreate(
  body: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): AppointmentValidation {
  const fields = pick(body, APPOINTMENT_CREATE_FIELDS);
  if (!("appointment_date" in fields)) {
    return { ok: false, status: 400, code: "INVALID_DATE", error: "Randevu tarihi gerekli." };
  }
  if (!("status" in fields) || fields.status === null || fields.status === "") fields.status = "bekliyor";
  const bad = validateFieldTypes(fields);
  if (bad) return bad;
  if (fields.status === "tamamlandi" && isAppointmentInFuture(fields.appointment_date, now)) {
    return { ok: false, status: 409, code: "APPOINTMENT_IN_FUTURE", error: FUTURE_COMPLETION_ERROR };
  }
  return { ok: true, fields };
}

// ─── clients.gorusme ilerletme ────────────────────────────────────────────────

/**
 * Son görüşme tarihini ilerletme kararı.
 *
 * @param current   Mevcut clients.gorusme (TEXT; "YYYY-MM-DD" veya eski "GG.AA.YYYY").
 * @param candidate Aday gün ("YYYY-MM-DD" ya da an — İstanbul gününe çevrilir).
 * @param today     Bugün ("YYYY-MM-DD", İstanbul).
 * @returns Yazılması gereken yeni değer ("YYYY-MM-DD") ya da null (değişiklik yok).
 *
 * Kurallar: aday bugünden sonraysa ASLA yazılmaz; mevcut değer adaydan yeni/eşitse
 * değişmez; mevcut değer anlaşılamıyorsa (bozuk metin) üzerine yazılmaz (veri korunur),
 * boşsa aday yazılır.
 */
export function nextGorusme(current: string | null | undefined, candidate: unknown, today: string): string | null {
  const cand = typeof candidate === "string" && isDateOnlyString(candidate)
    ? candidate.trim()
    : looseDayKey(candidate);
  if (!cand || !isDateOnlyString(cand)) return null;
  if (cand > today) return null;
  const cur = typeof current === "string" ? current.trim() : "";
  if (!cur) return cand;
  const curKey = looseDayKey(cur);
  if (!curKey || !isDateOnlyString(curKey)) return null;
  return cand > curKey ? cand : null;
}
