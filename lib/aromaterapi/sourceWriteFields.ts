/**
 * Aromaterapi Kaynaklar (sources) yazma yardımcıları (client-safe; Supabase/secret YOK).
 *
 * source_type geçerliliği + publication_year biçim doğrulaması. Route katmanı kullanır.
 * SOURCE_TYPES/SOURCE_STATUS kanonik listeleri sourceReads (server-only) tarafında; burada
 * tekrar tanımlanmaz — route zaten server-only sourceReads'ten import eder ve isValidSourceType'a
 * geçirir.
 */

export type YearResult = { ok: true; value: number | null } | { ok: false };

/**
 * publication_year — opsiyonel: omitted/null/'' → null; sayı/rakam-string ise 1400–2100
 * aralığında tamsayı; aksi → fail. (DB CHECK'i de korur.)
 */
export function parseSourceYear(obj: Record<string, unknown>, key = "publication_year"): YearResult {
  if (!(key in obj)) return { ok: true, value: null };
  const v = obj[key];
  if (v === null || v === "") return { ok: true, value: null };
  let n: number | null = null;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string" && /^\d{1,4}$/.test(v.trim())) {
    n = Number(v.trim());
  } else {
    return { ok: false };
  }
  if (!Number.isInteger(n) || n < 1400 || n > 2100) return { ok: false };
  return { ok: true, value: n };
}

export function isValidSourceType(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value);
}
