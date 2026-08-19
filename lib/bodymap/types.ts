/**
 * GENERIC BODY-MAP MOTORU — alan-bağımsız tipler.
 *
 * Refleksoloji `Region` modelinden (organ/footSide/view'e bağlı) TÜRETİLMİŞ ama
 * hiçbir alan-özel kavram taşımayan generic çekirdek. Yeni modüller (Kupa & Hacamat)
 * bu motoru kullanır; refleksoloji dosyaları YERİNDE değiştirilmez (kopya-yaklaşımı).
 *
 * Koordinatlar normalize 0..1 (görsel/silhouette contain-rect'ine göre). `angle` derece.
 *
 * point ≠ placement: `BodyMark` bir NOKTANIN belirli bir haritadaki YERLEŞİMİDİR.
 * Noktanın kendi bilgisi (ad, kod, açıklama…) ayrı katmanda (DB `cupping_points`) tutulur;
 * `meta` yalnız hangi kayda ait olduğunu taşır (pointId/placementId gibi opak veri).
 */

export type MarkShape = "oval" | "rect";

export type MarkToolMode = "select" | "add" | "move";

export type NormalizedPoint = { x: number; y: number };

/** Bir haritadaki tek işaret (placement) — normalize kutu geometrisi. */
export type BodyMark = {
  id: string;
  /** Görünen etiket (nokta adı/kodu) — motor bunu yalnız gösterir, yorumlamaz. */
  label: string;
  /** Bu yerleşimin ait olduğu harita anahtarı (ör. "back_body"). */
  mapKey: string;
  shape: MarkShape;
  /** Merkez X (0..1) */
  cx: number;
  /** Merkez Y (0..1) */
  cy: number;
  /** Yarı-genişlik (0..0.5) */
  rx: number;
  /** Yarı-yükseklik (0..0.5) */
  ry: number;
  /** Dönüş açısı (derece) */
  angle?: number;
  /** Opsiyonel özel renk (yoksa çağıranın verdiği varsayılan). */
  color?: string;
  /** Çağırana ait opak yük (pointId/placementId vb.) — motor okumaz/yorumlamaz. */
  meta?: Record<string, unknown>;
};

/** Yeni işaret oluşturulurken motorun ürettiği geometri (id/label/mapKey çağıran tarafından atanır). */
export type MarkGeometry = Pick<BodyMark, "shape" | "cx" | "cy" | "rx" | "ry" | "angle">;
