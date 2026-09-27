"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardQuarantinedAtlas,
  hydrateAndMergeAtlas,
  importQuarantinedAtlasToAccount,
  loadAtlas,
  loadOrganList,
  quarantinedAtlasOrganCount,
  type AtlasMeta,
} from "@/lib/atlasStorage";
import type { OrganTimeMap } from "@/lib/refleksoloji/atlasMerge";
import { isReflexSyncEligible } from "@/lib/refleksoloji/reflexStore";
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
  // FA-24: kartlarda organ BAZLI son güncelleme (global _meta.updated_at değil).
  const [organUpdatedAt, setOrganUpdatedAt] = useState<OrganTimeMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [quarantineCount, setQuarantineCount] = useState(0);

  const refresh = useCallback(() => {
    try {
      const atlas = loadAtlas();
      setSummaries(buildAllOrganSummaries(atlas));
      // "Atlası Olmayan Organlar": organ listesinde olup atlas belgesinde
      // karşılığı olmayan stale/bölgesiz organlar (ör. eski test kaydı).
      setOrphanOrgans(listOrphanOrganList(atlas, loadOrganList()));
      setUpdatedAt(atlas._meta?.updated_at ?? null);
      setOrganUpdatedAt({ ...((atlas._meta as AtlasMeta | undefined)?.organUpdatedAt ?? {}) });
    } catch {
      setSummaries([]);
      setOrphanOrgans([]);
      setUpdatedAt(null);
      setOrganUpdatedAt({});
    }
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);

    // P1-1: sunucudan atlas hydrate (TEK merkez, tombstone-farkında) → salt-okuma
    // görünüm de cihazlar arası güncel. FA-13: açılışta otomatik PUT YOK.
    let cancelled = false;
    void hydrateAndMergeAtlas().then((r) => {
      if (cancelled) return;
      if (r) {
        setQuarantineCount(r.quarantineCount);
        refresh();
      } else if (isReflexSyncEligible()) {
        setQuarantineCount(quarantinedAtlasOrganCount());
      }
    });
    return () => {
      cancelled = true;
    };
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

  // DL-007: sahibi belirsiz eski cihaz atlası — yalnız açık kullanıcı kararıyla.
  const importQuarantine = useCallback(() => {
    const r = importQuarantinedAtlasToAccount();
    if (r.ok) {
      setQuarantineCount(0);
      refresh();
    }
    return r;
  }, [refresh]);

  const discardQuarantine = useCallback(() => {
    discardQuarantinedAtlas();
    setQuarantineCount(0);
  }, []);

  return {
    summaries,
    orphanOrgans,
    updatedAt,
    organUpdatedAt,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
    hydrated,
    refresh,
    deleteOrgan,
    deleteOrphanOrgan,
    deleteRegion,
    renameOrgan,
  };
}
