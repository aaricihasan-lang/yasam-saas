/**
 * lib/cosmic/dateRange.ts
 *
 * KOZMİK AJANDA — TEK KAYNAK doğrulanmış tarih aralığı.
 *
 * Amaç: Astronomy Engine / takvim hesapları bir tarih dışında sessizce YETKİLİ GÖRÜNÜMLÜ ama
 * YANLIŞ veri üretebilir. Ürünün iddiası "yalnız doğrulanmış astronomik veri" olduğundan,
 * desteklenen aralık DIŞINDA hiçbir motor sonucu YETKİLİ olarak gösterilmemelidir. Bu modül;
 * UI, motor katmanı, API ve testlerin AYNI sınırı kullanmasını sağlar.
 *
 * İKİ AYRI KAVRAM (karıştırılmaz):
 *   1) PUBLIC destek aralığı — kullanıcının seçebildiği/sorgulayabildiği TAKVİM GÜNLERİ:
 *      01.01.2026 – 31.12.2100 (dahil). Gün-anahtarı (Y/M/D) bazlıdır → saat dilimi bağımsız.
 *   2) INTERNAL hesap ufku — olay motorlarının (retro/burç geçişi/tutulma) sınır günlerinin
 *      durumunu doğru çözebilmesi için public aralığın ÖNÜNDE ve ARKASINDA hesapladığı tampon
 *      (ör. 31.12.2100'de süren bir retronun 2101'deki bitişi). Tampon verisi kullanıcıya
 *      desteklenen tarih olarak AÇILMAZ.
 *
 * Aralık gerekçesi: scripts/cosmic-longrange (Swiss Ephemeris + JPL Horizons + USNO) ve
 * scripts/cosmic-2100 regresyon paketi 2026–2100'ün HER gününü doğrular.
 *
 * Bu dosya framework-agnostiktir (React/Next import YOK).
 */

// ─── Kanonik public sınır (TEK KAYNAK) ─────────────────────────────────────────
export const SUPPORT_START_YEAR = 2026;
export const SUPPORT_END_YEAR = 2100;

/** Public sınır gün-anahtarları (YYYY-MM-DD, dahil). */
export const SUPPORT_START_KEY = "2026-01-01";
export const SUPPORT_END_KEY = "2100-12-31";

/** Alt sınır — dahil. Yerel gün başlangıcı (00:00). */
export const SUPPORT_START = new Date(SUPPORT_START_YEAR, 0, 1, 0, 0, 0, 0);
/** Üst sınır — dahil. Yerel gün sonu (23:59:59.999). Gün seçimi için clampDayToSupported kullanın. */
export const SUPPORT_END = new Date(SUPPORT_END_YEAR, 11, 31, 23, 59, 59, 999);

export const SUPPORT_START_LABEL = "01.01.2026";
export const SUPPORT_END_LABEL = "31.12.2100";
export const SUPPORT_RANGE_LABEL = `${SUPPORT_START_LABEL} – ${SUPPORT_END_LABEL}`;

// ─── Internal hesap ufku (public DEĞİL) ─────────────────────────────────────────
// Olay motorları [INTERNAL_START_YEAR-01-01, INTERNAL_END_YEAR_EXCLUSIVE-01-01) UTC aralığında
// üretir. Önde ≥2 yıl (2026-01-01'de süren retrolar 2025'te başlar), arkada ≥1 yıl (31.12.2100'de
// süren retro/geçişlerin 2101'deki bitişi) tampon: en uzun retro ~5.5 ay.
export const INTERNAL_START_YEAR = SUPPORT_START_YEAR - 2;           // 2024
export const INTERNAL_END_YEAR_EXCLUSIVE = SUPPORT_END_YEAR + 2;     // 2102-01-01 (hariç)

/** Kapsam dışı tek, tutarlı kullanıcı mesajı (UI + rapor + API). */
export const OUT_OF_RANGE_MESSAGE =
  `Bu tarih doğrulanmış astronomik veri kapsamı dışında (${SUPPORT_RANGE_LABEL}). ` +
  `Yalnız bu aralıkta doğruluğu bağımsız referansla teyit edilmiş veri gösterilir.`;

/** Geçersiz tarih mesajı (G7 — fail-closed). */
export const INVALID_DATE_MESSAGE = "Geçersiz tarih. Lütfen gerçek bir takvim günü girin.";

// ─── Yardımcılar ────────────────────────────────────────────────────────────────

/** Geçerli (NaN olmayan) Date mi? */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

/**
 * G7 — fail-closed: geçersiz Date ile astronomik sonuç ÜRETİLMEZ. Motor fonksiyonları bunu çağırır;
 * yaklaşık/legacy hesaba sessiz düşüş YOKTUR. UI/API girdiyi önceden doğrulamalıdır.
 */
export function assertValidDate(date: unknown, where = "astronomik hesap"): asserts date is Date {
  if (!isValidDate(date)) throw new RangeError(`${where}: geçersiz tarih (Invalid Date)`);
}

/** y/m(1-12)/d gerçek bir Gregoryen takvim günü mü? (31.02 gibi taşmaları reddeder) */
export function isRealCalendarDay(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** y/m(1-12)/d → "YYYY-MM-DD" */
export function dayKey(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Date'in YEREL (tarayıcı/sunucu) takvim günü anahtarı. */
export function localDayKey(date: Date): string {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Gün-anahtarı public aralıkta mı? (sınırlar dahil; saat dilimi bağımsız) */
export function isDayKeySupported(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= SUPPORT_START_KEY && key <= SUPPORT_END_KEY;
}

/** Takvim günü (y/m 1-12/d) public aralıkta ve gerçek bir gün mü? */
export function isCalendarDaySupported(y: number, m: number, d: number): boolean {
  return isRealCalendarDay(y, m, d) && isDayKeySupported(dayKey(y, m, d));
}

// ─── Sorgular ─────────────────────────────────────────────────────────────────

/** Verilen anın YEREL takvim günü desteklenen aralıkta mı? (geçersiz → false) */
export function isWithinSupportedRange(date: Date): boolean {
  if (!isValidDate(date)) return false;
  return isDayKeySupported(localDayKey(date));
}

export type SupportCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "before" | "after"; message: string };

/** Ayrıntılı kontrol — UI'ın "çok geride / çok ileride / geçersiz" ayrımı yapması için. */
export function checkSupportedRange(date: Date): SupportCheck {
  if (!isValidDate(date)) return { ok: false, reason: "invalid", message: INVALID_DATE_MESSAGE };
  const k = localDayKey(date);
  if (k < SUPPORT_START_KEY) return { ok: false, reason: "before", message: OUT_OF_RANGE_MESSAGE };
  if (k > SUPPORT_END_KEY) return { ok: false, reason: "after", message: OUT_OF_RANGE_MESSAGE };
  return { ok: true };
}

/** Yalnız yıl bazlı hızlı kapsam kontrolü (rapor/yıl seçici için). */
export function isYearSupported(year: number): boolean {
  return Number.isInteger(year) && year >= SUPPORT_START_YEAR && year <= SUPPORT_END_YEAR;
}

/** Public yıl listesi (yıl seçiciler — Hacamat, rapor). */
export function supportedYears(): number[] {
  return Array.from({ length: SUPPORT_END_YEAR - SUPPORT_START_YEAR + 1 }, (_, i) => SUPPORT_START_YEAR + i);
}

// ─── Navigasyon kelepçesi ──────────────────────────────────────────────────────

/**
 * Bir GÜN seçimini desteklenen aralığa kelepçeler ve DAİMA yerel gece yarısı (00:00) döner.
 * (G8-C: üst sınırda gizli 23:59:59 referansı oluşmaz; tüm günler aynı referans anını kullanır.)
 * Geçersiz tarih → alt sınır günü (navigasyon için; veri üretimi için checkSupportedRange kullanın).
 */
export function clampDayToSupported(date: Date): Date {
  if (!isValidDate(date)) return new Date(SUPPORT_START.getTime());
  const k = localDayKey(date);
  if (k < SUPPORT_START_KEY) return new Date(SUPPORT_START_YEAR, 0, 1);
  if (k > SUPPORT_END_KEY) return new Date(SUPPORT_END_YEAR, 11, 31);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Geriye uyumluluk: gün-seçim kelepçesi (00:00 referanslı). */
export function clampToSupported(date: Date): Date {
  return clampDayToSupported(date);
}

/**
 * {year, month} ay-görünümünün desteklenen aralıkta olup olmadığını ve bir
 * öncekine/sonrakine gidilebilirliğini bildirir (prev/next butonlarını devre dışı
 * bırakmak için). month: 0-11.
 */
export function canNavigateMonth(year: number, month: number, dir: -1 | 1): boolean {
  const targetY = month + dir < 0 ? year - 1 : month + dir > 11 ? year + 1 : year;
  const targetM = (month + dir + 12) % 12;
  return isMonthSupported(targetY, targetM);
}

/** Ay (month 0-11) public aralıkla kesişiyor mu? */
export function isMonthSupported(year: number, month: number): boolean {
  const first = dayKey(year, month + 1, 1);
  const last = dayKey(year, month + 1, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return last >= SUPPORT_START_KEY && first <= SUPPORT_END_KEY;
}
