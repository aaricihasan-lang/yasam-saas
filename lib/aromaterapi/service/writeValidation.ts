/**
 * Aromaterapi V2 — C3D ortak yazma doğrulaması (server-only DEĞİL; Supabase/secret YOK).
 *
 * Saf yardımcılar: yasak kimlik alanı tespiti, reason doğrulaması (create opsiyonel /
 * update-delete zorunlu), actor label normalizasyonu, optimistic concurrency zaman damgası.
 * tenant_id ve actor_user_id BODY/QUERY'den ASLA alınmaz — yalnız doğrulanmış oturumdan
 * gelir; bu modül body'de böyle anahtar bulunmasını 400 ile reddedilebilir kılar.
 *
 * C2S/C2T claim yazma davranışıyla aynı güvenlik semantiği; ancak claims koduna dokunmaz.
 */

import { UUID_RE } from "@/lib/aromaterapi/service/readValidation";
import {
  AROMATERAPI_ACTOR_LABEL_MAX_LEN,
  AROMATERAPI_REASON_MAX_LEN,
} from "@/lib/aromaterapi/writeTypes";

export { UUID_RE };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Ortak yasak alias listesi. Bu anahtarlar create/update/delete body'sinde bulunursa
 * istek reddedilir (tenant/actor spoof + route id / immutable timestamp koruması).
 */
export const FORBIDDEN_IDENTITY_KEYS: ReadonlySet<string> = new Set<string>([
  "tenant_id",
  "tenantId",
  "p_tenant_id",
  "actor_user_id",
  "actorUserId",
  "p_actor_user_id",
  "actor_label_snapshot",
  "id",
  "created_at",
  "updated_at",
]);

/** Body'de yasak kimlik anahtarı var mı? (Sessizce yok sayılmaz → çağıran 400 döner.) */
export function hasForbiddenIdentityKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_IDENTITY_KEYS.has(key)) return true;
  }
  return false;
}

export type ReasonResult = { ok: true; value: string | null } | { ok: false };

/**
 * Create reason — OPSİYONEL: omitted/null → null; present ise trim sonrası 1–2000.
 * (Ham değer trim EDİLMEZ; yalnız doğrulanır ve orijinal iletilir.)
 */
export function validateCreateReason(value: unknown): ReasonResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  if (value.trim() === "" || value.length > AROMATERAPI_REASON_MAX_LEN) return { ok: false };
  return { ok: true, value };
}

/**
 * Update/Delete reason — ZORUNLU: string, trim sonrası boş değil, <= 2000.
 */
export function validateMandatoryReason(value: unknown): ReasonResult {
  if (typeof value !== "string") return { ok: false };
  if (value.trim() === "" || value.length > AROMATERAPI_REASON_MAX_LEN) return { ok: false };
  return { ok: true, value };
}

/**
 * Actor label çözümü — YALNIZ doğrulanmış profilden/e-postadan.
 * Sıra: profile.full_name → profile.name → email. Boş olamaz; aşırı uzun isim
 * güvenli e-posta fallback'ine düşer; e-posta da uzunsa güvenli biçimde kırpılır.
 */
export function resolveActorLabel(
  profile: Record<string, unknown> | undefined,
  email: string,
): string {
  const pick = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t === "") return null;
    if (t.length > AROMATERAPI_ACTOR_LABEL_MAX_LEN) return null; // aşırı uzun → fallback
    return t;
  };
  const fromName = pick(profile?.full_name) ?? pick(profile?.name);
  if (fromName) return fromName;

  const mail = typeof email === "string" ? email.trim() : "";
  if (mail !== "") {
    return mail.length > AROMATERAPI_ACTOR_LABEL_MAX_LEN
      ? mail.slice(0, AROMATERAPI_ACTOR_LABEL_MAX_LEN)
      : mail;
  }
  // Son çare: kimlik doğrulandığı halde etiket üretilemezse boş bırakmayız.
  return "kullanıcı";
}

// Zorunlu timezone'lu tarih-zaman (optimistic concurrency) — C2T ile aynı sözleşme.
const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** STRICT takvim doğrulaması (Date.parse tek başına 31 Şubat vb. normalize edebilir). */
export function isValidExpectedUpdatedAt(value: string): boolean {
  const m = EXPECTED_UPDATED_AT_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const tz = m[8];
  if (year === 0) return false;
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;
  if (tz !== "Z") {
    const offsetHour = Number(tz.slice(1, 3));
    const offsetMinute = Number(tz.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}
