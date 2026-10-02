/**
 * Danışan Yolculuğu — gerçek takvim tarihi doğrulaması (saf, istemci + sunucu ortak).
 *
 * DY satış öncesi kapanış (VALIDATION-DATE): `31.02.2000` gibi takvimde olmayan veya
 * `9999-99-99` gibi bozuk değerler kaydedilmemeli. Yalnız regex yetmez; ay uzunluğu ve
 * artık yıl (Gregoryen: 4'e bölünür, 100'e bölünmez veya 400'e bölünür) kontrol edilir.
 *
 * Ürün sınırları (mevcut kararlar korunur):
 *  - Genel tarih aralığı 1900–2100 (kayıt ekranındaki mevcut `isRealDate` sınırı).
 *  - Doğum tarihi ayrıca bugünden (İstanbul) sonra olamaz.
 */

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Yıl/ay/gün gerçek bir Gregoryen tarih mi (ve ürün yıl aralığında mı)? */
export function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger)) return false;
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TR_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** Katı "YYYY-MM-DD" + gerçek takvim tarihi. Değilse null. */
export function parseIsoDate(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== "string") return null;
  const mt = ISO_RE.exec(value.trim());
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  return isRealCalendarDate(y, m, d) ? { y, m, d } : null;
}

export function isValidIsoDate(value: unknown): value is string {
  return parseIsoDate(value) !== null;
}

/** "GG.AA.YYYY" → geçerliyse "YYYY-MM-DD", değilse null. */
export function trDateToIso(value: string): string | null {
  const mt = TR_RE.exec(value.trim());
  if (!mt) return null;
  const iso = `${mt[3]}-${mt[2]}-${mt[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Doğum tarihi: gerçek tarih + bugünden (İstanbul günü, "YYYY-MM-DD") sonra değil. */
export function isValidBirthDate(value: unknown, todayIso: string): value is string {
  return isValidIsoDate(value) && value.trim() <= todayIso;
}
