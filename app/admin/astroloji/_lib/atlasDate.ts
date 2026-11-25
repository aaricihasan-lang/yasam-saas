// Gökyüzü Atlası — ekran tarih biçimi (I18N-F1-R5 ATLAS-B; Owner A8 / A13). Yalnız GÖSTERİM: anlar, saat dilimi, ISO saklama
// ve hesap DEĞİŞMEZ. Ayraç F1'in merkezî kuralından (lib/i18n/format absoluteDateSeparator): tr "GG.AA.YYYY" (bugünkü çıktı,
// bayt-bayt aynı) · en "GG/AA/YYYY" (gün/ay/yıl sırası her dilde aynı).
import { absoluteDateSeparator } from "@/lib/i18n/format";

/** ISO tarih / an ("YYYY-MM-DD…") → gün/ay/yıl, ayraç dile göre. */
export function dmyOf(iso: string, locale: string): string {
  const s = absoluteDateSeparator(locale);
  return `${iso.slice(8, 10)}${s}${iso.slice(5, 7)}${s}${iso.slice(0, 4)}`;
}

/** ISO an → "gün/ay/yıl SS:DD". */
export function dmyHmOf(iso: string, locale: string): string {
  return `${dmyOf(iso, locale)} ${iso.slice(11, 16)}`;
}

/** Hazır metindeki (lib / sağlayıcı kaynaklı) "GG.AA.YYYY" tarihleri ekran diline; tr'de metin aynen döner. */
export function dmyText(text: string, locale: string): string {
  const s = absoluteDateSeparator(locale);
  return s === "." ? text : text.replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, `$1${s}$2${s}$3`);
}
