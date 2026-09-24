/**
 * KUPA & HACAMAT — numeric alan normalizasyonu (TEK KAYNAK; client + server ortak).
 *
 * KUP-NEW-1 regresyon düzeltmesi. PR #276 sonrası boş sayısal form alanı `"" → null`
 * oldu (HAC-UX-5). Bu doğru davranış NULLABLE numeric alanlar (ör. `year`) içindi; ancak
 * `sort_order` kolonu TÜM Kupa tablolarında `integer NOT NULL DEFAULT 0`'dır. Açık `null`
 * → NOT NULL ihlali → 500 (Nokta / Kaynak / Bilgi Kütüphanesi create akışında "Sıra" boş).
 *
 * Bu modül iki sözleşmeyi ayrıştırır ve HEM client (CrudManager.fromFormValue) HEM server
 * (api.ts insert/update backstop) tarafından kullanılır — böylece doğrudan API çağrısı veya
 * gelecekteki başka bir client da DB'ye açık `sort_order: null` gönderemez.
 */

/**
 * NOT NULL DEFAULT 0 sözleşmeli numeric (sort_order): boş / whitespace / null / geçersiz → 0.
 * Gerçek sayısal değer (0 dahil) KORUNUR. DB'ye ASLA null gönderilmemesini garanti eder.
 */
export function normalizeSortOrder(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0; // null / undefined / boolean / object → 0
}

/**
 * NULLABLE numeric (ör. `year`): boş / whitespace / geçersiz → null; gerçek sayı → sayı.
 * Number("")→0 yanlış-verisi engellenir. Mevcut HAC-UX-5 davranışının aynısı (regresyon YOK).
 */
export function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null; // null / undefined / boolean / object → null
}

/**
 * Server backstop: bir yazma payload'unda `sort_order` VARSA onu güvenli 0 sözleşmesine
 * zorlar (yoksa DOKUNMAZ → DB DEFAULT 0 çalışır). Diğer numeric alanlar (year, cx/cy…)
 * KASITLI olarak değiştirilmez. Shallow kopya döner; girişi mutate etmez.
 */
export function withSafeSortOrder(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(fields, "sort_order")) return fields;
  return { ...fields, sort_order: normalizeSortOrder(fields.sort_order) };
}
