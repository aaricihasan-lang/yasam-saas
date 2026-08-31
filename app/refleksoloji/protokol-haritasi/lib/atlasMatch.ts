import type { AtlasDocument } from "@/lib/atlasStorage";
import { getRegionsForOrgan, listOrganNamesFromAtlas } from "@/lib/atlasStorage";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import type { ProtocolFootView } from "../types";

/**
 * Şekil geçerlilik kuralının TEK kaynağı artık sunucu-güvenli çekirdektir
 * (`lib/refleksoloji/atlasRegionsCore`). Word raporu (Node route) atlasMatch'i
 * import EDEMEZ (atlasStorage → "use client" zinciri), bu yüzden kural oraya
 * taşındı; burada re-export edilir → istemci/harness API'si değişmez, iş kuralı
 * TEK yerde kalır (oval/rect/free_draw/thick_line).
 */
import { isRenderableAtlasRegion } from "@/lib/refleksoloji/atlasRegionsCore";
export { isRenderableAtlasRegion };

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
