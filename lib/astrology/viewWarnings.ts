/**
 * Atlas görünüm uyarıları — DİL-BAĞIMSIZ kodlar (I18N-0008 / Atl-A0). SAF; istemci güvenli.
 *
 * Sunucu uyarı METNİ (TechniqueView.warnings) aynen kalır (Türkçe; arşiv snapshot'larında donmuş). Ekrandaki rozet /
 * uyarı kararları artık bu kodlardan verilir: metin çevrilse bile rozet sessizce kaybolmaz.
 *
 * Kodlar SUNUCU YANITINA / KAYDA YAZILMAZ (API sözleşmesi ve pro-natal-houses-api A0 bayt kilidi değişmez): istemci görünüm
 * katmanında, görünümün zaten taşıdığı alanlardan (technique, technical, timeUnknownMasked, missingParts) `deriveViewWarningCodes`
 * ile türetilir — sunucunun uyarı METNİNİ ürettiği koşulların birebir aynısı (lib/astrology/engine/natalHouses.ts
 * localNatalViewWarnings / localNatalViewWarningCodes; techniqueView eksik parça metni).
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

type LocalHouseSourceLike = { kind?: unknown; warnings?: unknown; nearCusp?: unknown };

/**
 * Natal klasik (yerel) ev sistemi uyarı kodları — localNatalViewWarningCodes (natalHouses.ts) ile AYNI koşullar; yalnız yapısal
 * okuma (hesap motoru import edilmez; istemci güvenli). Saat bilinmiyor maskesinde kod yok (metin de yok).
 */
export function localNatalWarningCodesOf(technical: unknown, masked: boolean): ViewWarningCode[] {
  if (masked || !technical || typeof technical !== "object") return [];
  const hs = (technical as { houseSource?: LocalHouseSourceLike }).houseSource;
  if (!hs || hs.kind !== "local") return [];
  const out: ViewWarningCode[] = [];
  if (Array.isArray(hs.warnings) && hs.warnings.includes("high_latitude")) out.push("high_latitude");
  if (Array.isArray(hs.nearCusp) && hs.nearCusp.length > 0) out.push("near_cusp");
  return out;
}

/**
 * Görünümün uyarı kodlarını istemcide türetir (sunucu yanıtında alan YOK). Sıra ve içerik, sunucunun uyarı metinlerini
 * ürettiği koşullarla birebir: önce Natal klasik ev uyarıları, sonra eksik parça.
 */
export function deriveViewWarningCodes(v: {
  technique: string;
  technical?: unknown;
  timeUnknownMasked?: boolean | null;
  missingParts?: number | null;
}): ViewWarningCode[] {
  return [...(v.technique === "western.natal" ? localNatalWarningCodesOf(v.technical, !!v.timeUnknownMasked) : []), ...(v.missingParts ? (["missing_parts"] as const) : [])];
}

/** Ekran kararı için: görünümün uyarı metni + istemcide türetilen kodlar (hasViewWarning / viewWarningCodes girdisi). */
export function viewWithWarningCodes<T extends { technique: string; warnings?: readonly string[] | null; technical?: unknown; timeUnknownMasked?: boolean | null; missingParts?: number | null }>(
  v: T,
): { warnings: readonly string[]; warningCodes: ViewWarningCode[] } {
  return { warnings: v.warnings ?? [], warningCodes: deriveViewWarningCodes(v) };
}
