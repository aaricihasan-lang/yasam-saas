/**
 * ÜYE YÖNETİMİ FAZ 1 — Lisans / cihaz limiti SAF çekirdeği (client + server + harness).
 *
 * Bağlayıcı semantik (P3 — lib/auth/sessionLimits ile BİREBİR):
 *   -1 = SINIRSIZ  ·  0 = o cihaz türünden (veya toplamda) GİRİŞ KAPALI  ·  N = en fazla N
 *
 * MEM-001: Eski UI `Math.max(1|0, …)` ile -1'i 1/0'a çeviriyordu → değişiklik yapmadan
 * "Kaydet" üyeyi cihazlardan kilitliyordu. Bu modül round-trip'i KAYIPSIZ tutar, no-op
 * kaydı tespit eder, gerçek kilitlenme durumunu açıkça hesaplar ve "Limit Aşıldı"
 * alarmını sınırsız (-1) limitte ÜRETMEZ.
 */
import { normalizeLimit, UNLIMITED } from "@/lib/auth/sessionLimits";
import type { LicenseSettings, LicenseType, SecurityMode } from "@/lib/admin/userManagement";

/** Admin'in girebileceği anlamlı üst sınır (oturum/cihaz). DB CHECK 10000'e izin verir; ürün 100. */
export const LICENSE_SESSION_LIMIT_MAX = 100;
export const LICENSE_LOCATIONS_MIN = 1;
export const LICENSE_LOCATIONS_MAX = 20;
export const LICENSE_NOTE_MAX = 500;

export const VALID_LICENSE_TYPES: readonly LicenseType[] = [
  "single", "professional", "family", "partner", "team", "custom",
];
export const VALID_SECURITY_MODES: readonly SecurityMode[] = ["strict", "normal", "flexible"];

export type SessionLimitField =
  | "allowedActiveSessions"
  | "allowedDesktopSessions"
  | "allowedMobileSessions"
  | "allowedTabletSessions"
  | "allowedUnknownSessions";

export const SESSION_LIMIT_FIELDS: readonly SessionLimitField[] = [
  "allowedActiveSessions",
  "allowedDesktopSessions",
  "allowedMobileSessions",
  "allowedTabletSessions",
  "allowedUnknownSessions",
];

export const DEVICE_LIMIT_FIELDS: readonly SessionLimitField[] = [
  "allowedDesktopSessions",
  "allowedMobileSessions",
  "allowedTabletSessions",
  "allowedUnknownSessions",
];

export const LICENSE_FIELD_LABELS: Record<keyof LicenseSettings, string> = {
  licenseType: "Lisans Türü",
  allowedActiveSessions: "Toplam Oturum",
  allowedLocations: "İzinli Lokasyon",
  allowedDesktopSessions: "Bilgisayar/Web",
  allowedMobileSessions: "Telefon/Mobil",
  allowedTabletSessions: "Tablet",
  allowedUnknownSessions: "Tanınmayan",
  securityMode: "Güvenlik Modu",
  securityExempt: "Güvenlik İstisnası",
  licenseNote: "Admin Notu",
};

/** DB/raw değer → UI limiti (KAYIPSIZ: -1 → -1, 0 → 0, N → N; null/geçersiz → -1 = DB default). */
export function limitFromDb(raw: unknown): number {
  return normalizeLimit(raw);
}

/** Limit etiketi: -1 → "Sınırsız", 0 → "Kapalı", N → "N". */
export function formatLimitLabel(limit: unknown): string {
  const n = normalizeLimit(limit);
  if (n === UNLIMITED) return "Sınırsız";
  if (n === 0) return "Kapalı";
  return String(n);
}

/**
 * "Limit Aşıldı" kararı: sınırsız (-1) limitte ASLA aşım yok; 0 (kapalı) limitte herhangi
 * bir aktif oturum aşımdır; N limitte current > N.
 */
export function isLimitExceeded(current: unknown, limit: unknown): boolean {
  const n = normalizeLimit(limit);
  if (n === UNLIMITED) return false;
  const c = Math.max(0, Math.trunc(Number(current) || 0));
  return c > n;
}

export type LockoutAnalysis = {
  /** Hesap hiçbir cihazdan giriş yapamaz (toplam=0 veya tüm cihaz türleri=0; istisna yoksa). */
  fullLockout: boolean;
  /** Girişi kapalı cihaz türleri (0). */
  closedDevices: SessionLimitField[];
  totalClosed: boolean;
};

export function analyzeLockout(s: Pick<LicenseSettings, SessionLimitField | "securityExempt">): LockoutAnalysis {
  const closedDevices = DEVICE_LIMIT_FIELDS.filter((f) => normalizeLimit(s[f]) === 0);
  const totalClosed = normalizeLimit(s.allowedActiveSessions) === 0;
  // Güvenlik istisnası login limitlerini tamamen atlar (sessionSecurity) → kilitlenme olmaz.
  const fullLockout =
    s.securityExempt !== true && (totalClosed || closedDevices.length === DEVICE_LIMIT_FIELDS.length);
  return { fullLockout, closedDevices, totalClosed };
}

export function licenseSettingsEqual(a: LicenseSettings, b: LicenseSettings): boolean {
  return (Object.keys(LICENSE_FIELD_LABELS) as (keyof LicenseSettings)[]).every(
    (k) => a[k] === b[k],
  );
}

export type LicenseDiffRow = { field: keyof LicenseSettings; label: string; before: string; after: string };

function displayValue(field: keyof LicenseSettings, v: unknown): string {
  if ((SESSION_LIMIT_FIELDS as readonly string[]).includes(field)) return formatLimitLabel(v);
  if (field === "securityExempt") return v === true ? "Açık" : "Kapalı";
  if (field === "licenseNote") return String(v ?? "").trim() ? "(not)" : "—";
  return String(v ?? "—");
}

/** Önce/sonra farkı (UI diff paneli). Not içeriği gösterilmez (yalnız değişti bilgisi). */
export function diffLicenseSettings(before: LicenseSettings, after: LicenseSettings): LicenseDiffRow[] {
  const rows: LicenseDiffRow[] = [];
  for (const field of Object.keys(LICENSE_FIELD_LABELS) as (keyof LicenseSettings)[]) {
    if (before[field] === after[field]) continue;
    rows.push({
      field,
      label: LICENSE_FIELD_LABELS[field],
      before: field === "licenseNote" ? "önceki not" : displayValue(field, before[field]),
      after: field === "licenseNote" ? "yeni not" : displayValue(field, after[field]),
    });
  }
  return rows;
}

export type LicenseValidation =
  | { ok: true; value: LicenseSettings }
  | { ok: false; error: string };

function strictLimit(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < -1 || v > LICENSE_SESSION_LIMIT_MAX) return null;
  return v;
}

/**
 * Sunucu tarafı SIKI doğrulama (MEM-011). Tüm alanlar ZORUNLU ve tip-kesin:
 * string sayı ("5"), null, NaN, -2, >100 → hata. Eksik alan varsayılana DÜŞMEZ (sessiz
 * -1/0 dönüşümü yok) → round-trip kaybı imkânsız.
 */
export function validateLicensePayload(body: Record<string, unknown>): LicenseValidation {
  const licenseType = body.licenseType;
  if (typeof licenseType !== "string" || !VALID_LICENSE_TYPES.includes(licenseType as LicenseType)) {
    return { ok: false, error: `Geçersiz lisans türü. Kabul edilenler: ${VALID_LICENSE_TYPES.join(", ")}` };
  }
  const securityMode = body.securityMode;
  if (typeof securityMode !== "string" || !VALID_SECURITY_MODES.includes(securityMode as SecurityMode)) {
    return { ok: false, error: `Geçersiz güvenlik modu. Kabul edilenler: ${VALID_SECURITY_MODES.join(", ")}` };
  }
  const limits: Partial<Record<SessionLimitField, number>> = {};
  for (const f of SESSION_LIMIT_FIELDS) {
    const v = strictLimit(body[f]);
    if (v === null) {
      return {
        ok: false,
        error: `${LICENSE_FIELD_LABELS[f]}: -1 (sınırsız), 0 (kapalı) veya 1–${LICENSE_SESSION_LIMIT_MAX} arası tam sayı olmalıdır.`,
      };
    }
    limits[f] = v;
  }
  const loc = body.allowedLocations;
  if (typeof loc !== "number" || !Number.isInteger(loc) || loc < LICENSE_LOCATIONS_MIN || loc > LICENSE_LOCATIONS_MAX) {
    return { ok: false, error: `İzinli lokasyon ${LICENSE_LOCATIONS_MIN}–${LICENSE_LOCATIONS_MAX} arası tam sayı olmalıdır.` };
  }
  if (typeof body.securityExempt !== "boolean") {
    return { ok: false, error: "Güvenlik istisnası true/false olmalıdır." };
  }
  const note = body.licenseNote ?? "";
  if (typeof note !== "string") return { ok: false, error: "Admin notu metin olmalıdır." };
  if (note.trim().length > LICENSE_NOTE_MAX) {
    return { ok: false, error: `Admin notu en fazla ${LICENSE_NOTE_MAX} karakter olabilir.` };
  }
  return {
    ok: true,
    value: {
      licenseType: licenseType as LicenseType,
      securityMode: securityMode as SecurityMode,
      allowedActiveSessions: limits.allowedActiveSessions!,
      allowedDesktopSessions: limits.allowedDesktopSessions!,
      allowedMobileSessions: limits.allowedMobileSessions!,
      allowedTabletSessions: limits.allowedTabletSessions!,
      allowedUnknownSessions: limits.allowedUnknownSessions!,
      allowedLocations: loc,
      securityExempt: body.securityExempt,
      licenseNote: note.trim(),
    },
  };
}
