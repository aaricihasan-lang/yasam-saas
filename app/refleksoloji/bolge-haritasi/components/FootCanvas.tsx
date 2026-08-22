"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FootSide, FootView, Region, RegionDrawShape, RegionToolMode } from "../types";
import { normalizeThickLineRegion, THICK_LINE_RENDER_STROKE_PX } from "../types";

/** Yeni kalın çizgi kayıtları — normalize 0..1 (yalnızca veri; görsel 3px) */
const THICK_LINE_WIDTH = 0.003;

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
import { regionHasThickLine, RegionDraftPreview, RegionShape } from "./regions/RegionShape";

const MOVE_DRAG_THRESHOLD = 0.004;
const FREE_DRAW_POINT_MIN_DIST = 0.003;
const MIN_THICK_LINE_PX = 20;

type ThickLineDraft = { x1: number; y1: number; x2: number; y2: number };
type ThickLineEndpoint = "start" | "end";

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
  /**
   * ÜRÜN KURALI: false ise (telefon/dar ekran) harita SALT-OKUMA — hiçbir çizim/
   * taşıma/boyutlandırma/döndürme etkileşimi başlatılamaz. Görüntüleme sürer.
   */
  editingAllowed: boolean;
};

type DraftState = {
  kind: "box";
  shape: "oval" | "rect";
  start: { x: number; y: number };
  current: { x: number; y: number };
};

type PreviewPoint = { x: number; y: number };
type PixelPoint = { x: number; y: number };

function normalizedToOverlayPixel(
  point: PreviewPoint,
  overlayWidth: number,
  overlayHeight: number,
): PixelPoint {
  return { x: point.x * overlayWidth, y: point.y * overlayHeight };
}

type EditDragState =
  | { kind: "move"; regionId: string; start: { x: number; y: number }; snapshot: Region }
  | { kind: "resize"; regionId: string; handle: ResizeHandle; snapshot: Region }
  | { kind: "rotate"; regionId: string; snapshot: Region }
  | { kind: "line-end"; regionId: string; endpoint: ThickLineEndpoint; snapshot: Region }
  | { kind: "line-rotate"; regionId: string; startPointerAngle: number; snapshot: Region };

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

  if (regionHasThickLine(snapshot)) {
    return {
      ...snapshot,
      x1: clamp01(snapshot.x1 + dx),
      y1: clamp01(snapshot.y1 + dy),
      x2: clamp01(snapshot.x2 + dx),
      y2: clamp01(snapshot.y2 + dy),
    };
  }

  return snapshot;
}

function rotatePointAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  deltaRad: number,
): { x: number; y: number } {
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(deltaRad);
  const sin = Math.sin(deltaRad);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function rotateThickLineByPointer(
  snapshot: Region & { x1: number; y1: number; x2: number; y2: number },
  pointer: { x: number; y: number },
  startPointerAngle: number,
): Region {
  const cx = (snapshot.x1 + snapshot.x2) / 2;
  const cy = (snapshot.y1 + snapshot.y2) / 2;
  const currentAngle = Math.atan2(pointer.y - cy, pointer.x - cx);
  const delta = currentAngle - startPointerAngle;
  const p1 = rotatePointAround(snapshot.x1, snapshot.y1, cx, cy, delta);
  const p2 = rotatePointAround(snapshot.x2, snapshot.y2, cx, cy, delta);
  return {
    ...snapshot,
    x1: clamp01(p1.x),
    y1: clamp01(p1.y),
    x2: clamp01(p2.x),
    y2: clamp01(p2.y),
  };
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
  editingAllowed,
}: FootCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [imageLoadError, setImageLoadError] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isManualDrawing, setIsManualDrawing] = useState(false);
  const [currentPreviewPoints, setCurrentPreviewPoints] = useState<PreviewPoint[]>([]);
  const [liveStrokePoint, setLiveStrokePoint] = useState<PreviewPoint | null>(null);
  const [thickLineDraft, setThickLineDraft] = useState<ThickLineDraft | null>(null);
  const [editDrag, setEditDrag] = useState<EditDragState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveState | null>(null);

  const draftRef = useRef<DraftState | null>(null);
  const previewPointsRef = useRef<PreviewPoint[]>([]);
  const isManualDrawingRef = useRef(false);
  const isThickLineDrawingRef = useRef(false);
  const thickLineDraftRef = useRef<ThickLineDraft | null>(null);
  const manualPointerIdRef = useRef<number | null>(null);
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

  // ÜRÜN KURALI: düzenleme yalnız geniş ekranda. Etkin add/move modları
  // editingAllowed'a bağlanır → tüm handler'lar (draw/move/resize/rotate/line),
  // canDraw, regionInteractive, showEditHandles TEK KAYNAKTAN salt-okuma olur.
  const isAddMode = editingAllowed && toolMode === "add";
  const isMoveMode = editingAllowed && toolMode === "move";
  const showOrganRequired = isAddMode && !activeOrgan;
  const showEditHandles = isMoveMode;

  const visibleRegions = useMemo(
    () => regions.map((region) => normalizeThickLineRegion(region)),
    [regions],
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

  const finishBoxDraft = useCallback(
    (state: DraftState): boolean => {
      if (!activeOrgan) return false;

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
    },
    [activeOrgan, selectedFoot, selectedView, onUpsertRegion, onSelectRegion],
  );

  const finishManualDraw = useCallback(
    (points: PreviewPoint[]): boolean => {
      if (!activeOrgan || points.length < 2) return false;

      const pathLen = points.reduce((acc, p, i, arr) => {
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
        points,
        color: REGION_COLOR,
      };
      onUpsertRegion(newRegion);
      onSelectRegion(newRegion.id);
      return true;
    },
    [activeOrgan, selectedFoot, selectedView, onUpsertRegion, onSelectRegion],
  );

  const finishManualDrawRef = useRef(finishManualDraw);

  const finishThickLineDraw = useCallback(
    (draftLine: ThickLineDraft, overlayWidth: number, overlayHeight: number): boolean => {
      if (!activeOrgan || overlayWidth <= 0 || overlayHeight <= 0) return false;

      const pxLen = Math.hypot(
        (draftLine.x2 - draftLine.x1) * overlayWidth,
        (draftLine.y2 - draftLine.y1) * overlayHeight,
      );
      if (pxLen < MIN_THICK_LINE_PX) return false;

      const newRegion: Region = {
        id: crypto.randomUUID(),
        organ: activeOrgan,
        footSide: selectedFoot,
        view: selectedView,
        shape: "thick_line",
        x1: clamp01(draftLine.x1),
        y1: clamp01(draftLine.y1),
        x2: clamp01(draftLine.x2),
        y2: clamp01(draftLine.y2),
        lineWidth: THICK_LINE_WIDTH,
        color: REGION_COLOR,
      };
      onUpsertRegion(newRegion);
      onSelectRegion(newRegion.id);
      return true;
    },
    [activeOrgan, selectedFoot, selectedView, onUpsertRegion, onSelectRegion],
  );

  const finishThickLineDrawRef = useRef(finishThickLineDraw);

  draftRef.current = draft;
  finishDraftRef.current = finishBoxDraft;
  finishManualDrawRef.current = finishManualDraw;
  finishThickLineDrawRef.current = finishThickLineDraw;
  previewPointsRef.current = currentPreviewPoints;
  thickLineDraftRef.current = thickLineDraft;
  onDrawCompleteRef.current = onDrawComplete;
  getNormalizedPointRef.current = getNormalizedPoint;

  const isBoxDrawing = draft !== null;

  const overlayW = imageRect.width;
  const overlayH = imageRect.height;

  const displayPreviewPoints = useMemo((): PixelPoint[] => {
    if (overlayW <= 0 || overlayH <= 0) return [];

    const pixels = currentPreviewPoints.map((p) => normalizedToOverlayPixel(p, overlayW, overlayH));

    if (liveStrokePoint) {
      const live = normalizedToOverlayPixel(liveStrokePoint, overlayW, overlayH);
      const last = pixels[pixels.length - 1];
      if (!last || last.x !== live.x || last.y !== live.y) {
        pixels.push(live);
      }
    }

    return pixels;
  }, [currentPreviewPoints, liveStrokePoint, overlayW, overlayH]);

  const thickLinePreviewPixels = useMemo(() => {
    if (!thickLineDraft || overlayW <= 0 || overlayH <= 0) return null;
    const x1 = thickLineDraft.x1 * overlayW;
    const y1 = thickLineDraft.y1 * overlayH;
    const x2 = thickLineDraft.x2 * overlayW;
    const y2 = thickLineDraft.y2 * overlayH;
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return { x1, y1, x2, y2 };
  }, [thickLineDraft, overlayW, overlayH]);

  const finishManualStroke = useCallback(
    (target: HTMLElement, pointerId: number) => {
      isManualDrawingRef.current = false;
      manualPointerIdRef.current = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }

      const points = previewPointsRef.current;
      setIsManualDrawing(false);
      setCurrentPreviewPoints([]);
      setLiveStrokePoint(null);
      previewPointsRef.current = [];

      const created = finishManualDrawRef.current(points);
      if (created) onDrawCompleteRef.current?.();
    },
    [],
  );

  const finishThickLineStroke = useCallback(
    (target: HTMLElement, pointerId: number) => {
      isThickLineDrawingRef.current = false;
      manualPointerIdRef.current = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }

      const draftLine = thickLineDraftRef.current;
      setThickLineDraft(null);
      thickLineDraftRef.current = null;

      if (draftLine) {
        const created = finishThickLineDrawRef.current(draftLine, overlayW, overlayH);
        if (created) onDrawCompleteRef.current?.();
      }
    },
    [overlayW, overlayH],
  );

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Salt-okuma güvence (isAddMode zaten editingAllowed içerir; açık niyet).
      if (!editingAllowed) return;
      if (e.button !== 0 || !isAddMode || !activeOrgan) return;

      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      e.preventDefault();
      e.stopPropagation();

      if (drawShape === "free_draw") {
        const initial = [point];
        previewPointsRef.current = initial;
        isManualDrawingRef.current = true;
        manualPointerIdRef.current = e.pointerId;
        setIsManualDrawing(true);
        setCurrentPreviewPoints(initial);
        setLiveStrokePoint(point);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (drawShape === "thick_line") {
        const initial: ThickLineDraft = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
        thickLineDraftRef.current = initial;
        isThickLineDrawingRef.current = true;
        manualPointerIdRef.current = e.pointerId;
        setThickLineDraft(initial);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      overlayRef.current?.setPointerCapture(e.pointerId);
      const shape = drawShape === "rect" ? "rect" : "oval";
      setDraft({ kind: "box", shape, start: point, current: point });
    },
    [editingAllowed, isAddMode, activeOrgan, drawShape, getNormalizedPoint],
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const point = getNormalizedPoint(e.clientX, e.clientY, true);
      if (!point) return;

      if (isThickLineDrawingRef.current) {
        e.preventDefault();
        const next: ThickLineDraft = {
          x1: thickLineDraftRef.current?.x1 ?? point.x,
          y1: thickLineDraftRef.current?.y1 ?? point.y,
          x2: point.x,
          y2: point.y,
        };
        thickLineDraftRef.current = next;
        setThickLineDraft(next);
        return;
      }

      if (!isManualDrawingRef.current) return;

      e.preventDefault();
      setLiveStrokePoint(point);

      setCurrentPreviewPoints((prev) => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < FREE_DRAW_POINT_MIN_DIST) {
          return prev;
        }
        const next = [...prev, point];
        previewPointsRef.current = next;
        return next;
      });
    },
    [getNormalizedPoint],
  );

  const handleOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isThickLineDrawingRef.current) {
        e.preventDefault();
        finishThickLineStroke(e.currentTarget, e.pointerId);
        return;
      }
      if (!isManualDrawingRef.current) return;
      e.preventDefault();
      finishManualStroke(e.currentTarget, e.pointerId);
    },
    [finishManualStroke, finishThickLineStroke],
  );

  const handleOverlayPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isThickLineDrawingRef.current) {
        finishThickLineStroke(e.currentTarget, e.pointerId);
        return;
      }
      if (!isManualDrawingRef.current) return;
      finishManualStroke(e.currentTarget, e.pointerId);
    },
    [finishManualStroke, finishThickLineStroke],
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

  const handleThickLineEndpointStart = useCallback(
    (regionId: string, endpoint: ThickLineEndpoint, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const region = regions.find((r) => r.id === regionId);
      if (!region || !regionHasThickLine(region)) return;

      onSelectRegion(regionId);
      setPendingMove(null);
      lockDocumentSelection(true);
      setEditDrag({
        kind: "line-end",
        regionId,
        endpoint,
        snapshot: structuredClone(region),
      });
    },
    [isMoveMode, regions, onSelectRegion],
  );

  const handleThickLineRotateStart = useCallback(
    (regionId: string, clientX: number, clientY: number) => {
      if (!isMoveMode) return;

      const region = regions.find((r) => r.id === regionId);
      if (!region || !regionHasThickLine(region)) return;

      const point = getNormalizedPoint(clientX, clientY, true);
      if (!point) return;

      const cx = (region.x1 + region.x2) / 2;
      const cy = (region.y1 + region.y2) / 2;
      const startPointerAngle = Math.atan2(point.y - cy, point.x - cx);

      onSelectRegion(regionId);
      setPendingMove(null);
      lockDocumentSelection(true);
      setEditDrag({
        kind: "line-rotate",
        regionId,
        startPointerAngle,
        snapshot: structuredClone(region),
      });
    },
    [isMoveMode, regions, onSelectRegion, getNormalizedPoint],
  );

  useEffect(() => {
    if (!isBoxDrawing) return;

    lockDocumentSelection(true);

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const point = getNormalizedPointRef.current(e.clientX, e.clientY, true);
      if (!point) return;
      setDraft((prev) => (prev ? { ...prev, current: point } : prev));
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
  }, [isBoxDrawing]);

  useEffect(() => {
    if (!isManualDrawing && !thickLineDraft) return;
    lockDocumentSelection(true);
    return () => lockDocumentSelection(false);
  }, [isManualDrawing, thickLineDraft]);

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
        return;
      }

      if (editDrag.kind === "line-end") {
        const snap = editDrag.snapshot;
        if (!regionHasThickLine(snap)) return;
        if (editDrag.endpoint === "start") {
          onUpsertRegion({
            ...snap,
            x1: clamp01(point.x),
            y1: clamp01(point.y),
          });
        } else {
          onUpsertRegion({
            ...snap,
            x2: clamp01(point.x),
            y2: clamp01(point.y),
          });
        }
        return;
      }

      if (editDrag.kind === "line-rotate") {
        const snap = editDrag.snapshot;
        if (!regionHasThickLine(snap)) return;
        const updated = rotateThickLineByPointer(snap, point, editDrag.startPointerAngle);
        onUpsertRegion(updated);
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-violet-100/80 px-2.5 py-1 sm:px-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-gradient-to-r from-white via-violet-50/98 to-fuchsia-50/95 px-2.5 py-0.5 text-xs font-black tracking-wide text-violet-950 shadow-[0_4px_14px_-4px_rgba(91,33,182,0.28)] ring-1 ring-inset ring-white/95 backdrop-blur-md">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-400 shadow-[0_0_6px_rgba(139,92,246,0.7)]"
            aria-hidden
          />
          {canvasBadge}
        </span>
        <p className="text-xs font-semibold text-slate-700">
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
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerCancel}
              onLostPointerCapture={(e) => {
                if (manualPointerIdRef.current !== e.pointerId) return;
                if (isThickLineDrawingRef.current) {
                  finishThickLineStroke(e.currentTarget, e.pointerId);
                  return;
                }
                if (isManualDrawingRef.current) {
                  finishManualStroke(e.currentTarget, e.pointerId);
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
                    : drawShape === "thick_line"
                      ? `«${activeOrgan}» için sürükleyerek kalın çizgi çizin`
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
                  {editingAllowed
                    ? "Bu görünümde henüz çizilmiş bölge yok. Bölge Ekle ile çizmeye başlayın."
                    : "Bu görünümde çizili bölge yok. Bölge ekleme bilgisayardan yapılır."}
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
                  onThickLineEndpointStart={handleThickLineEndpointStart}
                  onThickLineRotateStart={handleThickLineRotateStart}
                />
              ))}

              {draft ? (
                <RegionDraftPreview shape={draft.shape} start={draft.start} current={draft.current} />
              ) : null}

              {isManualDrawing && displayPreviewPoints.length > 0 ? (
                <svg
                  className="pointer-events-none absolute inset-0 z-30 h-full w-full"
                  width="100%"
                  height="100%"
                  aria-hidden
                >
                  {displayPreviewPoints.length === 1 ? (
                    <circle
                      cx={displayPreviewPoints[0].x}
                      cy={displayPreviewPoints[0].y}
                      r={2}
                      fill="rgb(220, 38, 38)"
                    />
                  ) : (
                    <polyline
                      points={displayPreviewPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="rgb(220, 38, 38)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              ) : null}

              {thickLinePreviewPixels ? (
                <svg
                  className="pointer-events-none absolute inset-0 z-30 h-full w-full"
                  width="100%"
                  height="100%"
                  aria-hidden
                >
                  <line
                    x1={thickLinePreviewPixels.x1}
                    y1={thickLinePreviewPixels.y1}
                    x2={thickLinePreviewPixels.x2}
                    y2={thickLinePreviewPixels.y2}
                    stroke="rgb(220, 38, 38)"
                    strokeWidth={THICK_LINE_RENDER_STROKE_PX}
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
