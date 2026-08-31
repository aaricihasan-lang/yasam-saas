"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  mergeAtlasDocuments,
  saveAtlas,
  saveOrganList,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import { mergeOrganListsWithTombstones } from "@/lib/refleksoloji/atlasMerge";
import {
  hydrateAtlasFromServer,
  scheduleAtlasSync,
  setAtlasSyncSuspended,
} from "@/lib/refleksolojiAtlasSync";
import {
  deleteOrganFromStorage,
  deleteOrphanOrganFromStorage,
  deleteRegionFromStorage,
  listOrphanOrganList,
  renameOrganInStorage,
} from "../lib/atlasManage";
import { cascadeOrganRename } from "../lib/organProtocolReconcile";
import { buildAllOrganSummaries, type OrganSummary } from "../lib/organSummary";
import { useToast } from "@/components/ui/ToastProvider";

export function useSavedAtlas() {
  const { showToast } = useToast();
  const [summaries, setSummaries] = useState<OrganSummary[]>([]);
  const [orphanOrgans, setOrphanOrgans] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    try {
      const atlas = loadAtlas();
      setSummaries(buildAllOrganSummaries(atlas));
      // "Atlası Olmayan Organlar": organ listesinde olup atlas belgesinde
      // karşılığı olmayan stale/bölgesiz organlar (ör. eski test kaydı).
      setOrphanOrgans(listOrphanOrganList(atlas, loadOrganList()));
      setUpdatedAt(atlas._meta?.updated_at ?? null);
    } catch {
      setSummaries([]);
      setOrphanOrgans([]);
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
        // Zombie fix: tombstone-farkında + kanonik organ listesi birleştirme
        // (silinen/temizlenen organ bayat kopyadan dirilmez).
        const mergedOrgans = mergeOrganListsWithTombstones(
          server.organ_list,
          loadOrganList(),
          mergedDoc._meta,
        );
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

  // Ghost/orphan organ silme: mezar taşı yazar → hydrate'te dirilmez.
  const deleteOrphanOrgan = useCallback(
    (organ: string) => {
      const ok = deleteOrphanOrganFromStorage(organ);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  const renameOrgan = useCallback(
    (oldName: string, newName: string) => {
      const result = renameOrganInStorage(oldName, newName);
      if (result.ok) {
        refresh();
        // BUG-3: bağlı protokolleri de uzlaştır (server + yerel) → rename orphan yok.
        // Arka planda; atlas rename UX'ini bloklamaz. Hata olursa uyarı gösterilir.
        const trimmed = newName.trim();
        if (trimmed && trimmed.toLocaleLowerCase("tr") !== oldName.toLocaleLowerCase("tr")) {
          void cascadeOrganRename(oldName, trimmed).then((r) => {
            if (!r.ok) {
              showToast({
                type: "warning",
                title: "Protokol güncellemesi",
                message: r.error ?? "Bağlı protokoller güncellenemedi. Tekrar deneyin.",
              });
            } else if (r.updated > 0) {
              showToast({
                type: "success",
                title: "Protokoller güncellendi",
                message: `${r.updated} protokolde organ adı güncellendi.`,
              });
            }
          });
        }
      }
      return result;
    },
    [refresh, showToast],
  );

  return {
    summaries,
    orphanOrgans,
    updatedAt,
    hydrated,
    refresh,
    deleteOrgan,
    deleteOrphanOrgan,
    deleteRegion,
    renameOrgan,
  };
}
