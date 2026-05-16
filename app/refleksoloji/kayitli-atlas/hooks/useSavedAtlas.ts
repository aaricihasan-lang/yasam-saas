"use client";

import { useCallback, useEffect, useState } from "react";
import { loadAtlas } from "@/lib/atlasStorage";
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
