import { getRegionsForOrgan, loadAtlas } from "@/lib/atlasStorage";
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import type {
  ColoredDisplayRegion,
  OrganAtlasStatus,
  OrganColorStyle,
  ProtocolDisplayRegion,
  ProtocolFootView,
} from "../types";
import { getOrganColor } from "../types";
import { organHasAtlasRegions, resolveOrganNameInAtlas } from "./atlasMatch";

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

export function resolveColoredRegionsForOrgans(
  organNames: string[],
  footView: ProtocolFootView,
): { regions: ColoredDisplayRegion[]; statuses: OrganAtlasStatus[] } {
  const atlas = loadAtlas();
  const regions: ColoredDisplayRegion[] = [];
  const statuses: OrganAtlasStatus[] = [];
  const seen = new Set<string>();

  organNames.forEach((rawName, index) => {
    const name = rawName.trim();
    if (!name) return;

    const color = getOrganColor(index);
    const atlasKey = resolveOrganNameInAtlas(atlas, name);
    const lookupKey = atlasKey ?? name;
    const fromAtlas = getRegionsForOrgan(atlas, lookupKey, { view: footView })
      .map(atlasRegionToDisplay)
      .filter((r): r is ProtocolDisplayRegion => r != null);

    statuses.push({
      name,
      atlasKey,
      found: fromAtlas.length > 0,
      regionCount: fromAtlas.length,
      color,
    });

    for (const region of fromAtlas) {
      if (seen.has(region.id)) continue;
      seen.add(region.id);
      regions.push({ ...region, organ: name, ...color });
    }
  });

  return { regions, statuses };
}

export function buildOrganStatuses(
  organNames: string[],
  footView?: ProtocolFootView,
): OrganAtlasStatus[] {
  const atlas = loadAtlas();
  return organNames
    .map((raw, index) => raw.trim())
    .filter(Boolean)
    .map((name, index) => {
      const color = getOrganColor(index);
      const atlasKey = resolveOrganNameInAtlas(atlas, name);
      const found = organHasAtlasRegions(atlas, name, footView);
      const regionCount = atlasKey
        ? getRegionsForOrgan(atlas, atlasKey, footView ? { view: footView } : undefined).filter(
            (r) => r.shape === "oval" || r.shape === "rect",
          ).length
        : 0;
      return { name, atlasKey, found, regionCount, color };
    });
}

export function missingAtlasOrgans(statuses: OrganAtlasStatus[]): string[] {
  return statuses.filter((s) => !s.found).map((s) => s.name);
}

export function withOrganColor(region: ProtocolDisplayRegion, color: OrganColorStyle): ColoredDisplayRegion {
  return { ...region, ...color };
}
