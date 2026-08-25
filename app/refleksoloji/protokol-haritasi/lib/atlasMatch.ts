import type { AtlasDocument } from "@/lib/atlasStorage";
import { getRegionsForOrgan, listOrganNamesFromAtlas } from "@/lib/atlasStorage";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import type { ProtocolFootView } from "../types";

/**
 * Geçerli/çizilebilir atlas bölgesi mi? Bölge Haritası'nın TÜM şekilleri
 * (oval, rect, free_draw, thick_line) burada TEK yerde tanımlanır — protokol
 * okuma/sayım/render zinciri bu kontratı paylaşır. `oval || rect` şeklindeki
 * eski false-negative filtreler bununla değiştirildi (böbrek free_draw
 * regresyonunun kök nedeni).
 */
export function isRenderableAtlasRegion(region: Region): boolean {
  switch (region.shape) {
    case "oval":
    case "rect":
      return (
        region.cx != null && region.cy != null && region.rx != null && region.ry != null
      );
    case "free_draw":
      return Array.isArray(region.points) && region.points.length >= 1;
    case "thick_line":
      return (
        typeof region.x1 === "number" &&
        Number.isFinite(region.x1) &&
        typeof region.y1 === "number" &&
        Number.isFinite(region.y1) &&
        typeof region.x2 === "number" &&
        Number.isFinite(region.x2) &&
        typeof region.y2 === "number" &&
        Number.isFinite(region.y2)
      );
    default:
      return false;
  }
}

/**
 * Kanonik organ kimliğiyle eşleşme (büyük/küçük harf + Türkçe İ/i + Unicode
 * NFC/NFD + boşluk duyarsız). Eşleşen GERÇEK atlas anahtarını döndürür; bu
 * anahtar `getRegionsForOrgan`'a birebir verilebilir.
 */
export function resolveOrganNameInAtlas(atlas: AtlasDocument, name: string): string | null {
  const target = organKey(name);
  if (!target) return null;
  const names = listOrganNamesFromAtlas(atlas);
  return names.find((n) => organKey(n) === target) ?? null;
}

/**
 * Organın (opsiyonel görünümde) geçerli atlas bölgesi var mı? `view`
 * verilmezse TÜM görünümler (global) değerlendirilir.
 */
export function organHasAtlasRegions(
  atlas: AtlasDocument,
  name: string,
  view?: ProtocolFootView,
): boolean {
  const key = resolveOrganNameInAtlas(atlas, name);
  if (!key) return false;
  const regions = getRegionsForOrgan(atlas, key, view ? { view } : undefined);
  return regions.some(isRenderableAtlasRegion);
}
