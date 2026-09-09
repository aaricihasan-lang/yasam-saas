/**
 * Beslenme — export (Word/PDF) CTA görünürlük contract'ı (TEK KAYNAK).
 *
 * Politika (Hasan Hoca kesin kararı): Word/PDF indirme CTA'sı YALNIZ masaüstünde görünür.
 *   mobil (375/390) · tablet (768/1024) → GİZLİ ;  masaüstü (≥1280) → GÖRÜNÜR.
 *
 * Uygulama saf CSS/Tailwind iledir (UA sniffing YOK, backend engeli YOK). Görünürlük eşiği
 * Tailwind `xl` (1280px) breakpoint'idir. `isExportVisibleAtWidth` yalnız harness/doğrulama
 * içindir; CSS mekanizmasıyla aynı eşiği (XL_BREAKPOINT_PX) paylaşır → drift olmaz.
 *
 * Backend Word endpoint'i DEĞİŞMEZ; masaüstü owner export çalışmaya devam eder.
 */

/** Tailwind `xl` breakpoint (px). Görünürlük eşiği. */
export const XL_BREAKPOINT_PX = 1280;

/**
 * Tailwind sınıfı: <xl gizli, ≥xl inline-flex görünür.
 * Sarmalayıcı (span) üzerinde kullanılır; iç butonun kendi display'i etkilenmez.
 */
export const EXPORT_DESKTOP_ONLY_CLASS = "hidden xl:inline-flex";

/** Verilen viewport genişliğinde export CTA görünür mü? (≥ xl). */
export function isExportVisibleAtWidth(widthPx: number): boolean {
  return Number.isFinite(widthPx) && widthPx >= XL_BREAKPOINT_PX;
}
