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
import { boxFromDrag, clamp01, MIN_DRAG_SIZE, regionHasBox } from "../utils/regionGeometry";
import { DEFAULT_REGION_COLOR as REGION_COLOR } from "../utils/regionStyles";
import {
  asBoxRegion,
  resizeRegionByHandle,
  rotateRegionByPointer,
  type ResizeHandle,
} from "../utils/regionTransform";
import {
  FreeDrawDraftPreview,
  RegionDraftPreview,
  RegionShape,
} from "./regions/RegionShape";

const MOVE_DRAG_THRESHOLD = 0.004;
const FREE_DRAW_POINT_MIN_DIST = 0.003;

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
  onDrawComplete?: () => void;
};

type DraftState =
  | { kind: "box"; shape: "oval" | "rect"; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "free"; points: { x: number; y: number }[] };

type EditDragState =
  | { kind: "move"; regionId: string; start: { x: number; y: number }; snapshot: Region }
  | { kind: "resize"; regionId: string; handle: ResizeHandle; snapshot: Region }
  | { kind: "rotate"; regionId: string; snapshot: Region };

type PendingMoveState = {
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

function lockDocumentSelection(lock: boolean) {
  if (typeof document === "undefined") return;
  document.body.style.userSelect = lock ? "none" : "";
  document.body.style.webkitUserSelect = lock ? "none" : "";
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
  onDrawComplete,
}: FootCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imageLoadError, setImageLoadError] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editDrag, setEditDrag] = useState<EditDragState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveState | null>(null);

  const draftRef = useRef<DraftState | null>(null);
  const finishDraftRef = useRef<(state: DraftState) => boolean>(() => false);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const getNormalizedPointRef = useRef(
    (clientX: number, clientY: number, clamp?: boolean) =>
      null as { x: number; y: number } | null,
  );

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
  const showEditHandles = isMoveMode;

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
    (state: DraftState): boolean => {
      if (!activeOrgan) return false;

      if (state.kind === "box") {
        const box = boxFromDrag(
          state.start,
          state.current,
          state.shape === "oval" ? "oval" : "rect",
        );
        if (!box) return false;

        const newRegion: Region = {
          id: crypto.randomUUID(),
          organ: activeOrgan,
          footSide: selectedFoot,
          view: selectedView,
          color: REGION_COLOR,
          ...box,
        };
        onUpsertRegion(newRegion);
        onSelectRegion(newRegion.id);
        return true;
      }

      if (state.points.length < 2) return false;

      const pathLen = state.points.reduce((acc, p, i, arr) => {
        if (i === 0) return 0;
        const prev = arr[i - 1];
        return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
      }, 0);
      if (pathLen < MIN_DRAG_SIZE) return false;

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: activeOrgan,
        footSide: selectedFoot,
        view: selectedView,
        shape: "free_draw",
        points: state.points,
        color: REGION_COLOR,
      };
      onUpsertRegion(newRegion);
      onSelectRegion(newRegion.id);
      return true;
    },
    [activeOrgan, selectedFoot, selectedView, onUpsertRegion, onSelectRegion],
  );

  draftRef.current = draft;
  finishDraftRef.current = finishDraft;
  onDrawCompleteRef.current = onDrawComplete;
  getNormalizedPointRef.current = getNormalizedPoint;

  const isDrawing = draft !== null;

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !isAddMode || !activeOrgan) return;

      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      e.preventDefault();
      e.stopPropagation();
      overlayRef.current?.setPointerCapture(e.pointerId);

      if (drawShape === "free_draw") {
        setDraft({ kind: "free", points: [point] });
        return;
      }

      const shape = drawShape === "rect" ? "rect" : "oval";
      setDraft({ kind: "box", shape, start: point, current: point });
    },
    [isAddMode, activeOrgan, drawShape, getNormalizedPoint],
  );

  const handleRegionMovePointerDown = useCallback(
    (regionId: string, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const point = getNormalizedPoint(clientX, clientY, true);
      const region = regions.find((r) => r.id === regionId);
      if (!point || !region) return;

      onSelectRegion(regionId);
      setPendingMove({
        regionId,
        start: point,
        snapshot: structuredClone(region),
      });
    },
    [isMoveMode, getNormalizedPoint, regions, onSelectRegion],
  );

  const handleResizeStart = useCallback(
    (regionId: string, handle: ResizeHandle, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const region = regions.find((r) => r.id === regionId);
      const box = region ? asBoxRegion(region) : null;
      if (!box) return;

      onSelectRegion(regionId);
      setPendingMove(null);
      lockDocumentSelection(true);
      setEditDrag({
        kind: "resize",
        regionId,
        handle,
        snapshot: structuredClone(box),
      });
    },
    [isMoveMode, regions, onSelectRegion],
  );

  const handleRotateStart = useCallback(
    (regionId: string, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const region = regions.find((r) => r.id === regionId);
      const box = region ? asBoxRegion(region) : null;
      if (!box) return;

      onSelectRegion(regionId);
      setPendingMove(null);
      lockDocumentSelection(true);
      setEditDrag({
        kind: "rotate",
        regionId,
        snapshot: structuredClone(box),
      });
    },
    [isMoveMode, regions, onSelectRegion],
  );

  useEffect(() => {
    if (!isDrawing) return;

    lockDocumentSelection(true);

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const point = getNormalizedPointRef.current(e.clientX, e.clientY, true);
      if (!point) return;

      setDraft((prev) => {
        if (!prev) return prev;
        if (prev.kind === "box") return { ...prev, current: point };
        const last = prev.points[prev.points.length - 1];
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < FREE_DRAW_POINT_MIN_DIST) {
          return prev;
        }
        return { ...prev, points: [...prev.points, point] };
      });
    };

    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      lockDocumentSelection(false);
      try {
        overlayRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be released */
      }

      const prev = draftRef.current;
      setDraft(null);
      if (prev) {
        const created = finishDraftRef.current(prev);
        if (created) onDrawCompleteRef.current?.();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      lockDocumentSelection(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDrawing]);

  useEffect(() => {
    if (!pendingMove) return;

    const onMove = (e: PointerEvent) => {
      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      const dist = Math.hypot(point.x - pendingMove.start.x, point.y - pendingMove.start.y);
      if (dist < MOVE_DRAG_THRESHOLD) return;

      lockDocumentSelection(true);
      setEditDrag({
        kind: "move",
        regionId: pendingMove.regionId,
        start: pendingMove.start,
        snapshot: pendingMove.snapshot,
      });
      setPendingMove(null);
    };

    const onUp = () => {
      setPendingMove(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [pendingMove, getNormalizedPoint]);

  useEffect(() => {
    if (!editDrag) return;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      if (editDrag.kind === "move") {
        const dx = point.x - editDrag.start.x;
        const dy = point.y - editDrag.start.y;
        onUpsertRegion(applyRegionDelta(editDrag.snapshot, dx, dy));
        return;
      }

      if (editDrag.kind === "resize") {
        const box = asBoxRegion(editDrag.snapshot);
        if (!box) return;
        const updated = resizeRegionByHandle(box, editDrag.handle, point);
        onUpsertRegion({ ...updated, color: editDrag.snapshot.color ?? REGION_COLOR });
        return;
      }

      if (editDrag.kind === "rotate") {
        const box = asBoxRegion(editDrag.snapshot);
        if (!box) return;
        const updated = rotateRegionByPointer(box, point);
        onUpsertRegion({ ...updated, color: editDrag.snapshot.color ?? REGION_COLOR });
      }
    };

    const onUp = () => {
      lockDocumentSelection(false);
      setEditDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      lockDocumentSelection(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editDrag, getNormalizedPoint, onUpsertRegion]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isAddMode) return;
    if (e.target !== e.currentTarget) return;
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
          {isAddMode ? " · Çizim modu" : isMoveMode ? " · Düzenleme modu" : null}
        </p>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={canvasRef}
          className={`relative h-full min-h-0 w-full flex-1 select-none overflow-hidden bg-white touch-none ${
            canDraw ? "cursor-crosshair ring-2 ring-inset ring-violet-300/40" : isMoveMode ? "cursor-default" : ""
          }`}
          onPointerDown={handleCanvasPointerDown}
        >
          {!imageLoadError ? (
            <img
              key={currentImageSrc}
              src={currentImageSrc}
              alt={imageAlt}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              onError={() => setImageLoadError(true)}
              className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-contain opacity-100"
            />
          ) : (
            <p className="absolute inset-0 z-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-amber-900">
              Atlas görseli yüklenemedi.
            </p>
          )}

          {imageRect.width > 0 ? (
            <div
              ref={overlayRef}
              className="absolute z-10 touch-none select-none"
              style={imageOverlayStyle}
              onPointerDown={(e) => {
                if (isAddMode) {
                  handleOverlayPointerDown(e);
                  return;
                }
                if (e.target === e.currentTarget) {
                  onSelectRegion(null);
                }
              }}
            >
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
                  Seç · sürükle · boyutlandır · döndür
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
                  showEditHandles={showEditHandles}
                  onSelect={onSelectRegion}
                  onMovePointerDown={handleRegionMovePointerDown}
                  onResizeStart={handleResizeStart}
                  onRotateStart={handleRotateStart}
                />
              ))}

              {draft?.kind === "box" ? (
                <RegionDraftPreview shape={draft.shape} start={draft.start} current={draft.current} />
              ) : null}
              {draft?.kind === "free" ? <FreeDrawDraftPreview points={draft.points} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
