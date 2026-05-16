import type { AtlasDocument, AtlasOrganEntry } from "@/lib/atlasStorage";
import {
  getRegionsForOrgan,
  listOrganNamesFromAtlas,
  storageKeyToFoot,
} from "@/lib/atlasStorage";
import type { FootSide, FootView, Region } from "@/app/refleksoloji/bolge-haritasi/types";

export type OrganSummary = {
  name: string;
  regionCount: number;
  hasTaban: boolean;
  hasYan: boolean;
  hasLeft: boolean;
  hasRight: boolean;
  footLabel: string;
  viewLabel: string;
};

function isOrganEntry(value: unknown): value is AtlasOrganEntry {
  return typeof value === "object" && value !== null && "taban" in value && "yan" in value;
}

function bucketHasRegions(entry: AtlasOrganEntry, view: FootView, foot: "sol" | "sag"): boolean {
  return (entry[view][foot]?.length ?? 0) > 0;
}

export function buildFootLabel(hasLeft: boolean, hasRight: boolean): string {
  if (hasLeft && hasRight) return "Her iki ayak";
  if (hasLeft) return "Sol ayak";
  if (hasRight) return "Sağ ayak";
  return "—";
}

export function buildViewLabel(hasTaban: boolean, hasYan: boolean): string {
  if (hasTaban && hasYan) return "Taban · Yan";
  if (hasTaban) return "Taban";
  if (hasYan) return "Yan";
  return "—";
}

export function buildOrganSummary(atlas: AtlasDocument, organName: string): OrganSummary {
  const entry = atlas[organName];
  const regions = getRegionsForOrgan(atlas, organName);

  let hasTaban = false;
  let hasYan = false;
  if (isOrganEntry(entry)) {
    hasTaban =
      bucketHasRegions(entry, "taban", "sol") || bucketHasRegions(entry, "taban", "sag");
    hasYan = bucketHasRegions(entry, "yan", "sol") || bucketHasRegions(entry, "yan", "sag");
  }

  const hasLeft = regions.some((r) => r.footSide === "left");
  const hasRight = regions.some((r) => r.footSide === "right");

  return {
    name: organName,
    regionCount: regions.length,
    hasTaban,
    hasYan,
    hasLeft,
    hasRight,
    footLabel: buildFootLabel(hasLeft, hasRight),
    viewLabel: buildViewLabel(hasTaban, hasYan),
  };
}

export function buildAllOrganSummaries(atlas: AtlasDocument): OrganSummary[] {
  return listOrganNamesFromAtlas(atlas).map((name) => buildOrganSummary(atlas, name));
}

export function footSideLabel(side: FootSide): string {
  return side === "left" ? "Sol ayak" : "Sağ ayak";
}

export function viewLabel(view: FootView): string {
  return view === "taban" ? "Taban" : "Yan";
}

export function shapeLabel(shape: Region["shape"]): string {
  switch (shape) {
    case "oval":
      return "Oval";
    case "rect":
      return "Kare";
    case "free_draw":
      return "Manuel";
    case "thick_line":
      return "Çizgi";
    default:
      return shape;
  }
}

export function regionCoordSummary(region: Region): string {
  if (region.shape === "thick_line") {
    return `x1:${fmt(region.x1)} y1:${fmt(region.y1)} → x2:${fmt(region.x2)} y2:${fmt(region.y2)}`;
  }
  if (region.shape === "free_draw" && region.points?.length) {
    return `${region.points.length} nokta · ilk (${fmt(region.points[0]?.x)}, ${fmt(region.points[0]?.y)})`;
  }
  if (region.cx != null && region.cy != null) {
    return `merkez (${fmt(region.cx)}, ${fmt(region.cy)}) · rx:${fmt(region.rx)} ry:${fmt(region.ry)}`;
  }
  return "Koordinat özeti yok";
}

function fmt(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

export function storageFootLabel(footKey: "sol" | "sag"): string {
  return footSideLabel(storageKeyToFoot(footKey));
}
