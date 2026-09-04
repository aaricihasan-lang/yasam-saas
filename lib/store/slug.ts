/**
 * lib/store/slug.ts — Doğal Pazar slug normalizasyonu ve doğrulaması.
 *
 * DB CHECK: `^[a-z0-9]+(-[a-z0-9]+)*$`. Bu yardımcı client'ta öneri üretir; server
 * yine kendi doğrulamasını yapar (client'a güvenilmez).
 */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Türkçe karakterleri ASCII'ye indirger (slug üretimi için). */
const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o",
  ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", î: "i", û: "u",
};

/**
 * Serbest metinden güvenli slug üretir: TR→ASCII, küçük harf, alfasayısal-dışı → tire,
 * baş/son tireler kırpılır, tekrarlı tireler tekilleştirilir.
 */
export function slugifyStore(input: string): string {
  const lowered = Array.from(input ?? "")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase();
  return lowered
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** DB sözleşmesine uyan geçerli bir slug mı? (maxLen dahil.) */
export function isValidStoreSlug(slug: unknown, maxLen: number): slug is string {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= maxLen &&
    SLUG_RE.test(slug)
  );
}
