"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { FootSide, FootView, Region, RegionDrawShape, RegionToolMode } from "../types";
import {
  atlasBackgroundLabel,
  ATLAS_IMAGE_SRC,
  resolveAtlasBackgroundKey,
} from "../utils/atlasBackground";
import { computeObjectContainRect } from "../utils/imageContainRect";
import { pointerToImageNormalized } from "../utils/normalizePointer";
import { boxFromDrag, DEFAULT_REGION_COLOR } from "../utils/regionGeometry";
import {
  FreeDrawDraftPreview,
  RegionDraftPreview,
  RegionShape,
} from "./regions/RegionShape";

type FootCanvasProps = {
  selectedOrgan: string | null;
  selectedFoot: FootSide;
  selectedView: FootView;
  toolMode: RegionToolMode;
  drawShape: RegionDrawShape;
  userRegions: Region[];
  setUserRegions: Dispatch<SetStateAction<Region[]>>;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
};

type DraftState =
  | { kind: "box"; shape: "oval" | "rect"; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "free"; points: { x: number; y: number }[] };

function filterVisibleRegions(regions: Region[], foot: FootSide, view: FootView) {
  return regions.filter((r) => r.footSide === foot && r.view === view);
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
  drawShape,
  userRegions,
  setUserRegions,
  selectedRegionId,
  onSelectRegion,
}: FootCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imageLoadError, setImageLoadError] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);

  const atlasBackgroundKey = useMemo(
    () => resolveAtlasBackgroundKey(selectedView, selectedOrgan),
    [selectedView, selectedOrgan],
  );

  const currentImageSrc = ATLAS_IMAGE_SRC[atlasBackgroundKey];
  const imageAlt = atlasBackgroundLabel(atlasBackgroundKey);
  const canvasBadge = buildCanvasBadge(selectedFoot, atlasBackgroundKey);

  const isAddMode = toolMode === "add";
  const isSelectMode = toolMode === "select";
  const showOrganRequired = isAddMode && !selectedOrgan;

  const visibleRegions = useMemo(
    () => filterVisibleRegions(userRegions, selectedFoot, selectedView),
    [userRegions, selectedFoot, selectedView],
  );

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
      if (!selectedOrgan) return;

      if (state.kind === "box") {
        const box = boxFromDrag(
          state.start,
          state.current,
          state.shape === "oval" ? "oval" : "rect",
        );
        if (!box) return;

        const newRegion: Region = {
          id: crypto.randomUUID(),
          organ: selectedOrgan,
          footSide: selectedFoot,
          view: selectedView,
          color: DEFAULT_REGION_COLOR,
          ...box,
        };
        setUserRegions((prev) => [...prev, newRegion]);
        onSelectRegion(newRegion.id);
        return;
      }

      if (state.points.length < 2) return;

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: selectedOrgan,
        footSide: selectedFoot,
        view: selectedView,
        shape: "free_draw",
        points: state.points,
        color: DEFAULT_REGION_COLOR,
      };
      setUserRegions((prev) => [...prev, newRegion]);
      onSelectRegion(newRegion.id);
    },
    [selectedOrgan, selectedFoot, selectedView, setUserRegions, onSelectRegion],
  );

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      if (!isAddMode || !selectedOrgan) return;

      const point = getNormalizedPoint(clientX, clientY, true);
      if (!point) return;

      if (drawShape === "free_draw") {
        setDraft({ kind: "free", points: [point] });
        return;
      }

      const shape = drawShape === "rect" ? "rect" : "oval";
      setDraft({ kind: "box", shape, start: point, current: point });
    },
    [isAddMode, selectedOrgan, drawShape, getNormalizedPoint],
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

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isSelectMode) {
      onSelectRegion(null);
      return;
    }
    handlePointerDown(e.clientX, e.clientY);
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

  const canDraw = isAddMode && selectedOrgan && imageRect.width > 0;

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
          {isAddMode ? " · Çizim modu" : null}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={canvasRef}
          className={`relative h-full min-h-0 w-full flex-1 overflow-hidden bg-white ${
            canDraw ? "cursor-crosshair ring-2 ring-inset ring-violet-300/40" : ""
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
            <div
              className="absolute z-10"
              style={imageOverlayStyle}
            >
              {showOrganRequired ? (
                <p className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/80 bg-amber-50/95 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-sm">
                  Önce soldan bir organ seçiniz.
                </p>
              ) : null}

              {isAddMode && selectedOrgan ? (
                <p className="pointer-events-none absolute bottom-2 left-1/2 z-40 max-w-[95%] -translate-x-1/2 rounded-full border border-violet-300/70 bg-white/92 px-3 py-1 text-center text-xs font-semibold text-violet-900 shadow-sm sm:text-sm">
                  {drawShape === "free_draw"
                    ? `«${selectedOrgan}» için basılı tutup çizin`
                    : `«${selectedOrgan}» için sürükleyerek ${drawShape === "rect" ? "kare" : "oval"} çizin`}
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
                  interactive={!isAddMode}
                  onSelect={onSelectRegion}
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
