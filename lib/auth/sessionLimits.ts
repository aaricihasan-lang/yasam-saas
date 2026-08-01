/**
 * Faz 1 / P3 — Oturum limiti çekirdeği (saf, yan-etkisiz; harness'lenebilir).
 *
 * Bağlayıcı semantik:
 *   -1 = SINIRSIZ (unlimited)  ·  0 = bu cihaz türünden GİRİŞ YASAK  ·  N = en fazla N
 *
 * Enforcement modeli: REJECT-NEW. Limit aşılırsa YENİ giriş reddedilir; mevcut
 * oturumlar REVOKE EDİLMEZ (P3 kararı). Atomik/race-safe karar DB tarafında
 * (create_session_within_limits RPC, advisory lock) verilir; buradaki fonksiyonlar
 * saf mantık + normalize + mesaj üretimi içindir.
 */

export const UNLIMITED = -1;
export const MAX_LIMIT = 10000;

export const DEVICE_TYPES = ["desktop", "mobile", "tablet", "unknown"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export type LimitReason =
  | "device_forbidden"
  | "device_limit"
  | "total_forbidden"
  | "total_limit";

export type LimitDecision = { allowed: true } | { allowed: false; reason: LimitReason };

/**
 * Ham limit değerini güvenli tam sayıya normalize eder.
 *   - null / undefined / NaN / sonsuz / < -1  → -1 (SINIRSIZ, fail-safe)
 *   - > MAX_LIMIT → MAX_LIMIT
 *   - aksi halde kırpılmış tam sayı (0 = yasak, N = max, -1 = sınırsız)
 * NOT: 0 KASITLI "yasak"tır; yalnız geçersiz/beklenmedik değerler sınırsıza düşer.
 */
export function normalizeLimit(raw: unknown): number {
  // null/undefined → SINIRSIZ (Number(null)=0 tuzağına düşme; fail-safe).
  if (raw === null || raw === undefined || raw === "") return UNLIMITED;
  const n = Number(raw);
  if (!Number.isFinite(n)) return UNLIMITED;
  const i = Math.trunc(n);
  if (i < -1) return UNLIMITED;
  if (i > MAX_LIMIT) return MAX_LIMIT;
  return i;
}

/** Bir limit "sınırsız" mı? */
export function isUnlimited(limit: number): boolean {
  return normalizeLimit(limit) === UNLIMITED;
}

/**
 * REJECT-NEW değerlendirmesi (saf). Platform limiti önce, sonra toplam limit.
 * activePlatform / activeTotal = YENİ oturum EKLENMEDEN önceki aktif sayılar.
 */
export function evaluateNewSession(args: {
  platformLimit: number;
  totalLimit: number;
  activePlatform: number;
  activeTotal: number;
}): LimitDecision {
  const platformLimit = normalizeLimit(args.platformLimit);
  const totalLimit = normalizeLimit(args.totalLimit);
  const activePlatform = Math.max(0, Math.trunc(Number(args.activePlatform) || 0));
  const activeTotal = Math.max(0, Math.trunc(Number(args.activeTotal) || 0));

  if (platformLimit === 0) return { allowed: false, reason: "device_forbidden" };
  if (platformLimit > 0 && activePlatform >= platformLimit) {
    return { allowed: false, reason: "device_limit" };
  }
  if (totalLimit === 0) return { allowed: false, reason: "total_forbidden" };
  if (totalLimit > 0 && activeTotal >= totalLimit) {
    return { allowed: false, reason: "total_limit" };
  }
  return { allowed: true };
}

/** Cihaz türü için Türkçe etiket (UI + mesaj). */
export function deviceLabel(deviceType: string): string {
  switch (deviceType) {
    case "mobile":
      return "Mobil";
    case "tablet":
      return "Tablet";
    case "desktop":
      return "Masaüstü";
    default:
      return "Bilinmeyen cihaz";
  }
}

/** Reddedilen girişe kullanıcıya gösterilecek açık Türkçe mesaj (secret/PII yok). */
export function limitReasonMessage(reason: LimitReason, deviceType: string): string {
  switch (reason) {
    case "device_forbidden":
      return `Bu cihaz türünden (${deviceLabel(deviceType)}) giriş kapalıdır. Lütfen yöneticinizle iletişime geçin.`;
    case "device_limit":
      return `${deviceLabel(deviceType)} için eşzamanlı oturum limitine ulaşıldı. Açık bir oturumu kapatın veya yöneticinizle iletişime geçin.`;
    case "total_forbidden":
      return "Hesabınız için oturum açma kapalıdır. Lütfen yöneticinizle iletişime geçin.";
    case "total_limit":
      return "Eşzamanlı oturum limitine ulaşıldı. Açık bir oturumu kapatın veya yöneticinizle iletişime geçin.";
    default:
      return "Oturum açılamadı. Lütfen yöneticinizle iletişime geçin.";
  }
}

/**
 * user-agent → cihaz türü (server-side; istemci beyanına güvenilmez).
 *   - iPad / "tablet" / kindle / playbook → tablet
 *   - Android "Mobile" içermiyorsa → tablet (Android tabletler "Mobile" token'ı taşımaz)
 *   - mobile / android(mobile) / iphone / ipod / opera mini / windows phone → mobile
 *     (Android WebView UA'sı "Android ... wv ... Mobile" → mobile sayılır)
 *   - boş UA → unknown  ·  aksi → desktop (güvenli fallback)
 */
export function classifyDeviceType(userAgent: string): DeviceType {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|playbook|silk/.test(ua)) return "tablet";
  if (/android/.test(ua) && !/mobile/.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|opera mini|windows phone|iemobile|blackberry/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}
