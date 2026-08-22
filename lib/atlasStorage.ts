import type { FootSide, FootView, Region, RegionPoint, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import { safeLocalStorageSetItem } from "@/lib/safeStorage";
import { scheduleAtlasSync } from "@/lib/refleksolojiAtlasSync";
import {
  markOrganDeleted,
  markOrganUpserted,
  mergeAtlasWithTombstones,
  type AtlasDocLike,
  type OrganTimeMap,
} from "@/lib/refleksoloji/atlasMerge";

export const ATLAS_STORAGE_KEY = "yasam-refleksoloji-atlas-v1";
export const ORGAN_LIST_STORAGE_KEY = "yasam-refleksoloji-organs-v1";

export type AtlasMeta = {
  updated_at: string;
  version: string;
  // Çok-cihazlı zombie/duplicate koruması — mezar taşları + organ son-güncelleme.
  // Belgeyle birlikte jsonb olarak senkron olur (şema değişikliği yok).
  tombstones?: OrganTimeMap;
  organUpdatedAt?: OrganTimeMap;
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
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
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
    x1: region.x1,
    y1: region.y1,
    x2: region.x2,
    y2: region.y2,
    lineWidth: region.lineWidth,
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
    x1: stored.x1,
    y1: stored.y1,
    x2: stored.x2,
    y2: stored.y2,
    lineWidth: stored.lineWidth,
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

/**
 * P1-1: hydrate birleştirme — sunucu ve yerel atlas belgelerini organ bazında
 * birleştirir. Ortak organda sunucu kazanır; yalnız yerelde olan organlar KORUNUR
 * (hydrate'te yerel-özel organ kaybolmaz → veri kaybı yok).
 */
export function mergeAtlasDocuments(
  server: AtlasDocument,
  local: AtlasDocument,
): AtlasDocument {
  // Tombstone-farkında birleştirme: ortak organda sunucu kazanır; yalnız yerelde
  // olan organ korunur AMA silinme/yeniden-adlandırma mezar taşı son güncellemeden
  // yeniyse organ DİRİLMEZ (zombie/duplicate engellenir). Mezar taşları _meta'da.
  return mergeAtlasWithTombstones(
    server as unknown as AtlasDocLike,
    local as unknown as AtlasDocLike,
  ) as unknown as AtlasDocument;
}

/** İki organ listesini birleştirir (Türkçe-duyarsız, tekilleştirilmiş). */
export function unionOrganLists(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...a, ...b]) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((x, y) => x.localeCompare(y, "tr"));
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

export function saveOrganList(organs: string[]): boolean {
  if (typeof window === "undefined") return false;
  const ok = safeLocalStorageSetItem(ORGAN_LIST_STORAGE_KEY, JSON.stringify(organs));
  // P1-1: organ listesi değişince tam atlas belgesini sunucuya senkronla.
  if (ok) scheduleAtlasSync(loadAtlas(), organs);
  return ok;
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

export function saveAtlas(atlas: AtlasDocument): boolean {
  if (typeof window === "undefined") return false;
  const prevMeta = (atlas._meta ?? {}) as AtlasMeta;
  const next: AtlasDocument = {
    ...atlas,
    _meta: {
      version: "1",
      updated_at: new Date().toISOString(),
      // Mezar taşlarını/organ zaman damgalarını KORU (senkron için kritik).
      tombstones: prevMeta.tombstones ?? {},
      organUpdatedAt: prevMeta.organUpdatedAt ?? {},
    },
  };
  const ok = safeLocalStorageSetItem(ATLAS_STORAGE_KEY, JSON.stringify(next));
  // P1-1: atlas değişince tam belgeyi + organ listesini sunucuya senkronla.
  if (ok) scheduleAtlasSync(next, loadOrganList());
  return ok;
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

  // Etkilenen organları tespit et: draft'ı olan VEYA silinen bir bölgeye sahip.
  // Yalnız bunların son-güncelleme damgası tazelenir (değişmemiş organ bayat sanılmasın).
  const regionOwner = new Map<string, string>();
  for (const organ of listOrganNamesFromAtlas(atlas)) {
    for (const r of getRegionsForOrgan(atlas, organ)) regionOwner.set(r.id, organ);
  }
  const affected = new Set<string>(draftRegions.map((r) => r.organ));
  for (const id of deleted) {
    const owner = regionOwner.get(id);
    if (owner) affected.add(owner);
  }

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
      if (affected.has(organ)) markOrganUpserted(next as unknown as AtlasDocLike, organ);
    } else if (isOrganEntry(next[organ])) {
      delete next[organ];
      markOrganDeleted(next as unknown as AtlasDocLike, organ);
    }
  }

  // _meta: mezar taşları/damgalar mark* ile güncellendi → koru; updated_at tazele.
  next._meta = {
    ...(next._meta as AtlasMeta),
    version: "1",
    updated_at: new Date().toISOString(),
  };
  return next;
}

export function removeOrganFromAtlas(atlas: AtlasDocument, organ: string): AtlasDocument {
  const next = structuredClone(atlas) as AtlasDocument;
  delete next[organ];
  // Mezar taşı bırak → başka cihazın bayat kopyası dirilmesin (zombie fix).
  markOrganDeleted(next as unknown as AtlasDocLike, organ);
  next._meta = {
    ...(next._meta as AtlasMeta),
    version: "1",
    updated_at: new Date().toISOString(),
  };
  return next;
}

export function atlasHasRegionId(atlas: AtlasDocument, regionId: string): boolean {
  for (const organ of listOrganNamesFromAtlas(atlas)) {
    if (getRegionsForOrgan(atlas, organ).some((r) => r.id === regionId)) return true;
  }
  return false;
}
