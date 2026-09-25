/**
 * lib/cosmic/dateRange.ts
 *
 * KOZMİK AJANDA — TEK KAYNAK doğrulanmış tarih aralığı (KAJ-P1-02).
 *
 * Amaç: Astronomy Engine / Intl bir tarih dışında sessizce YETKİLİ GÖRÜNÜMLÜ ama
 * YANLIŞ veri üretebilir. Ürünün iddiası "yalnız doğrulanmış astronomik veri"
 * olduğundan, desteklenen aralık DIŞINDA hiçbir motor sonucu YETKİLİ olarak
 * gösterilmemelidir. Bu modül; UI, motor katmanı, API ve testlerin AYNI sınırı
 * kullanmasını sağlar — "bir yerde 2050, başka yerde sınırsız" durumunu bitirir.
 *
 * Aralık gerekçesi:
 *   - Bağımsız doğrulama harness'i (scripts/cosmic-validation) 2026→2050 penceresini
 *     Swiss Ephemeris referansıyla doğrular (208/208 olay).
 *   - Retro (retro.ts), burç geçişi (events.ts) ve tutulma (eclipses.ts) olay
 *     motorları bu pencereyi kapsayacak şekilde önceden hesaplanır.
 *   - Ürün vitrini de "20.06.2026 – 31.12.2050" aralığını ilan eder.
 *
 * Bu dosya framework-agnostiktir (React/Next import YOK) → motor, UI ve testlerden
 * güvenle import edilir.
 */

// ─── Kanonik sınır (TEK KAYNAK) ───────────────────────────────────────────────
// Yıl sabitleri olay motorlarının (retro/sign-change/eclipse) önhesap penceresini
// da besler; böylece "advertised range" ile gerçek veri penceresi ayrışamaz.
export const SUPPORT_START_YEAR = 2026;
export const SUPPORT_END_YEAR = 2050;

/** Alt sınır — dahil. Yerel gün başlangıcı (00:00). */
export const SUPPORT_START = new Date(SUPPORT_START_YEAR, 5, 20, 0, 0, 0, 0); // 20 Haziran 2026
/** Üst sınır — dahil. Yerel gün sonu (23:59:59.999). */
export const SUPPORT_END = new Date(SUPPORT_END_YEAR, 11, 31, 23, 59, 59, 999); // 31 Aralık 2050

export const SUPPORT_START_LABEL = "20.06.2026";
export const SUPPORT_END_LABEL = "31.12.2050";
export const SUPPORT_RANGE_LABEL = `${SUPPORT_START_LABEL} – ${SUPPORT_END_LABEL}`;

/** Kapsam dışı tek, tutarlı kullanıcı mesajı (UI + rapor + API). */
export const OUT_OF_RANGE_MESSAGE =
  `Bu tarih doğrulanmış astronomik veri kapsamı dışında (${SUPPORT_RANGE_LABEL}). ` +
  `Yalnız bu aralıkta doğruluğu bağımsız referansla teyit edilmiş veri gösterilir.`;

// ─── Sorgular ─────────────────────────────────────────────────────────────────

/** Verilen an, desteklenen aralıkta mı? (sınırlar dahil) */
export function isWithinSupportedRange(date: Date): boolean {
  const t = date instanceof Date ? date.getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  return t >= SUPPORT_START.getTime() && t <= SUPPORT_END.getTime();
}

export type SupportCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "before" | "after"; message: string };

/** Ayrıntılı kontrol — UI'ın "çok geride / çok ileride / geçersiz" ayrımı yapması için. */
export function checkSupportedRange(date: Date): SupportCheck {
  const t = date instanceof Date ? date.getTime() : NaN;
  if (!Number.isFinite(t)) return { ok: false, reason: "invalid", message: OUT_OF_RANGE_MESSAGE };
  if (t < SUPPORT_START.getTime()) return { ok: false, reason: "before", message: OUT_OF_RANGE_MESSAGE };
  if (t > SUPPORT_END.getTime()) return { ok: false, reason: "after", message: OUT_OF_RANGE_MESSAGE };
  return { ok: true };
}

/** Yalnız yıl bazlı hızlı kapsam kontrolü (motor önhesap pencereleri için). */
export function isYearSupported(year: number): boolean {
  return year >= SUPPORT_START_YEAR && year <= SUPPORT_END_YEAR;
}

// ─── Navigasyon kelepçesi ──────────────────────────────────────────────────────

/** Bir tarihi desteklenen aralığa kelepçeler (takvim navigasyonu sert sınırı aşamaz). */
export function clampToSupported(date: Date): Date {
  const t = date instanceof Date ? date.getTime() : NaN;
  if (!Number.isFinite(t)) return new Date(SUPPORT_START.getTime());
  if (t < SUPPORT_START.getTime()) return new Date(SUPPORT_START.getTime());
  if (t > SUPPORT_END.getTime()) return new Date(SUPPORT_END.getTime());
  return date;
}

/**
 * {year, month} ay-görünümünün desteklenen aralıkta olup olmadığını ve bir
 * öncekine/sonrakine gidilebilirliğini bildirir (prev/next butonlarını devre dışı
 * bırakmak için). month: 0-11.
 */
export function canNavigateMonth(year: number, month: number, dir: -1 | 1): boolean {
  // Hedef ayın herhangi bir günü aralıkla kesişiyorsa navigasyona izin ver.
  const targetY = month + dir < 0 ? year - 1 : month + dir > 11 ? year + 1 : year;
  const targetM = (month + dir + 12) % 12;
  const monthStart = new Date(targetY, targetM, 1, 0, 0, 0, 0).getTime();
  const monthEnd = new Date(targetY, targetM + 1, 0, 23, 59, 59, 999).getTime();
  return monthEnd >= SUPPORT_START.getTime() && monthStart <= SUPPORT_END.getTime();
}
