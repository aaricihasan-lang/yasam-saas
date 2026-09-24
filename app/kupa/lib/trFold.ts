/**
 * KUPA & HACAMAT — Türkçe-duyarlı arama katlaması (client-side search/filter için).
 *
 * Amaç: uzman "istanbul" yazınca "İstanbul", "IŞIK" yazınca "ışık" bulabilsin. Türkçe
 * locale lowercase (İ→i, I→ı) uygulanır, ardından i/ı aramada EŞDEĞER sayılır (ı→i).
 * Aşırı unicode framework YOK — küçük, bağımsız yardımcı.
 */

/** Değeri (string | string[] | null | number…) aranabilir tek bir küçük-harf string'e katla. */
export function trFold(value: unknown): string {
  if (value == null) return "";
  const raw = Array.isArray(value) ? value.join(" ") : String(value);
  return raw.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}

/** `needle` (kullanıcı sorgusu), `haystack` içinde Türkçe-katlanmış olarak geçiyor mu? */
export function trIncludes(haystack: unknown, needle: string): boolean {
  const q = trFold(needle).trim();
  if (q === "") return true;
  return trFold(haystack).includes(q);
}
