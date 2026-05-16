"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  atlasHasRegionId,
  buildDisplayRegions,
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  mergeDraftIntoAtlas,
  saveAtlas,
  saveOrganList,
} from "@/lib/atlasStorage";
import type { FootSide, FootView, Region } from "../types";
import { isDuplicateOrgan } from "../utils/organUtils";

function mergeOrganLists(atlasOrgans: string[], sessionOrgans: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of [...sessionOrgans, ...atlasOrgans]) {
    const key = name.trim().toLocaleLowerCase("tr");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name.trim());
  }
  return result.sort((a, b) => a.localeCompare(b, "tr"));
}

export function useAtlasWorkspace(initialOrgan?: string | null) {
  const [atlas, setAtlas] = useState(() => loadAtlas());
  const [organs, setOrgans] = useState<string[]>([]);
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);
  const [activeOrgan, setActiveOrgan] = useState<string | null>(null);
  const [draftRegions, setDraftRegions] = useState<Region[]>([]);
  const [deletedRegionIds, setDeletedRegionIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [selectedFoot, setSelectedFoot] = useState<FootSide>("left");
  const [selectedView, setSelectedView] = useState<FootView>("taban");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => {
    const doc = loadAtlas();
    const sessionOrgans = loadOrganList();
    setAtlas(doc);
    setOrgans(mergeOrganLists(listOrganNamesFromAtlas(doc), sessionOrgans));

    if (initialOrgan) {
      setSelectedOrgans([initialOrgan]);
      setActiveOrgan(initialOrgan);
    }

    setHydrated(true);
  }, [initialOrgan]);

  useEffect(() => {
    if (!hydrated) return;
    saveOrganList(organs);
  }, [organs, hydrated]);

  const displayRegions = useMemo(
    () =>
      buildDisplayRegions(
        atlas,
        draftRegions,
        deletedRegionIds,
        selectedOrgans,
        selectedFoot,
        selectedView,
      ),
    [atlas, draftRegions, deletedRegionIds, selectedOrgans, selectedFoot, selectedView],
  );

  const handleToggleOrgan = useCallback((organ: string) => {
    setSelectedOrgans((prev) => {
      const exists = prev.includes(organ);
      if (exists) {
        const next = prev.filter((o) => o !== organ);
        setActiveOrgan((current) => (current === organ ? next[next.length - 1] ?? null : current));
        return next;
      }
      setActiveOrgan(organ);
      return [...prev, organ];
    });
    setSelectedRegionId(null);
  }, []);

  const handleAddOrgan = useCallback(
    (name: string): boolean => {
      const trimmed = name.trim();
      if (!trimmed || isDuplicateOrgan(trimmed, organs)) return false;

      setOrgans((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "tr")));
      setSelectedOrgans([trimmed]);
      setActiveOrgan(trimmed);
      setSelectedRegionId(null);
      return true;
    },
    [organs],
  );

  const handleUpsertRegion = useCallback((region: Region) => {
    setDraftRegions((prev) => {
      const idx = prev.findIndex((r) => r.id === region.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = region;
        return next;
      }
      return [...prev, region];
    });
  }, []);

  const handleDeleteRegion = useCallback(
    (regionId: string) => {
      setDraftRegions((prev) => prev.filter((r) => r.id !== regionId));
      if (atlasHasRegionId(atlas, regionId)) {
        setDeletedRegionIds((prev) => (prev.includes(regionId) ? prev : [...prev, regionId]));
      }
      setSelectedRegionId(null);
    },
    [atlas],
  );

  const handleSave = useCallback((): boolean => {
    const next = mergeDraftIntoAtlas(atlas, draftRegions, deletedRegionIds);
    saveAtlas(next);
    setAtlas(next);
    setDraftRegions([]);
    setDeletedRegionIds([]);
    setSelectedOrgans([]);
    setActiveOrgan(null);
    setSelectedRegionId(null);
    setOrgans((prev) => mergeOrganLists(listOrganNamesFromAtlas(next), prev));
    return true;
  }, [atlas, draftRegions, deletedRegionIds]);

  const handleDeleteSelectedDrawing = useCallback(() => {
    if (!selectedRegionId) {
      console.warn("Silmek için önce bir çizim seçiniz.");
      return;
    }
    handleDeleteRegion(selectedRegionId);
  }, [selectedRegionId, handleDeleteRegion]);

  const handleClear = useCallback(() => {
    handleDeleteSelectedDrawing();
  }, [handleDeleteSelectedDrawing]);

  return {
    hydrated,
    organs,
    selectedOrgans,
    activeOrgan,
    selectedFoot,
    setSelectedFoot,
    selectedView,
    setSelectedView,
    selectedRegionId,
    setSelectedRegionId,
    displayRegions,
    handleToggleOrgan,
    handleAddOrgan,
    handleDeleteSelectedDrawing,
    handleUpsertRegion,
    handleSave,
    handleClear,
  };
}
