import "server-only";

import { NextResponse } from "next/server";

/**
 * YEBS — FAZ API-TX ortak ROUTE-SIDE input doğrulayıcıları.
 *
 * Yalnız transition/verify route'larının gövde/parametre doğrulamasında kullanılır.
 * Kullanıcı değerleri coerce/trim/normalize EDİLMEZ; yalnız biçim/allowlist denetlenir
 * ve geçerli değer DEĞİŞTİRİLMEDEN RPC katmanına aktarılır (fidelity korunur).
 *
 * Güvenlik: `import "server-only"` — istemci paketine sızma build-time engellenir.
 */

export const REASON_MAX_LEN = 2000;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Zorunlu timezone'lu tarih-zaman: YYYY-MM-DDTHH:mm:ss[.1-6 kesir](Z|±HH:mm).
// A0U route'undaki strict sözleşmenin BİREBİR aynısı (davranış korunur).
const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * STRICT takvim doğrulaması: Date.parse tek başına 31 Şubat/aşkın günleri normalize
 * edebildiğinden yetmez. Ay/gün/artık-yıl/saat/dakika/saniye/offset ayrıca doğrulanır.
 * Geçerli değer DEĞİŞTİRİLMEDEN aktarılır (normalize/trim/toISOString YOK).
 */
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
  if (hour > 23) return false;
  if (minute > 59) return false;
  if (second > 59) return false;

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

/** Canonical transition body: yalnız 3 exact anahtar. */
export type ParsedTransitionBody = {
  targetStatus: string;
  expectedUpdatedAt: string;
  reason: string;
};

/** Verification transition body: yalnız 3 exact anahtar. */
export type ParsedVerificationBody = {
  verificationStatus: string;
  expectedUpdatedAt: string;
  reason: string;
};

function isPlainObject(body: unknown): body is Record<string, unknown> {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

/**
 * Canonical transition gövdesini strict doğrular:
 *   - plain object (null/array/primitive reddi)
 *   - yalnız {target_status, expected_updated_at, reason} — fazla/eksik anahtar reddi
 *   - target_status: string ∈ allowedStatuses
 *   - expected_updated_at: strict RFC3339 + gerçek takvim
 *   - reason: string, trim-boş değil, ≤ 2000
 * Geçersizse null döner (route → 400). Değerler coerce EDİLMEZ.
 */
export function parseTransitionBody(
  body: unknown,
  allowedStatuses: readonly string[],
): ParsedTransitionBody | null {
  if (!isPlainObject(body)) return null;

  const keys = Object.keys(body);
  const allowedKeys = new Set(["target_status", "expected_updated_at", "reason"]);
  for (const k of keys) {
    if (!allowedKeys.has(k)) return null;
  }
  if (keys.length !== 3) return null;

  const targetStatus = body.target_status;
  if (typeof targetStatus !== "string" || !allowedStatuses.includes(targetStatus)) {
    return null;
  }

  const expectedUpdatedAt = body.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return null;
  }

  const reason = body.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return null;
  }

  return { targetStatus, expectedUpdatedAt, reason };
}

/**
 * Verification transition gövdesini strict doğrular (yukarıdakiyle aynı kurallar;
 * yalnız status anahtarı `verification_status`).
 */
export function parseVerificationBody(
  body: unknown,
  allowedStatuses: readonly string[],
): ParsedVerificationBody | null {
  if (!isPlainObject(body)) return null;

  const keys = Object.keys(body);
  const allowedKeys = new Set(["verification_status", "expected_updated_at", "reason"]);
  for (const k of keys) {
    if (!allowedKeys.has(k)) return null;
  }
  if (keys.length !== 3) return null;

  const verificationStatus = body.verification_status;
  if (typeof verificationStatus !== "string" || !allowedStatuses.includes(verificationStatus)) {
    return null;
  }

  const expectedUpdatedAt = body.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return null;
  }

  const reason = body.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return null;
  }

  return { verificationStatus, expectedUpdatedAt, reason };
}

/* ============================================================
 * Ortak ROUTE-SIDE HTTP yanıt yardımcıları (stabil kod → sabit status).
 * Ham DB/RPC hata metni istemciye DÖNMEZ; yalnız stabil YEBS_ kodu + sabit mesaj.
 * ============================================================ */

/**
 * A7 (Quality/Publish gate) eligibility/bağımlılık/graf blocker kodları → 409.
 * API-TX invalid-transition=409 ile TUTARLI (eligibility yetersizliği = state conflict;
 * §16: 422 KULLANILMAZ). Ham DB detail dönmez; yalnız stabil kod + sabit mesaj.
 * Additive: mevcut suffix kuralları (STALE/NOOP/INVALID_TRANSITION/PARENT_STATUS_LOCKED/
 * NOT_FOUND/admin) DEĞİŞMEDEN korunur.
 */
export const A7_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "YEBS_TRADITION_NOT_PUBLISH_READY",
  "YEBS_SCHOOL_NOT_PUBLISH_READY",
  "YEBS_CONCEPT_NOT_PUBLISH_READY",
  "YEBS_SCHOOL_PARENT_TRADITION_NOT_PUBLISHED",
  "YEBS_CONCEPT_PARENT_NOT_PUBLISHED",
  "YEBS_CONCEPT_REQUIRED_LABEL_MISSING",
  "YEBS_SOURCE_METADATA_INCOMPLETE",
  "YEBS_CLAIM_NO_VERIFIED_EVIDENCE",
  "YEBS_CLAIM_SUPPORT_SOURCE_NOT_READY",
  "YEBS_CLAIM_NOT_APPROVAL_READY",
  "YEBS_CLAIM_PARENT_CONCEPT_NOT_PUBLISHED",
  "YEBS_CLAIM_PROVENANCE_INCOMPLETE",
  "YEBS_RELATION_NO_VERIFIED_EVIDENCE",
  "YEBS_RELATION_SUPPORT_SOURCE_NOT_READY",
  "YEBS_RELATION_NOT_APPROVAL_READY",
  "YEBS_RELATION_PARENT_CONCEPT_NOT_PUBLISHED",
  "YEBS_RELATION_PROVENANCE_INCOMPLETE",
  "YEBS_RELATION_GRAPH_CYCLE",
  "YEBS_PUBLISH_DEPENDENCY_BLOCKED",
]);

/** URL kimliği UUID değil → 400. */
export function invalidTransitionId(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Geçersiz kimlik.", code: "YEBS_INVALID_ID" },
    { status: 400 },
  );
}

/** Gövde plain-object/allowlist/format doğrulamasını geçemedi → 400. */
export function invalidTransitionBody(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

/**
 * Servis/RPC'den dönen stabil hata kodunu deterministik HTTP status + sabit mesaja
 * çevirir. §17: stale/no-op/invalid-transition/parent-lock → 409; not-found → 404;
 * admin → 403 (var/yok maskeli); diğer/internal → 500. 422 KULLANILMAZ.
 *
 * Kod suffix'i entity-agnostiktir: tüm entity aileleri aynı ailelere maplenir.
 */
export function transitionErrorResponse(code: string): NextResponse {
  // Admin gate: var/yok ayrımı istemciye SIZMAZ — tek sabit 403.
  if (code === "YEBS_ADMIN_NOT_FOUND" || code === "YEBS_ADMIN_NOT_ACTIVE") {
    return NextResponse.json(
      { ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" },
      { status: 403 },
    );
  }

  if (code.endsWith("_STALE_UPDATE")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Kayıt başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.",
        code,
      },
      { status: 409 },
    );
  }

  if (code.endsWith("_STATUS_NOOP") || code.endsWith("_VERIFICATION_NOOP")) {
    return NextResponse.json(
      { ok: false, error: "Kayıt zaten bu durumda.", code },
      { status: 409 },
    );
  }

  if (
    code.endsWith("_INVALID_TRANSITION") ||
    code.endsWith("_INVALID_VERIFICATION_TRANSITION")
  ) {
    return NextResponse.json(
      { ok: false, error: "Bu durum geçişine izin verilmiyor.", code },
      { status: 409 },
    );
  }

  if (code.endsWith("_PARENT_STATUS_LOCKED")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Üst kaydın durumu bu doğrulama değişikliğine izin vermiyor.",
        code,
      },
      { status: 409 },
    );
  }

  if (code.endsWith("_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı.", code },
      { status: 404 },
    );
  }

  // A7 eligibility/bağımlılık/graf blocker → 409 (kalite yetersizliği = state conflict).
  if (A7_CONFLICT_CODES.has(code)) {
    return NextResponse.json(
      { ok: false, error: "Kalite/yayın koşulları sağlanmadı.", code },
      { status: 409 },
    );
  }

  // Kalan (required-field/internal/FAILED): generic 500 (ham metin yok).
  return NextResponse.json(
    { ok: false, error: "Durum geçişi tamamlanamadı.", code },
    { status: 500 },
  );
}
