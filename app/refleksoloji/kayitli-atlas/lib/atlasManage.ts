import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import type { AtlasDocument, AtlasMeta, AtlasOrganEntry } from "@/lib/atlasStorage";
import {
  footToStorageKey,
  getRegionsForOrgan,
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  removeOrganFromAtlas,
  regionToStored,
  saveAtlas,
  saveOrganList,
} from "@/lib/atlasStorage";
import {
  markOrganDeleted,
  markOrganUpserted,
  type AtlasDocLike,
} from "@/lib/refleksoloji/atlasMerge";

function isOrganEntry(value: unknown): value is AtlasOrganEntry {
  if (typeof value !== "object" || value === null) return false;
  return "taban" in value && ("yan_ic" in value || "yan_dis" in value || "yan" in value);
}

function regionsToOrganEntry(regions: Region[]): AtlasOrganEntry {
  const entry: AtlasOrganEntry = {
    taban: { sol: [], sag: [] },
    yan_ic: { sol: [], sag: [] },
    yan_dis: { sol: [], sag: [] },
  };

  for (const region of regions) {
    const footKey = footToStorageKey(region.footSide);
    // region.view canonical (taban/yan_ic/yan_dis) → doğrudan bucket. "yan" YAZILMAZ.
    const bucket = entry[region.view];
    if (!bucket) continue;
    bucket[footKey].push(regionToStored(region));
  }

  return entry;
}

// _meta'yı tazeler AMA mezar taşlarını/organ zaman damgalarını KORUR (senkron).
function touchMeta(atlas: AtlasDocument): AtlasDocument {
  return {
    ...atlas,
    _meta: {
      ...(atlas._meta as AtlasMeta),
      version: "1",
      updated_at: new Date().toISOString(),
    },
  };
}

export function deleteRegionFromStorage(organ: string, regionId: string): boolean {
  try {
    const atlas = loadAtlas();
    const remaining = getRegionsForOrgan(atlas, organ).filter((r) => r.id !== regionId);
    const next = structuredClone(atlas) as AtlasDocument;

    if (remaining.length === 0) {
      // Organın son bölgesi de silindi → organ mezar taşı (zombie fix).
      delete next[organ];
      markOrganDeleted(next as unknown as AtlasDocLike, organ);
    } else {
      next[organ] = regionsToOrganEntry(remaining);
      markOrganUpserted(next as unknown as AtlasDocLike, organ);
    }

    saveAtlas(touchMeta(next));
    return true;
  } catch {
    return false;
  }
}

export function renameOrganInStorage(oldName: string, newName: string): { ok: boolean; error?: string } {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: "Organ adı boş olamaz." };
  if (trimmed.localeCompare(oldName, "tr", { sensitivity: "accent" }) === 0) {
    return { ok: true };
  }

  try {
    const atlas = loadAtlas();
    const entry = atlas[oldName];
    if (!isOrganEntry(entry)) return { ok: false, error: "Organ bulunamadı." };

    const exists = Object.keys(atlas).some(
      (key) =>
        key !== "_meta" &&
        key !== oldName &&
        key.localeCompare(trimmed, "tr", { sensitivity: "accent" }) === 0,
    );
    if (exists) return { ok: false, error: "Bu isimde bir organ zaten var." };

    const next = structuredClone(atlas) as AtlasDocument;
    next[trimmed] = entry;
    delete next[oldName];
    // Eski ada mezar taşı, yeni adı damgala → başka cihazda eski ad dirilmesin,
    // duplicate oluşmasın (zombie/rename fix).
    markOrganDeleted(next as unknown as AtlasDocLike, oldName);
    markOrganUpserted(next as unknown as AtlasDocLike, trimmed);
    saveAtlas(touchMeta(next));

    const list = loadOrganList();
    const seen = new Set<string>();
    const updated: string[] = [];
    for (const name of list) {
      const value = name === oldName ? trimmed : name;
      const key = value.toLocaleLowerCase("tr");
      if (seen.has(key)) continue;
      seen.add(key);
      updated.push(value);
    }
    if (!seen.has(trimmed.toLocaleLowerCase("tr"))) updated.push(trimmed);
    updated.sort((a, b) => a.localeCompare(b, "tr"));
    saveOrganList(updated);

    return { ok: true };
  } catch {
    return { ok: false, error: "Yeniden adlandırma başarısız." };
  }
}

export function deleteOrganFromStorage(organ: string): boolean {
  try {
    const atlas = loadAtlas();
    const next = removeOrganFromAtlas(atlas, organ);
    saveAtlas(next);

    const list = loadOrganList().filter(
      (name) => name.localeCompare(organ, "tr", { sensitivity: "accent" }) !== 0,
    );
    saveOrganList(list);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Atlası Olmayan Organlar" (ghost/orphan): organ listesinde bulunan ama
 * atlas belgesinde KANONİK karşılığı OLMAYAN organlar. Gerçek atlas-backed
 * organ (böbrek/kalp/karaciğer/mesane) ASLA bu listeye düşmez. Kanonik kimlik
 * (organKey) → NFC/NFD + casing tek organ sayılır. Saf/testable.
 */
export function listOrphanOrganList(atlas: AtlasDocument, organList: string[]): string[] {
  const atlasKeys = new Set(listOrganNamesFromAtlas(atlas).map(organKey));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of organList) {
    const key = organKey(name);
    if (!key || atlasKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out.sort((a, b) => a.localeCompare(b, "tr"));
}

/**
 * Ghost/orphan organı kalıcı siler: mevcut silme yolunu (mezar taşı yazar +
 * organ listesinden çıkarır + sunucu senkronu) yeniden kullanır. Böylece bayat
 * bir cihaz kopyası hydrate olsa bile organ DİRİLMEZ (tombstone-aware union).
 */
export function deleteOrphanOrganFromStorage(organ: string): boolean {
  return deleteOrganFromStorage(organ);
}
