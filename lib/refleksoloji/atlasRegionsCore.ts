/**
 * Refleksoloji atlas — SUNUCU-GÜVENLİ (tarayıcısız) çekirdek.
 *
 * Neden ayrı modül: `lib/atlasStorage.ts` ve `protokol-haritasi/lib/atlasMatch.ts`
 * çalışma zamanında `lib/refleksolojiAtlasSync` ("use client") + `window`
 * bağımlılıklarını çeker. Route Handler (Node) bu zinciri import EDEMEZ. Bu modül
 * yalnız SAF (DOM/localStorage bilmeyen) yeniden kullanımları içerir; böylece hem
 * Word raporu (server) hem istemci aynı iş kurallarını paylaşır:
 *
 *   - organ kimliği           → `organKey` (PR #201, TEK kaynak)
 *   - şekil geçerlilik kuralı  → `isRenderableAtlasRegion` (bu dosya = TEK kaynak;
 *                                atlasMatch buradan re-export eder)
 *   - Yan İç / Yan Dış ayrımı  → `isInnerYanOrgan` (atlasBackground, TEK kaynak)
 *   - renk paleti              → `getOrganColor` (protokol-haritasi/types, TEK kaynak)
 *
 * Atlas belgesinin yürüyüşü (taban/yan × sol/sag) yapısal veri gezintisidir; iş
 * kuralı değildir. `AtlasDocument` şekli `lib/atlasStorage`'tan TYPE-ONLY alınır
 * (derlemede silinir → istemci zinciri gelmez).
 */

import type {
  AtlasDocument,
  AtlasOrganEntry,
  StoredRegion,
} from "@/lib/atlasStorage";
import type { FootSide, FootView, Region } from "@/app/refleksoloji/bolge-haritasi/types";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import { isInnerYanOrgan } from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { getOrganColor, type OrganColorStyle } from "@/app/refleksoloji/protokol-haritasi/types";

// ─── Arka plan (görünüm) grupları ─────────────────────────────────────────────
// Bölge Haritası Region.view yalnız "taban" | "yan" taşır; Yan'ın İç/Dış ayrımı
// organ adından (isInnerYanOrgan) TÜRETİLİR. Bu üç grup Word'deki üç bağımsız
// haritayı ve arka plan PNG'sini belirler.
export type AtlasBackgroundGroup = "taban" | "yan_ic" | "yan_dis";

export const ATLAS_GROUP_LABEL: Record<AtlasBackgroundGroup, string> = {
  taban: "Taban",
  yan_ic: "Yan İç",
  yan_dis: "Yan Dış",
};

export const ATLAS_GROUP_ASSET: Record<AtlasBackgroundGroup, string> = {
  taban: "klinik_taban.png",
  yan_ic: "klinik_yan_ic.png",
  yan_dis: "klinik_yan_dis.png",
};

/** Bir bölgenin ait olduğu arka plan grubu (TEK kaynak: view + isInnerYanOrgan). */
export function regionBackgroundGroup(region: {
  view: FootView;
  organ: string;
}): AtlasBackgroundGroup {
  if (region.view === "taban") return "taban";
  return isInnerYanOrgan(region.organ) ? "yan_ic" : "yan_dis";
}

// ─── Şekil geçerlilik kuralı (TEK kaynak; atlasMatch re-export eder) ───────────
/**
 * Geçerli/çizilebilir atlas bölgesi mi? Bölge Haritası'nın TÜM şekilleri
 * (oval, rect, free_draw, thick_line) burada TEK yerde tanımlanır. `oval || rect`
 * eski false-negative filtresi böbrek free_draw regresyonunun kök nedeniydi (PR #203).
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

// ─── Saf belge yürüyüşü (yapısal; iş kuralı değil) ────────────────────────────
function isOrganEntry(value: unknown): value is AtlasOrganEntry {
  return (
    typeof value === "object" && value !== null && "taban" in value && "yan" in value
  );
}

function storageKeyToFoot(key: "sol" | "sag"): FootSide {
  return key === "sol" ? "left" : "right";
}

function storedToRegion(
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

/** Belgedeki gerçek organ adları (anahtarlar). Sıra: Türkçe. */
export function listAtlasOrganNames(atlas: AtlasDocument): string[] {
  return Object.keys(atlas)
    .filter((key) => key !== "_meta" && isOrganEntry(atlas[key]))
    .sort((a, b) => a.localeCompare(b, "tr"));
}

/**
 * Kanonik kimlikle eşleşen GERÇEK atlas anahtarını döndürür (NFC/İ-i/boşluk
 * duyarsız). `getAtlasRegionsForOrgan`'a birebir verilebilir.
 */
export function resolveOrganInAtlas(atlas: AtlasDocument, name: string): string | null {
  const target = organKey(name);
  if (!target) return null;
  return listAtlasOrganNames(atlas).find((n) => organKey(n) === target) ?? null;
}

/** Organ (gerçek atlas anahtarı) için tüm bölgeler; opsiyonel görünüm filtresi. */
export function getAtlasRegionsForOrgan(
  atlas: AtlasDocument,
  organAtlasKey: string,
  filter?: { view?: FootView },
): Region[] {
  const entry = atlas[organAtlasKey];
  if (!isOrganEntry(entry)) return [];

  const views: FootView[] = filter?.view ? [filter.view] : ["taban", "yan"];
  const footKeys: ("sol" | "sag")[] = ["sol", "sag"];
  const result: Region[] = [];

  for (const view of views) {
    for (const footKey of footKeys) {
      const storedList = entry[view][footKey] ?? [];
      for (const stored of storedList) {
        result.push(storedToRegion(stored, organAtlasKey, storageKeyToFoot(footKey), view));
      }
    }
  }
  return result;
}

// ─── Protokol → çözülmüş atlas (renk + grup + sayım) ──────────────────────────
export type RenderRegion = Region & {
  fill: string;
  stroke: string;
  group: AtlasBackgroundGroup;
  organLabel: string;
};

export type OrganResolved = {
  /** Ekranda gösterilecek ham etiket (protokolde ilk görülen yazım). */
  label: string;
  atlasKey: string | null;
  color: OrganColorStyle;
  /** Herhangi bir görünümde çizilebilir bölge var mı. */
  found: boolean;
  totalRegions: number;
  byGroup: Record<AtlasBackgroundGroup, number>;
  /** En az bir bölgesi olan gruplar (Word tablo "Görünüm" hücresi). */
  groups: AtlasBackgroundGroup[];
};

export type ResolvedAtlas = {
  organs: OrganResolved[];
  regionsByGroup: Record<AtlasBackgroundGroup, RenderRegion[]>;
  /** Hiçbir görünümde atlas bölgesi olmayan organ etiketleri. */
  missingOrgans: string[];
};

const GROUPS: AtlasBackgroundGroup[] = ["taban", "yan_ic", "yan_dis"];

function emptyGroupMap<T>(make: () => T): Record<AtlasBackgroundGroup, T> {
  return { taban: make(), yan_ic: make(), yan_dis: make() };
}

/**
 * Protokolün organ listesini (sıra korunur) atlas belgesiyle çözer: her organa
 * palet renginden STABİL renk (index bazlı → aynı organ her haritada aynı renk),
 * her çizilebilir bölgeyi taban/yan_ic/yan_dis grubuna dağıtır. Aynı bölge id iki
 * kez sayılmaz. Date/random YOK → deterministik.
 */
export function resolveProtocolAtlas(
  atlas: AtlasDocument,
  organNames: string[],
): ResolvedAtlas {
  const regionsByGroup = emptyGroupMap<RenderRegion[]>(() => []);
  const organs: OrganResolved[] = [];
  const seenRegionIds = new Set<string>();

  organNames.forEach((rawName, index) => {
    const label = rawName.trim();
    if (!label) return;

    const color = getOrganColor(index);
    const atlasKey = resolveOrganInAtlas(atlas, label);
    const byGroup = emptyGroupMap<number>(() => 0);

    let totalRegions = 0;
    if (atlasKey) {
      const all = getAtlasRegionsForOrgan(atlas, atlasKey).filter(isRenderableAtlasRegion);
      for (const region of all) {
        if (seenRegionIds.has(region.id)) continue;
        seenRegionIds.add(region.id);
        // Grup, organ ETİKETİYLE belirlenir (isInnerYanOrgan ham ada bakar); atlas
        // anahtarı yerine protokol etiketi kullanılır ki kimlik/görünüm tutarlı olsun.
        const group = regionBackgroundGroup({ view: region.view, organ: label });
        byGroup[group] += 1;
        totalRegions += 1;
        regionsByGroup[group].push({
          ...region,
          organ: label,
          organLabel: label,
          fill: color.fill,
          stroke: color.stroke,
          group,
        });
      }
    }

    organs.push({
      label,
      atlasKey,
      color,
      found: totalRegions > 0,
      totalRegions,
      byGroup,
      groups: GROUPS.filter((g) => byGroup[g] > 0),
    });
  });

  return {
    organs,
    regionsByGroup,
    missingOrgans: organs.filter((o) => !o.found).map((o) => o.label),
  };
}

export const ALL_ATLAS_GROUPS = GROUPS;
