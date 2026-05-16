import type { FootSide, FootView, Region, RegionPoint, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";

export const ATLAS_STORAGE_KEY = "yasam-refleksoloji-atlas-v1";
export const ORGAN_LIST_STORAGE_KEY = "yasam-refleksoloji-organs-v1";

export type AtlasMeta = {
  updated_at: string;
  version: string;
};

export type StoredRegion = {
  id: string;
  shape: RegionShapeType;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  points?: RegionPoint[];
  color?: string;
};

export type AtlasFootBucket = {
  sol: StoredRegion[];
  sag: StoredRegion[];
};

export type AtlasOrganEntry = {
  taban: AtlasFootBucket;
  yan: AtlasFootBucket;
};

export type AtlasDocument = {
  _meta: AtlasMeta;
} & Record<string, AtlasOrganEntry | AtlasMeta>;

function emptyFootBucket(): AtlasFootBucket {
  return { sol: [], sag: [] };
}

export function emptyOrganEntry(): AtlasOrganEntry {
  return { taban: emptyFootBucket(), yan: emptyFootBucket() };
}

function createEmptyAtlas(): AtlasDocument {
  return {
    _meta: { version: "1", updated_at: new Date().toISOString() },
  };
}

function isOrganEntry(value: unknown): value is AtlasOrganEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "taban" in value &&
    "yan" in value
  );
}

export function footToStorageKey(foot: FootSide): "sol" | "sag" {
  return foot === "left" ? "sol" : "sag";
}

export function storageKeyToFoot(key: "sol" | "sag"): FootSide {
  return key === "sol" ? "left" : "right";
}

export function regionToStored(region: Region): StoredRegion {
  return {
    id: region.id,
    shape: region.shape,
    cx: region.cx,
    cy: region.cy,
    rx: region.rx,
    ry: region.ry,
    angle: region.angle,
    points: region.points,
    color: region.color,
  };
}

export function storedToRegion(
  stored: StoredRegion,
  organ: string,
  footSide: FootSide,
  view: FootView,
): Region {
  return {
    id: stored.id,
    organ,
    footSide,
    view,
    shape: stored.shape,
    cx: stored.cx,
    cy: stored.cy,
    rx: stored.rx,
    ry: stored.ry,
    angle: stored.angle,
    points: stored.points,
    color: stored.color,
  };
}

function regionsToOrganEntry(regions: Region[]): AtlasOrganEntry {
  const entry = emptyOrganEntry();

  for (const region of regions) {
    const footKey = footToStorageKey(region.footSide);
    entry[region.view][footKey].push(regionToStored(region));
  }

  return entry;
}

export function listOrganNamesFromAtlas(atlas: AtlasDocument): string[] {
  return Object.keys(atlas)
    .filter((key) => key !== "_meta" && isOrganEntry(atlas[key]))
    .sort((a, b) => a.localeCompare(b, "tr"));
}

export function loadOrganList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORGAN_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o): o is string => typeof o === "string" && o.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveOrganList(organs: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORGAN_LIST_STORAGE_KEY, JSON.stringify(organs));
}

export function loadAtlas(): AtlasDocument {
  if (typeof window === "undefined") return createEmptyAtlas();
  try {
    const raw = window.localStorage.getItem(ATLAS_STORAGE_KEY);
    if (!raw) return createEmptyAtlas();
    const parsed = JSON.parse(raw) as AtlasDocument;
    if (!parsed._meta) {
      parsed._meta = { version: "1", updated_at: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return createEmptyAtlas();
  }
}

export function saveAtlas(atlas: AtlasDocument): void {
  if (typeof window === "undefined") return;
  const next: AtlasDocument = {
    ...atlas,
    _meta: {
      version: "1",
      updated_at: new Date().toISOString(),
    },
  };
  window.localStorage.setItem(ATLAS_STORAGE_KEY, JSON.stringify(next));
}

export function getRegionsForOrgan(
  atlas: AtlasDocument,
  organ: string,
  filter?: { foot?: FootSide; view?: FootView },
): Region[] {
  const entry = atlas[organ];
  if (!isOrganEntry(entry)) return [];

  const views: FootView[] = filter?.view ? [filter.view] : ["taban", "yan"];
  const footKeys: ("sol" | "sag")[] = filter?.foot
    ? [footToStorageKey(filter.foot)]
    : ["sol", "sag"];

  const result: Region[] = [];

  for (const view of views) {
    for (const footKey of footKeys) {
      const storedList = entry[view][footKey] ?? [];
      for (const stored of storedList) {
        result.push(storedToRegion(stored, organ, storageKeyToFoot(footKey), view));
      }
    }
  }

  return result;
}

export function getRegionsForOrgans(
  atlas: AtlasDocument,
  organs: string[],
  filter?: { foot?: FootSide; view?: FootView },
): Region[] {
  return organs.flatMap((organ) => getRegionsForOrgan(atlas, organ, filter));
}

export function buildDisplayRegions(
  atlas: AtlasDocument,
  draftRegions: Region[],
  deletedRegionIds: string[],
  selectedOrgans: string[],
  foot: FootSide,
  view: FootView,
): Region[] {
  const deleted = new Set(deletedRegionIds);
  const draftForView = draftRegions.filter(
    (r) =>
      selectedOrgans.includes(r.organ) &&
      r.footSide === foot &&
      r.view === view &&
      !deleted.has(r.id),
  );
  const draftIds = new Set(draftForView.map((r) => r.id));
  const fromAtlas = getRegionsForOrgans(atlas, selectedOrgans, { foot, view }).filter(
    (r) => !deleted.has(r.id) && !draftIds.has(r.id),
  );

  return [...fromAtlas, ...draftForView];
}

export function mergeDraftIntoAtlas(
  atlas: AtlasDocument,
  draftRegions: Region[],
  deletedRegionIds: string[] = [],
): AtlasDocument {
  const next = structuredClone(atlas) as AtlasDocument;
  const deleted = new Set(deletedRegionIds);

  const organNames = new Set<string>([
    ...listOrganNamesFromAtlas(atlas),
    ...draftRegions.map((r) => r.organ),
  ]);

  for (const organ of organNames) {
    const merged = getRegionsForOrgan(atlas, organ).filter((r) => !deleted.has(r.id));

    for (const draft of draftRegions) {
      if (draft.organ !== organ) continue;
      const idx = merged.findIndex((r) => r.id === draft.id);
      if (idx >= 0) merged[idx] = draft;
      else merged.push(draft);
    }

    if (merged.length > 0) {
      next[organ] = regionsToOrganEntry(merged);
    } else if (isOrganEntry(next[organ])) {
      delete next[organ];
    }
  }

  next._meta = { version: "1", updated_at: new Date().toISOString() };
  return next;
}

export function removeOrganFromAtlas(atlas: AtlasDocument, organ: string): AtlasDocument {
  const next = structuredClone(atlas) as AtlasDocument;
  delete next[organ];
  next._meta = { version: "1", updated_at: new Date().toISOString() };
  return next;
}

export function atlasHasRegionId(atlas: AtlasDocument, regionId: string): boolean {
  for (const organ of listOrganNamesFromAtlas(atlas)) {
    if (getRegionsForOrgan(atlas, organ).some((r) => r.id === regionId)) return true;
  }
  return false;
}
