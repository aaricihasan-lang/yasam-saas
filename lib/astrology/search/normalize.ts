// Astroloji — Türkçe arama normalizasyonu (SAF; istemci + sunucu + test).
//
// SQL karşılığı: public.astro_norm (20271101000400). İkisi AYNI kuralı uygular ve PG testi aynı
// vektörlerle doğrular: İ/I/ı/i → i, ğ→g, ü→u, ş→s, ö→o, ç→c, â/î/û → a/i/u; küçük harf; boşluklar
// tek boşluğa iner ve kırpılır. Önce Türkçe harfler eşlenir → yerel ayar (tr/en/C) sonucu değiştirmez.

const MAP: Record<string, string> = {
  İ: "i", I: "i", ı: "i", Ğ: "g", ğ: "g", Ü: "u", ü: "u", Ş: "s", ş: "s", Ö: "o", ö: "o", Ç: "c", ç: "c",
  Â: "a", â: "a", Î: "i", î: "i", Û: "u", û: "u",
};

export function astroNorm(v: string | null | undefined): string {
  const s = (v ?? "").replace(/[İIıĞğÜüŞşÖöÇçÂâÎîÛû]/g, (c) => MAP[c] ?? c).toLowerCase();
  return s.replace(/\s+/g, " ").trim();
}

/** Arama metni sınırı (sunucu da uygular). */
export const ASTRO_SEARCH_MAX = 100;

/** YYYY-MM-DD ve gerçek takvim günü mü? */
export function parseIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** İletişim bilgisini kısmen maskeler: yalnız son iki rakam görünür. */
export function maskPhone(v: string | null | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `${"•".repeat(digits.length - 2)}${digits.slice(-2)}`;
}
