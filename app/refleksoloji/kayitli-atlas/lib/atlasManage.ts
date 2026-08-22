import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import type { AtlasDocument, AtlasMeta, AtlasOrganEntry } from "@/lib/atlasStorage";
import {
  footToStorageKey,
  getRegionsForOrgan,
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
  return typeof value === "object" && value !== null && "taban" in value && "yan" in value;
}

function regionsToOrganEntry(regions: Region[]): AtlasOrganEntry {
  const entry: AtlasOrganEntry = {
    taban: { sol: [], sag: [] },
    yan: { sol: [], sag: [] },
  };

  for (const region of regions) {
    const footKey = footToStorageKey(region.footSide);
    entry[region.view][footKey].push(regionToStored(region));
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
