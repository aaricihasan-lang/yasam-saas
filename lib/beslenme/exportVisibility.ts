/**
 * Beslenme — export (Word) CTA görünürlük contract'ı (TEK KAYNAK).
 *
 * Politika (Hasan Hoca kararı, 2026-10-14): Word indirme CTA'sı TÜM cihazlarda görünür —
 *   masaüstü web · mobil web · Android Chrome · Android uygulaması (WebView) · iPhone Safari · tablet.
 *   (Önceki "yalnız masaüstü (hover + fine pointer)" kararı KALDIRILDI; globals.css'teki
 *   `.beslenme-export-desktop-only` CSS kuralı ve sarmalayıcı sınıfı da kaldırıldı.)
 *
 * Görünürlük girdi yeteneğine (hover/pointer) veya viewport genişliğine BAĞLI DEĞİLDİR.
 * Word oluşturma mantığı ve backend endpoint'i DEĞİŞMEZ (lib/beslenme/faz6Client.downloadPlanWord,
 * app/api/beslenme/plans/[id]/word). Bu modül yalnız harness/doğrulama içindir.
 */

/** İşaretleyici (pointer) yeteneği — CSS `pointer` media feature ile aynı değerler. */
export type PointerCapability = "fine" | "coarse" | "none";
/** Hover yeteneği — CSS `hover` media feature ile aynı değerler. */
export type HoverCapability = "hover" | "none";

/** Cihaz girdi yeteneği (yalnız teşhis/harness; görünürlüğü ETKİLEMEZ). */
export interface InputCapability {
  hover: HoverCapability;
  pointer: PointerCapability;
  widthPx?: number;
}

/**
 * Verilen girdi yeteneğinde export CTA görünür mü? 2026-10-14'ten itibaren: HER ZAMAN evet
 * (dokunmatik, tablet, telefon dahil). Parametre geriye uyumluluk ve harness için korunur.
 */
export function isExportVisibleForInput(cap: InputCapability): boolean {
  void cap;
  return true;
}
