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
import { isRenderableAtlasRegion, resolveOrganNameInAtlas } from "./atlasMatch";
import {
  resolveProtocolAtlas,
  ALL_ATLAS_GROUPS,
  type AtlasBackgroundGroup,
  type ResolvedAtlas,
} from "@/lib/refleksoloji/atlasRegionsCore";

const ALL_VIEWS: ProtocolFootView[] = ["taban", "yan"];

/**
 * PROTOKOL UI (Protokol Haritası + Kayıtlı Protokol Detay) için TEK giriş.
 *
 * Anatomik doğruluk: "yan" tek görünüm DEĞİL — Yan İç (mesane/rahim/prostat) ve
 * Yan Dış AYRI arka planlardır. Gruplama TEK kaynaktan (`resolveProtocolAtlas`
 * → `regionBackgroundGroup` = view + isInnerYanOrgan) gelir; Word raporuyla aynı
 * çekirdek. Bir grubun bölgesi asla başka grubun arka planına sızmaz.
 *
 * `availableViews`: en az bir bölgesi olan gruplar (taban/yan_ic/yan_dis sırası).
 * UI yalnız anlamlı görünüm düğmelerini gösterir ve boş sekme açmaz.
 */
export function resolveProtocolViews(organNames: string[]): {
  resolved: ResolvedAtlas;
  availableViews: AtlasBackgroundGroup[];
} {
  const resolved = resolveProtocolAtlas(loadAtlas(), organNames);
  const availableViews = ALL_ATLAS_GROUPS.filter((group) =>
    resolved.organs.some((organ) => organ.byGroup[group] > 0),
  );
  return { resolved, availableViews };
}

export function atlasRegionToDisplay(region: Region): ProtocolDisplayRegion | null {
  if (!isRenderableAtlasRegion(region)) return null;

  const base = {
    id: region.id,
    organ: region.organ,
    footSide: region.footSide,
    view: region.view,
  };

  if (region.shape === "oval" || region.shape === "rect") {
    return {
      ...base,
      shape: region.shape,
      cx: region.cx,
      cy: region.cy,
      rx: region.rx,
      ry: region.ry,
      angle: region.angle,
    };
  }

  if (region.shape === "free_draw") {
    return { ...base, shape: "free_draw", points: region.points };
  }

  // thick_line
  return {
    ...base,
    shape: "thick_line",
    x1: region.x1,
    y1: region.y1,
    x2: region.x2,
    y2: region.y2,
    lineWidth: region.lineWidth,
  };
}

/** Organ için TÜM görünümlerdeki geçerli bölgeleri döndürür (global bakış). */
function allRenderableRegions(atlas: ReturnType<typeof loadAtlas>, lookupKey: string): Region[] {
  return getRegionsForOrgan(atlas, lookupKey).filter(isRenderableAtlasRegion);
}

export function computeOrganStatus(
  atlas: ReturnType<typeof loadAtlas>,
  name: string,
  index: number,
  footView: ProtocolFootView | undefined,
): OrganAtlasStatus {
  const color = getOrganColor(index);
  const atlasKey = resolveOrganNameInAtlas(atlas, name);
  const all = atlasKey ? allRenderableRegions(atlas, atlasKey) : [];
  const availableViews = ALL_VIEWS.filter((v) => all.some((r) => r.view === v));
  const currentViewRegionCount = footView
    ? all.filter((r) => r.view === footView).length
    : all.length;
  return {
    name,
    atlasKey,
    found: all.length > 0, // GLOBAL: herhangi bir görünümde bölge varsa atlas VAR
    regionCount: all.length, // TÜM görünümlerin toplamı
    currentViewRegionCount,
    availableViews,
    color,
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

    const status = computeOrganStatus(atlas, name, index, footView);
    statuses.push(status);

    // Haritaya yalnız AKTİF görünümdeki bölgeler çizilir (tüm geçerli şekiller).
    const lookupKey = status.atlasKey ?? name;
    const fromAtlas = getRegionsForOrgan(atlas, lookupKey, { view: footView })
      .map(atlasRegionToDisplay)
      .filter((r): r is ProtocolDisplayRegion => r != null);

    for (const region of fromAtlas) {
      if (seen.has(region.id)) continue;
      seen.add(region.id);
      regions.push({ ...region, organ: name, ...status.color });
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
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((name, index) => computeOrganStatus(atlas, name, index, footView));
}

/** Gerçekten HİÇBİR görünümde atlası olmayan organlar (view-scoped değil). */
export function missingAtlasOrgans(statuses: OrganAtlasStatus[]): string[] {
  return statuses.filter((s) => !s.found).map((s) => s.name);
}

export function withOrganColor(region: ProtocolDisplayRegion, color: OrganColorStyle): ColoredDisplayRegion {
  return { ...region, ...color };
}
