/**
 * Beslenme — export (Word) CTA görünürlük contract'ı (TEK KAYNAK).
 *
 * Politika (Hasan Hoca kesin kararı): Word indirme CTA'sı YALNIZ gerçek masaüstünde görünür.
 *   mobil · tablet (dokunmatik) → GİZLİ ;  masaüstü (fare/trackpad) → GÖRÜNÜR.
 *
 * KARAR KAYNAĞI = GİRDİ YETENEĞİ, VIEWPORT GENİŞLİĞİ DEĞİL.
 *   Eski "xl (1280px) breakpoint" width-only kontratı KALDIRILDI: gerçek masaüstü Chrome'da
 *   pencere 1280 altına inince Word butonu kayboluyordu (yanlış cihaz sınıflandırması).
 *   Yeni kontrat cihazı işaretleyici yeteneğiyle sınıflandırır:
 *     (hover: hover) AND (pointer: fine) → fare/trackpad = masaüstü → GÖRÜNÜR
 *     coarse pointer / hover yok        → dokunmatik = mobil & tablet → GİZLİ
 *   Genişlik ne olursa olsun (1024/1280/1600) masaüstü input'ta buton kaybolmaz.
 *
 * Uygulama saf CSS media-query iledir (UA sniffing YOK, backend engeli YOK, JS hydration YOK).
 * CSS mekanizması `app/globals.css` içindeki `.beslenme-export-desktop-only` sınıfıdır ve
 * `EXPORT_DESKTOP_MEDIA_QUERY` ile bire bir aynı koşulu kodlar → drift olmaz.
 * Buradaki predicate yalnız harness/doğrulama içindir; CSS ile aynı koşulu paylaşır.
 *
 * Backend Word endpoint'i DEĞİŞMEZ; masaüstü owner export çalışmaya devam eder.
 */

/** İşaretleyici (pointer) yeteneği — CSS `pointer` media feature ile aynı değerler. */
export type PointerCapability = "fine" | "coarse" | "none";
/** Hover yeteneği — CSS `hover` media feature ile aynı değerler. */
export type HoverCapability = "hover" | "none";

/** Cihaz girdi yeteneği. `widthPx` YALNIZ teşhis içindir; görünürlüğü ETKİLEMEZ. */
export interface InputCapability {
  hover: HoverCapability;
  pointer: PointerCapability;
  /** Yalnız harness/teşhis; width-only sınıflandırma kaldırıldığı için karara girmez. */
  widthPx?: number;
}

/**
 * CSS `.beslenme-export-desktop-only` sınıfının kodladığı masaüstü koşulu (TEK KAYNAK).
 * globals.css'teki media query ile karakter-karakter aynı olmalıdır (harness drift guard'ı kontrol eder).
 */
export const EXPORT_DESKTOP_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Canonical CSS sınıfı: default gizli, yalnız masaüstü-benzeri girdide (hover+fine) inline-flex.
 * Sarmalayıcı (span) üzerinde kullanılır; iç butonun kendi display'i etkilenmez.
 */
export const EXPORT_DESKTOP_ONLY_CLASS = "beslenme-export-desktop-only";

/**
 * Verilen girdi yeteneğinde export CTA görünür mü?
 * CSS media query ile birebir aynı contract: masaüstü-benzeri fare/trackpad → görünür.
 * `widthPx` alanı KASITLI olarak yok sayılır (width tek başına karar vermez).
 */
export function isExportVisibleForInput(cap: InputCapability): boolean {
  return cap.hover === "hover" && cap.pointer === "fine";
}
