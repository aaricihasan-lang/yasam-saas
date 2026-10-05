// HD — hesaplanmış harita için Türkçe GÖRÜNTÜ etiketleri (SAF, uygulama sözlüğü).
//
// Bu dosya sağlayıcı (RoxyAPI) açıklama metni İÇERMEZ ve kopyalamaz. Yalnız tipten
// deterministik olarak bilinen kısa HD anahtar kavramlarının (Strateji / İmza / Benlik-dışı
// tema) Yaşam Sistemi Türkçe etiketleridir. Sağlayıcının ham değeri ayrıca, açıkça
// "sağlayıcı değeri" olarak gösterilir.

import type { HdTypeCode } from "../types";

export const HD_STRATEGY_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Yanıt vermek için beklemek",
  manifesting_generator: "Yanıt vermek için beklemek, sonra bilgilendirmek",
  manifestor: "Harekete geçmeden önce bilgilendirmek",
  projector: "Davet beklemek",
  reflector: "Bir ay döngüsünü (~28 gün) beklemek",
};

export const HD_SIGNATURE_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Tatmin",
  manifesting_generator: "Tatmin",
  manifestor: "Huzur",
  projector: "Başarı",
  reflector: "Hayret",
};

export const HD_NOT_SELF_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Hayal kırıklığı (Frustration)",
  manifesting_generator: "Hayal kırıklığı ve öfke",
  manifestor: "Öfke",
  projector: "Kırgınlık (Bitterness)",
  reflector: "Düş kırıklığı (Disappointment)",
};

const ANGLE_TR: Readonly<Record<string, string>> = {
  rightangle: "Sağ Açı (Right Angle)",
  leftangle: "Sol Açı (Left Angle)",
  juxtaposition: "Yan Yana (Juxtaposition)",
};

export function hdCrossAngleLabel(angle: string | null | undefined): string {
  if (!angle) return "—";
  return ANGLE_TR[angle.toLowerCase().replace(/[\s_\-]+/g, "")] ?? angle;
}
