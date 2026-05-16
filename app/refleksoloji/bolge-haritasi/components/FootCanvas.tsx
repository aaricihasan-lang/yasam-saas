"use client";

import Image from "next/image";
import {
  useCallback,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { ATLAS_REGIONS } from "../atlasRegions";
import type { FootSide, FootView, Region, RegionToolMode } from "../types";
import {
  atlasBackgroundLabel,
  ATLAS_IMAGE_SRC,
  resolveAtlasBackgroundKey,
} from "../utils/atlasBackground";
import {
  clamp01,
  DEFAULT_NEW_REGION_RX,
  DEFAULT_NEW_REGION_RY,
  regionToPercentBox,
} from "../utils/regionGeometry";

const NEW_REGION_COLOR = "rgba(216, 180, 254, 0.58)";

type FootCanvasProps = {
  selectedOrgan: string | null;
  selectedFoot: FootSide;
  selectedView: FootView;
  toolMode: RegionToolMode;
  userRegions: Region[];
  setUserRegions: Dispatch<SetStateAction<Region[]>>;
};

function filterVisibleRegions(regions: Region[], foot: FootSide, view: FootView) {
  return regions.filter((r) => r.footSide === foot && r.view === view);
}

function RegionOval({
  region,
  selectedOrgan,
  pointerEvents,
}: {
  region: Region;
  selectedOrgan: string | null;
  pointerEvents: boolean;
}) {
  const emphasized = selectedOrgan !== null && region.organ === selectedOrgan;
  const dimmed = selectedOrgan !== null && region.organ !== selectedOrgan;
  const idle = selectedOrgan === null;
  const isOval = region.shape === "oval";
  const box = regionToPercentBox(region);

  return (
    <div
      className={`group absolute flex items-center justify-center transition-all duration-300 ease-out ${
        pointerEvents ? "hover:scale-110" : "pointer-events-none"
      } ${
        emphasized
          ? "z-20 scale-[1.1] ring-2 ring-violet-400/95 ring-offset-2 ring-offset-white/95"
          : dimmed
            ? "z-0 opacity-40 hover:opacity-55"
            : idle
              ? "z-10 opacity-65 hover:opacity-80"
              : "z-10 opacity-90"
      }`}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: box.transform,
        transformOrigin: "center center",
        borderRadius: isOval ? 9999 : undefined,
        backgroundColor: emphasized ? region.color.replace(/[\d.]+\)$/, "0.82)") : region.color,
        boxShadow: emphasized
          ? "0 0 28px rgba(167, 139, 250, 0.75), 0 0 48px rgba(216, 180, 254, 0.45), 0 0 64px rgba(192, 132, 252, 0.25), 0 14px 36px -8px rgba(109, 40, 217, 0.5)"
          : undefined,
        filter: emphasized ? "brightness(1.12) saturate(1.08)" : undefined,
      }}
      title={region.organ}
    >
      <span
        className={`pointer-events-none max-w-[92%] truncate px-1 text-center font-bold leading-tight text-slate-900 ${
          emphasized ? "text-xs sm:text-sm" : "text-[11px] sm:text-xs"
        }`}
      >
        {region.organ}
      </span>
    </div>
  );
}

function buildCanvasBadge(foot: FootSide, backgroundKey: ReturnType<typeof resolveAtlasBackgroundKey>) {
  const footLabel = foot === "left" ? "Sol Ayak" : "Sağ Ayak";
  return `${footLabel} • ${atlasBackgroundLabel(backgroundKey)}`;
}

export function FootCanvas({
  selectedOrgan,
  selectedFoot,
  selectedView,
  toolMode,
  userRegions,
  setUserRegions,
}: FootCanvasProps) {
  const atlasBackgroundKey = useMemo(
    () => resolveAtlasBackgroundKey(selectedView, selectedOrgan),
    [selectedView, selectedOrgan],
  );

  const atlasSrc = ATLAS_IMAGE_SRC[atlasBackgroundKey];

  const atlasRegions = useMemo(
    () => filterVisibleRegions(ATLAS_REGIONS, selectedFoot, selectedView),
    [selectedFoot, selectedView],
  );

  const sessionRegions = useMemo(
    () => filterVisibleRegions(userRegions, selectedFoot, selectedView),
    [userRegions, selectedFoot, selectedView],
  );

  const visibleRegions = useMemo(
    () => [...atlasRegions, ...sessionRegions],
    [atlasRegions, sessionRegions],
  );

  const hasRegionForOrgan =
    selectedOrgan !== null && visibleRegions.some((r) => r.organ === selectedOrgan);

  const canvasBadge = buildCanvasBadge(selectedFoot, atlasBackgroundKey);
  const isAddMode = toolMode === "add";
  const showOrganRequired = isAddMode && !selectedOrgan;
  const showSelectHint = !selectedOrgan && !isAddMode;

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (toolMode !== "add" || !selectedOrgan) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const cx = clamp01((event.clientX - rect.left) / rect.width);
      const cy = clamp01((event.clientY - rect.top) / rect.height);

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: selectedOrgan,
        footSide: selectedFoot,
        view: selectedView,
        shape: "oval",
        cx,
        cy,
        rx: DEFAULT_NEW_REGION_RX,
        ry: DEFAULT_NEW_REGION_RY,
        angle: 0,
        color: NEW_REGION_COLOR,
      };

      setUserRegions((prev) => [...prev, newRegion]);
    },
    [toolMode, selectedOrgan, selectedFoot, selectedView, setUserRegions],
  );

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_20px_52px_-22px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/70 backdrop-blur-md"
      aria-label="Ayak haritası çalışma alanı"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-violet-100/80 px-3 py-1.5 sm:px-4">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-violet-300/60 bg-gradient-to-r from-white via-violet-50/98 to-fuchsia-50/95 px-4 py-1.5 text-sm font-black tracking-wide text-violet-950 shadow-[0_6px_24px_-6px_rgba(91,33,182,0.32)] ring-1 ring-inset ring-white/95 backdrop-blur-md sm:px-5 sm:text-base">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-400 shadow-[0_0_8px_rgba(139,92,246,0.7)]"
            aria-hidden
          />
          {canvasBadge}
        </span>
        <p className="text-sm font-semibold text-slate-700">
          {selectedOrgan ? selectedOrgan : "Organ seçilmedi"} · {visibleRegions.length} bölge
          {isAddMode ? " · Ekleme modu" : null}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={`relative h-full min-h-0 w-full flex-1 overflow-hidden bg-white ${
            isAddMode
              ? "cursor-crosshair ring-2 ring-inset ring-violet-300/40"
              : toolMode === "move"
                ? "cursor-grab"
                : ""
          }`}
          role="img"
          aria-label={`${canvasBadge} — refleks bölgeleri`}
          onClick={handleCanvasClick}
        >
          <Image
            key={atlasSrc}
            src={atlasSrc}
            alt={canvasBadge}
            fill
            priority
            sizes="(max-width: 1200px) 70vw, 1200px"
            className="pointer-events-none object-contain object-center"
            draggable={false}
          />

          <div className="absolute inset-0 z-[5]">
            {showOrganRequired ? (
              <p className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-amber-300/80 bg-amber-50/95 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-sm">
                Önce organ seçiniz.
              </p>
            ) : null}

            {showSelectHint ? (
              <p className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-violet-900 shadow-sm">
                Haritada vurgulamak için soldan organ seçin
              </p>
            ) : null}

            {isAddMode && selectedOrgan ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-violet-300/70 bg-white/92 px-3 py-1.5 text-sm font-semibold text-violet-900 shadow-sm">
                Haritaya tıklayarak «{selectedOrgan}» bölgesi ekleyin
              </p>
            ) : null}

            {visibleRegions.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-base font-medium text-slate-600/90">
                Bu ayak ve görünüm için kayıtlı bölge yok.
              </p>
            ) : (
              visibleRegions.map((region) => (
                <RegionOval
                  key={region.id}
                  region={region}
                  selectedOrgan={selectedOrgan}
                  pointerEvents={!isAddMode}
                />
              ))
            )}
          </div>
        </div>

        {selectedOrgan && !hasRegionForOrgan ? (
          <p className="shrink-0 border-t border-violet-100/60 bg-amber-50/40 px-3 py-1 text-center text-sm font-medium text-amber-900">
            «{selectedOrgan}» bu ayak görünümünde henüz bölge içermiyor.
          </p>
        ) : null}
      </div>
    </section>
  );
}
