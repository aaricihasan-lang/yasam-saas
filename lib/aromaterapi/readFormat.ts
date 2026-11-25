/**
 * Aromaterapi V2 — C3C küçük biçimlendirme yardımcıları (client-safe).
 * I18N: tarih yardımcıları opsiyonel `locale` alır (varsayılan "tr" → eski tr-TR çıktısı birebir);
 * BCP-47 etiketi lib/i18n/format localeTag'den (tr-TR / en-GB, 24 saat).
 */
import { localeTag } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";

/** ISO tarih → "gg.aa.yyyy" (tr-TR). Geçersiz/boş → "—". */
export function formatDateTr(iso: string | null | undefined, locale: ActiveLocale = "tr"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(localeTag(locale), { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ISO tarih-saat → "gg.aa.yyyy HH:mm" (tr-TR). */
export function formatDateTimeTr(iso: string | null | undefined, locale: ActiveLocale = "tr"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(localeTag(locale), {
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
