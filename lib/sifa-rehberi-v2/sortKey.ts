/**
 * Kesirli sıralama anahtarı (fractional index). Bir öğeyi iki kardeşin arasına taşımak
 * YALNIZ o öğenin anahtarını değiştirir → büyük ağaçlarda kardeşlerin topluca yeniden
 * yazılması (ve mevcut Şifa'daki sil-yeniden-ekle kalıbı) gerekmez.
 *
 * Alfabe 0-9a-z; anahtarlar asla '0' ile bitmez → her iki anahtar arasına yer vardır.
 */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/** a < sonuç < b. a=null → en başa, b=null → en sona. */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`keyBetween: geçersiz sıra (${a} >= ${b})`);
  }
  return midpoint(a ?? "", b);
}

export function compareKeys(a: { sortKey: string; id: string }, b: { sortKey: string; id: string }): number {
  if (a.sortKey < b.sortKey) return -1;
  if (a.sortKey > b.sortKey) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
