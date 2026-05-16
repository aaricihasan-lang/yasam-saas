import { getRegionsForOrgan, loadAtlas } from "@/lib/atlasStorage";
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import type { ProtocolDisplayRegion, ProtocolOrgan } from "../types";

function atlasRegionToDisplay(region: Region): ProtocolDisplayRegion | null {
  if (region.shape !== "oval" && region.shape !== "rect") return null;
  if (region.cx == null || region.cy == null || region.rx == null || region.ry == null) {
    return null;
  }

  return {
    id: region.id,
    organ: region.organ,
    footSide: region.footSide,
    view: region.view,
    shape: region.shape === "rect" ? "rect" : "oval",
    cx: region.cx,
    cy: region.cy,
    rx: region.rx,
    ry: region.ry,
  };
}

/** Atlas’taki kayıtlı bölgeler varsa onları, yoksa katalog fallback kullan */
export function resolveOrganDisplayRegions(organ: ProtocolOrgan): ProtocolDisplayRegion[] {
  if (typeof window === "undefined") return organ.fallbackRegions;

  const atlas = loadAtlas();
  const fromAtlas = getRegionsForOrgan(atlas, organ.name, { view: organ.footView })
    .map(atlasRegionToDisplay)
    .filter((r): r is ProtocolDisplayRegion => r != null);

  if (fromAtlas.length > 0) return fromAtlas;
  return organ.fallbackRegions;
}

export function resolveProblemDisplayRegions(
  organs: ProtocolOrgan[],
  options?: { organId?: string | null; footView?: "taban" | "yan"; footSide?: "left" | "right" },
): ProtocolDisplayRegion[] {
  const targetOrgans = options?.organId
    ? organs.filter((o) => o.id === options.organId)
    : organs;

  const merged: ProtocolDisplayRegion[] = [];
  const seen = new Set<string>();

  for (const organ of targetOrgans) {
    if (options?.footView && organ.footView !== options.footView) continue;

    for (const region of resolveOrganDisplayRegions(organ)) {
      if (options?.footSide && region.footSide !== options.footSide) continue;
      const key = region.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(region);
    }
  }

  return merged;
}
