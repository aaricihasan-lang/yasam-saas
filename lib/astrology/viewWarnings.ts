/**
 * Atlas görünüm uyarıları — DİL-BAĞIMSIZ kodlar (I18N-0008 / Atl-A0). SAF; istemci güvenli.
 *
 * Sunucu uyarı METNİ (TechniqueView.warnings) aynen kalır (Türkçe; arşiv snapshot'larında donmuş). Ekrandaki rozet /
 * uyarı kararları artık bu kodlardan verilir: metin çevrilse bile rozet sessizce kaybolmaz.
 *
 * Eski kayıt (kod alanı olmayan görünüm / arşiv methodSnapshot) için YALNIZ geri dönüş yolunda Türkçe önek okuyucu
 * kullanılır — davranış, kodlardan önceki ekran kararlarıyla birebir aynıdır (scripts/astrology/atlas-view-warning-codes.harness.ts).
 */

export const VIEW_WARNING_CODES = ["high_latitude", "near_cusp", "missing_parts"] as const;
export type ViewWarningCode = (typeof VIEW_WARNING_CODES)[number];

const isCode = (v: unknown): v is ViewWarningCode => typeof v === "string" && (VIEW_WARNING_CODES as readonly string[]).includes(v);

/**
 * ESKİ KAYIT OKUYUCUSU: kod alanı olmayan görünümde uyarı türünü sunucunun Türkçe uyarı metninden çıkarır.
 * Önekler lib/astrology/engine/natalHouses.ts (localNatalViewWarnings) ve lib/astrology/view/techniqueView.ts (eksik parça)
 * metinleridir; o metinler DEĞİŞMEZ (sunucu kanonik metni). Yeni görünümlerde kullanılmaz.
 */
export function legacyViewWarningCodes(warnings: readonly string[]): ViewWarningCode[] {
  const out: ViewWarningCode[] = [];
  // i18n-ignore: eski kayıt okuyucusu — sunucu uyarı metninin kanonik Türkçe öneki (yalnız eşleştirme; gösterilmez)
  if (warnings.some((w) => w.startsWith("Yüksek enlem"))) out.push("high_latitude");
  // i18n-ignore: eski kayıt okuyucusu — sunucu uyarı metninin kanonik Türkçe parçası (yalnız eşleştirme)
  if (warnings.some((w) => w.includes("ev sınırına"))) out.push("near_cusp");
  // i18n-ignore: eski kayıt okuyucusu — "N dönem parçası hesaplanamadı" (techniqueView) kanonik Türkçe parçası
  if (warnings.some((w) => w.includes("parça"))) out.push("missing_parts");
  return out;
}

/** Görünümün uyarı kodları: `warningCodes` varsa o (yeni görünüm), yoksa eski kayıt okuyucusu. */
export function viewWarningCodes(v: { warnings?: readonly string[] | null; warningCodes?: readonly unknown[] | null }): ViewWarningCode[] {
  if (Array.isArray(v.warningCodes)) return v.warningCodes.filter(isCode);
  return legacyViewWarningCodes(v.warnings ?? []);
}

export function hasViewWarning(v: { warnings?: readonly string[] | null; warningCodes?: readonly unknown[] | null }, code: ViewWarningCode): boolean {
  return viewWarningCodes(v).includes(code);
}
