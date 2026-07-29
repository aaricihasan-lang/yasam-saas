/**
 * Aromaterapi V2 — C3C küçük biçimlendirme yardımcıları (client-safe).
 */

/** ISO tarih → "gg.aa.yyyy" (tr-TR). Geçersiz/boş → "—". */
export function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ISO tarih-saat → "gg.aa.yyyy HH:mm" (tr-TR). */
export function formatDateTimeTr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Metni max karaktere kısaltır (kelime sınırına yakın), sonuna "…" ekler. */
export function truncate(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}
