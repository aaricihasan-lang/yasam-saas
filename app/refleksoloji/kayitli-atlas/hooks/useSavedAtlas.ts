"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  mergeAtlasDocuments,
  saveAtlas,
  saveOrganList,
  unionOrganLists,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import {
  hydrateAtlasFromServer,
  scheduleAtlasSync,
  setAtlasSyncSuspended,
} from "@/lib/refleksolojiAtlasSync";
import {
  deleteOrganFromStorage,
  deleteRegionFromStorage,
  renameOrganInStorage,
} from "../lib/atlasManage";
import { buildAllOrganSummaries, type OrganSummary } from "../lib/organSummary";

export function useSavedAtlas() {
  const [summaries, setSummaries] = useState<OrganSummary[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    try {
      const atlas = loadAtlas();
      setSummaries(buildAllOrganSummaries(atlas));
      setUpdatedAt(atlas._meta?.updated_at ?? null);
    } catch {
      setSummaries([]);
      setUpdatedAt(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);

    // P1-1: sunucudan atlas hydrate → salt-okuma görünüm de cihazlar arası güncel.
    let cancelled = false;
    void hydrateAtlasFromServer().then((server) => {
      if (cancelled || !server) return;
      const serverDoc = server.document;
      // Sunucuda veri var mı: belge organları VEYA organ listesi.
      const hasServerData =
        (!!serverDoc && listOrganNamesFromAtlas(serverDoc as AtlasDocument).length > 0) ||
        server.organ_list.length > 0;
      if (hasServerData) {
        // Birleştir (sunucu ∪ yerel; yerel-özel organ korunur) → veri kaybı yok.
        const localDoc = loadAtlas();
        const mergedDoc = mergeAtlasDocuments(serverDoc as AtlasDocument, localDoc);
        const mergedOrgans = unionOrganLists(server.organ_list, loadOrganList());
        setAtlasSyncSuspended(true);
        saveAtlas(mergedDoc);
        saveOrganList(mergedOrgans);
        setAtlasSyncSuspended(false);
        if (listOrganNamesFromAtlas(mergedDoc).length > listOrganNamesFromAtlas(serverDoc as AtlasDocument).length) {
          scheduleAtlasSync(mergedDoc, mergedOrgans);
        }
        refresh();
      } else {
        const localDoc = loadAtlas();
        if (listOrganNamesFromAtlas(localDoc).length > 0 || loadOrganList().length > 0) {
          scheduleAtlasSync(localDoc, loadOrganList());
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const deleteOrgan = useCallback(
    (organ: string) => {
      const ok = deleteOrganFromStorage(organ);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  const deleteRegion = useCallback(
    (organ: string, regionId: string) => {
      const ok = deleteRegionFromStorage(organ, regionId);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  const renameOrgan = useCallback(
    (oldName: string, newName: string) => {
      const result = renameOrganInStorage(oldName, newName);
      if (result.ok) refresh();
      return result;
    },
    [refresh],
  );

  return {
    summaries,
    updatedAt,
    hydrated,
    refresh,
    deleteOrgan,
    deleteRegion,
    renameOrgan,
  };
}
