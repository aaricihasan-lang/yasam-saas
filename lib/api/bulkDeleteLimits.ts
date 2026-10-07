/**
 * Toplu silme endpoint'leri için ortak SUNUCU sınırı (SAF).
 *
 * Tüm toplu silmeler zaten tenant filtreli; bu sınır kaynak/URL-uzunluğu taşmasını ve
 * kontrolsüz "sınırsız id listesi" isteklerini keser. UI 3+ kayıtta 3 aşamalı onay ister
 * (lib/ui/bulkDeleteGuard); sunucu ise tek istekte en fazla MAX_BULK_DELETE_IDS kayıt siler.
 */
export const MAX_BULK_DELETE_IDS = 1000;

export const BULK_DELETE_LIMIT_ERROR = `Tek seferde en fazla ${MAX_BULK_DELETE_IDS} kayıt silinebilir. Lütfen seçimi daraltın.`;

/** Tekrarlı id'leri ayıklar (sıra korunur). */
export function dedupeIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

export function exceedsBulkDeleteLimit(ids: readonly unknown[]): boolean {
  return ids.length > MAX_BULK_DELETE_IDS;
}
