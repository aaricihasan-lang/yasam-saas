"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { ATLAS_REGIONS } from "../atlasRegions";
import type { FootSide, FootView, Region, RegionToolMode } from "../types";

const NEW_REGION_WIDTH = 12;
const NEW_REGION_HEIGHT = 8;
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
  const isOval = region.shapeType === "oval";

  return (
    <div
      className={`group absolute flex items-center justify-center transition-all duration-300 ease-out ${
        pointerEvents ? "hover:scale-110" : "pointer-events-none"
      } ${
        emphasized
          ? "z-20 scale-105 ring-2 ring-violet-400/80 ring-offset-2 ring-offset-white/80"
          : dimmed
            ? "z-0 opacity-40 hover:opacity-55"
            : idle
              ? "z-10 opacity-65 hover:opacity-80"
              : "z-10 opacity-90"
      }`}
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.width}%`,
        height: `${region.height}%`,
        borderRadius: isOval ? 9999 : undefined,
        backgroundColor: emphasized ? region.color.replace(/[\d.]+\)$/, "0.72)") : region.color,
        boxShadow: emphasized ? "0 8px 28px -6px rgba(109, 40, 217, 0.4)" : undefined,
      }}
      title={region.organ}
    >
      <span
        className={`pointer-events-none max-w-[90%] truncate px-1 text-center font-bold leading-tight text-slate-800/90 ${
          emphasized ? "text-[10px] sm:text-xs" : "text-[9px] sm:text-[10px]"
        }`}
      >
        {region.organ}
      </span>
    </div>
  );
}

function buildCanvasBadge(foot: FootSide, view: FootView): string {
  const footLabel = foot === "left" ? "Sol Ayak" : "Sağ Ayak";
  const viewLabel = view === "taban" ? "Taban Görünüm" : "Yan Görünüm";
  return `${footLabel} • ${viewLabel}`;
}

export function FootCanvas({
  selectedOrgan,
  selectedFoot,
  selectedView,
  toolMode,
  userRegions,
  setUserRegions,
}: FootCanvasProps) {
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

  const canvasBadge = buildCanvasBadge(selectedFoot, selectedView);
  const isAddMode = toolMode === "add";
  const showOrganRequired = isAddMode && !selectedOrgan;
  const showSelectHint = !selectedOrgan && !isAddMode;

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (toolMode !== "add" || !selectedOrgan) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = ((event.clientX - rect.left) / rect.width) * 100;
      const centerY = ((event.clientY - rect.top) / rect.height) * 100;

      const x = Math.max(0, Math.min(100 - NEW_REGION_WIDTH, centerX - NEW_REGION_WIDTH / 2));
      const y = Math.max(0, Math.min(100 - NEW_REGION_HEIGHT, centerY - NEW_REGION_HEIGHT / 2));

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: selectedOrgan,
        footSide: selectedFoot,
        view: selectedView,
        x,
        y,
        width: NEW_REGION_WIDTH,
        height: NEW_REGION_HEIGHT,
        shapeType: "oval",
        color: NEW_REGION_COLOR,
      };

      setUserRegions((prev) => [...prev, newRegion]);
    },
    [toolMode, selectedOrgan, selectedFoot, selectedView, setUserRegions],
  );

  return (
    <section
      className="flex min-h-[280px] flex-1 flex-col rounded-[28px] border border-white/90 bg-white/75 shadow-[0_20px_52px_-22px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/70 backdrop-blur-md sm:min-h-[360px] lg:min-h-[420px]"
      aria-label="Ayak haritası çalışma alanı"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100/80 px-4 py-2.5 sm:px-5">
        <span className="rounded-full border border-indigo-300/70 bg-gradient-to-r from-indigo-100/90 to-violet-100/80 px-2.5 py-1 text-[10px] font-black tracking-wide text-indigo-950 shadow-sm sm:px-3 sm:text-[11px]">
          {canvasBadge}
        </span>
        <p className="text-[10px] font-semibold text-slate-500 sm:text-xs">
          {selectedOrgan ? selectedOrgan : "Organ seçilmedi"} · {visibleRegions.length} bölge
          {isAddMode ? " · Ekleme modu" : null}
        </p>
      </div>

      <div className="relative flex min-h-[240px] flex-1 flex-col p-3 sm:min-h-[300px] sm:p-4">
        <div
          className={`relative min-h-[220px] flex-1 overflow-hidden rounded-[22px] border bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/50 shadow-inner sm:min-h-[280px] ${
            isAddMode
              ? "cursor-crosshair border-violet-400/70 ring-2 ring-violet-300/40"
              : toolMode === "move"
                ? "cursor-grab border-violet-200/60"
                : "border-violet-200/60"
          }`}
          role="img"
          aria-label={`${canvasBadge} — refleks bölgeleri`}
          onClick={handleCanvasClick}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(139,92,246,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.08) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />

          {showOrganRequired ? (
            <p className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-amber-300/80 bg-amber-50/95 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-sm">
              Önce organ seçiniz.
            </p>
          ) : null}

          {showSelectHint ? (
            <p className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-violet-200/80 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-800/90 shadow-sm sm:text-xs">
              Haritada vurgulamak için soldan organ seçin
            </p>
          ) : null}

          {isAddMode && selectedOrgan ? (
            <p className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-violet-300/70 bg-white/92 px-3 py-1 text-[10px] font-semibold text-violet-900 shadow-sm sm:text-xs">
              Haritaya tıklayarak «{selectedOrgan}» bölgesi ekleyin
            </p>
          ) : null}

          {visibleRegions.length === 0 ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-slate-500">
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

        {selectedOrgan && !hasRegionForOrgan ? (
          <p className="mt-2 text-center text-xs font-medium text-amber-800/90">
            «{selectedOrgan}» bu ayak görünümünde henüz bölge içermiyor.
          </p>
        ) : null}

        <p className="mt-2 text-center text-[10px] font-medium leading-relaxed text-slate-500 sm:text-xs">
          Masaüstündeki cizim_motoru.py yapısı buraya SVG/Canvas olarak aktarılacak.
        </p>
      </div>
    </section>
  );
}
