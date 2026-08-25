import type { AtlasDocument } from "@/lib/atlasStorage";
import { getRegionsForOrgan, listOrganNamesFromAtlas } from "@/lib/atlasStorage";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import type { ProtocolFootView } from "../types";

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

export function organHasAtlasRegions(
  atlas: AtlasDocument,
  name: string,
  view?: ProtocolFootView,
): boolean {
  const key = resolveOrganNameInAtlas(atlas, name);
  if (!key) return false;
  const regions = getRegionsForOrgan(atlas, key, view ? { view } : undefined);
  return regions.some((r) => r.shape === "oval" || r.shape === "rect");
}
