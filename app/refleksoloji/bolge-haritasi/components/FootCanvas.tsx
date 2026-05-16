"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FootSide, FootView, Region, RegionDrawShape, RegionToolMode } from "../types";
import {
  atlasBackgroundLabel,
  ATLAS_IMAGE_SRC,
  resolveAtlasBackgroundKey,
} from "../utils/atlasBackground";
import { computeObjectContainRect } from "../utils/imageContainRect";
import { pointerToImageNormalized } from "../utils/normalizePointer";
import { boxFromDrag, clamp01, DEFAULT_REGION_COLOR, regionHasBox } from "../utils/regionGeometry";
import {
  FreeDrawDraftPreview,
  RegionDraftPreview,
  RegionShape,
} from "./regions/RegionShape";

type FootCanvasProps = {
  activeOrgan: string | null;
  selectedOrgans: string[];
  selectedFoot: FootSide;
  selectedView: FootView;
  toolMode: RegionToolMode;
  drawShape: RegionDrawShape;
  regions: Region[];
  onUpsertRegion: (region: Region) => void;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
};

type DraftState =
  | { kind: "box"; shape: "oval" | "rect"; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "free"; points: { x: number; y: number }[] };

type RegionDragState = {
  regionId: string;
  start: { x: number; y: number };
  snapshot: Region;
};

function applyRegionDelta(snapshot: Region, dx: number, dy: number): Region {
  if (snapshot.shape === "free_draw" && snapshot.points) {
    return {
      ...snapshot,
      points: snapshot.points.map((p) => ({
        x: clamp01(p.x + dx),
        y: clamp01(p.y + dy),
      })),
    };
  }

  if (regionHasBox(snapshot)) {
    return {
      ...snapshot,
      cx: clamp01(snapshot.cx + dx),
      cy: clamp01(snapshot.cy + dy),
    };
  }

  return snapshot;
}

function buildCanvasBadge(foot: FootSide, backgroundKey: ReturnType<typeof resolveAtlasBackgroundKey>) {
  const footLabel = foot === "left" ? "Sol Ayak" : "Sağ Ayak";
  return `${footLabel} • ${atlasBackgroundLabel(backgroundKey)}`;
}

export function FootCanvas({
  activeOrgan,
  selectedOrgans,
  selectedFoot,
  selectedView,
  toolMode,
  drawShape,
  regions,
  onUpsertRegion,
  selectedRegionId,
  onSelectRegion,
}: FootCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imageLoadError, setImageLoadError] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [regionDrag, setRegionDrag] = useState<RegionDragState | null>(null);

  const atlasBackgroundKey = useMemo(
    () => resolveAtlasBackgroundKey(selectedView, activeOrgan),
    [selectedView, activeOrgan],
  );

  const currentImageSrc = ATLAS_IMAGE_SRC[atlasBackgroundKey];
  const imageAlt = atlasBackgroundLabel(atlasBackgroundKey);
  const canvasBadge = buildCanvasBadge(selectedFoot, atlasBackgroundKey);

  const isAddMode = toolMode === "add";
  const isMoveMode = toolMode === "move";
  const showOrganRequired = isAddMode && !activeOrgan;

  const visibleRegions = regions;

  const imageRect = useMemo(
    () => computeObjectContainRect(containerSize.w, containerSize.h, naturalSize.w, naturalSize.h),
    [containerSize, naturalSize],
  );

  useEffect(() => {
    setImageLoadError(false);
    setNaturalSize({ w: 0, h: 0 });
  }, [currentImageSrc]);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getNormalizedPoint = useCallback(
    (clientX: number, clientY: number, clamp = false) => {
      const el = canvasRef.current;
      if (!el) return null;
      return pointerToImageNormalized(
        clientX,
        clientY,
        el.getBoundingClientRect(),
        imageRect,
        { clamp },
      );
    },
    [imageRect],
  );

  const finishDraft = useCallback(
    (state: DraftState) => {
      if (!activeOrgan) return;

      if (state.kind === "box") {
        const box = boxFromDrag(
          state.start,
          state.current,
          state.shape === "oval" ? "oval" : "rect",
        );
        if (!box) return;

        const newRegion: Region = {
          id: crypto.randomUUID(),
          organ: activeOrgan,
          footSide: selectedFoot,
          view: selectedView,
          color: DEFAULT_REGION_COLOR,
          ...box,
        };
        onUpsertRegion(newRegion);
        onSelectRegion(newRegion.id);
        return;
      }

      if (state.points.length < 2) return;

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: activeOrgan,
        footSide: selectedFoot,
        view: selectedView,
        shape: "free_draw",
        points: state.points,
        color: DEFAULT_REGION_COLOR,
      };
      onUpsertRegion(newRegion);
      onSelectRegion(newRegion.id);
    },
    [activeOrgan, selectedFoot, selectedView, onUpsertRegion, onSelectRegion],
  );

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      if (!isAddMode || !activeOrgan) return;

      const point = getNormalizedPoint(clientX, clientY, true);
      if (!point) return;

      if (drawShape === "free_draw") {
        setDraft({ kind: "free", points: [point] });
        return;
      }

      const shape = drawShape === "rect" ? "rect" : "oval";
      setDraft({ kind: "box", shape, start: point, current: point });
    },
    [isAddMode, activeOrgan, drawShape, getNormalizedPoint],
  );

  const handleRegionMoveStart = useCallback(
    (regionId: string, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const point = getNormalizedPoint(clientX, clientY, true);
      const region = regions.find((r) => r.id === regionId);
      if (!point || !region) return;

      onSelectRegion(regionId);
      setRegionDrag({
        regionId,
        start: point,
        snapshot: structuredClone(region),
      });
    },
    [isMoveMode, getNormalizedPoint, regions, onSelectRegion],
  );

  useEffect(() => {
    if (!draft) return;

    const onMove = (e: MouseEvent) => {
      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      setDraft((prev) => {
        if (!prev) return prev;
        if (prev.kind === "box") return { ...prev, current: point };
        const last = prev.points[prev.points.length - 1];
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.004) return prev;
        return { ...prev, points: [...prev.points, point] };
      });
    };

    const onUp = () => {
      setDraft((prev) => {
        if (prev) finishDraft(prev);
        return null;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draft, getNormalizedPoint, finishDraft]);

  useEffect(() => {
    if (!regionDrag) return;

    const onMove = (e: MouseEvent) => {
      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      const dx = point.x - regionDrag.start.x;
      const dy = point.y - regionDrag.start.y;

      const updated = applyRegionDelta(regionDrag.snapshot, dx, dy);
      onUpsertRegion(updated);
    };

    const onUp = () => setRegionDrag(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [regionDrag, getNormalizedPoint, onUpsertRegion]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isAddMode) {
      handlePointerDown(e.clientX, e.clientY);
      return;
    }
    onSelectRegion(null);
  };

  const imageOverlayStyle = useMemo(
    () => ({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
    }),
    [imageRect],
  );

  const canDraw = isAddMode && activeOrgan && imageRect.width > 0;
  const regionInteractive = !isAddMode;

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
          {activeOrgan ? activeOrgan : "Aktif organ yok"} · {visibleRegions.length} bölge
          {selectedOrgans.length > 1 ? ` · ${selectedOrgans.length} organ overlay` : ""}
          {isAddMode ? " · Çizim modu" : isMoveMode ? " · Taşıma modu" : null}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={canvasRef}
          className={`relative h-full min-h-0 w-full flex-1 overflow-hidden bg-white ${
            canDraw ? "cursor-crosshair ring-2 ring-inset ring-violet-300/40" : isMoveMode ? "cursor-default" : ""
          }`}
          onMouseDown={handleCanvasMouseDown}
        >
          {!imageLoadError ? (
            <img
              key={currentImageSrc}
              src={currentImageSrc}
              alt={imageAlt}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              onError={() => setImageLoadError(true)}
              className="absolute inset-0 z-0 h-full w-full object-contain opacity-100 pointer-events-none select-none"
            />
          ) : (
            <p className="absolute inset-0 z-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-amber-900">
              Atlas görseli yüklenemedi.
            </p>
          )}

          {imageRect.width > 0 ? (
            <div className="absolute z-10" style={imageOverlayStyle}>
              {showOrganRequired ? (
                <p className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/80 bg-amber-50/95 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-sm">
                  Önce soldan bir organ seçiniz.
                </p>
              ) : null}

              {isAddMode && activeOrgan ? (
                <p className="pointer-events-none absolute bottom-2 left-1/2 z-40 max-w-[95%] -translate-x-1/2 rounded-full border border-violet-300/70 bg-white/92 px-3 py-1 text-center text-xs font-semibold text-violet-900 shadow-sm sm:text-sm">
                  {drawShape === "free_draw"
                    ? `«${activeOrgan}» için basılı tutup çizin`
                    : `«${activeOrgan}» için sürükleyerek ${drawShape === "rect" ? "kare" : "oval"} çizin`}
                </p>
              ) : null}

              {isMoveMode ? (
                <p className="pointer-events-none absolute top-2 right-2 z-40 rounded-full border border-sky-300/70 bg-sky-50/95 px-2.5 py-1 text-xs font-semibold text-sky-950 shadow-sm">
                  Bölgeyi sürükleyerek taşıyın
                </p>
              ) : null}

              {visibleRegions.length === 0 && !isAddMode ? (
                <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm font-medium text-slate-500">
                  Bu görünümde henüz çizilmiş bölge yok. Bölge Ekle ile çizmeye başlayın.
                </p>
              ) : null}

              {visibleRegions.map((region) => (
                <RegionShape
                  key={region.id}
                  region={region}
                  isSelected={selectedRegionId === region.id}
                  interactive={regionInteractive}
                  moveMode={isMoveMode}
                  onSelect={onSelectRegion}
                  onMoveStart={handleRegionMoveStart}
                />
              ))}

              {draft?.kind === "box" ? (
                <RegionDraftPreview
                  shape={draft.shape}
                  start={draft.start}
                  current={draft.current}
                />
              ) : null}
              {draft?.kind === "free" ? <FreeDrawDraftPreview points={draft.points} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
