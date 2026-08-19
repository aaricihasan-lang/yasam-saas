"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BodyMark, MarkGeometry, MarkShape, MarkToolMode } from "../types";
import { computeObjectContainRect, type ContainRect } from "../geometry/containRect";
import { pointerToImageNormalized } from "../geometry/normalizePointer";
import { boxFromDrag } from "../geometry/markGeometry";
import {
  moveMarkByDelta,
  resizeMarkByHandle,
  rotateMarkByPointer,
  type ResizeHandle,
} from "../geometry/markTransform";
import { DEFAULT_MARK_COLORS, MarkDraftPreview, MarkShape as MarkShapeView, type MarkColors } from "./MarkShape";

/**
 * GENERIC BODY-MAP CANVAS — refleksoloji FootCanvas etkileşim modelinin alan-bağımsız
 * karşılığı. Sabit anatomik SVG silhouette zemini üzerinde işaret (placement) yerleştirme:
 *   - select / create (tıkla-bırak veya sürükle) / drag-move / resize / rotate
 *   - responsive object-contain normalizasyonu (ResizeObserver)
 *   - aynı haritada çoklu işaret
 *
 * Controlled: `marks` prop'tan gelir (yalnız `mapKey` haritasına ait olanlar verilmelidir).
 * Canlı jest sırasında yerel `liveMark` render edilir; jest bitince onUpdate ile commit edilir.
 * Motor alan-özel hiçbir şey bilmez (organ/foot/view yok).
 */

const MOVE_DRAG_THRESHOLD = 3; // px

type EditDrag =
  | { kind: "move"; id: string; startNorm: { x: number; y: number }; snapshot: BodyMark }
  | { kind: "resize"; id: string; handle: ResizeHandle; snapshot: BodyMark }
  | { kind: "rotate"; id: string; snapshot: BodyMark };

export type BodyMapCanvasProps = {
  mapKey: string;
  marks: BodyMark[];
  /** Sabit silhouette çizimi (viewBox contentWidth×contentHeight ile aynı orana sahip olmalı). */
  background: React.ReactNode;
  /** Silhouette viewBox oranı için içerik boyutu (contain-rect hesabı). */
  contentWidth?: number;
  contentHeight?: number;
  toolMode: MarkToolMode;
  drawShape?: MarkShape;
  selectedId?: string | null;
  colors?: MarkColors;
  readOnly?: boolean;
  showLabels?: boolean;
  onSelect?: (id: string | null) => void;
  /** Yeni işaret geometrisi (id/label/mapKey çağıran tarafından atanır). */
  onCreate?: (geometry: MarkGeometry) => void;
  /** Taşı/boyutlandır/döndür sonrası kalıcı güncelleme. */
  onUpdate?: (id: string, patch: Partial<BodyMark>) => void;
};

export function BodyMapCanvas({
  marks,
  background,
  contentWidth = 480,
  contentHeight = 800,
  toolMode,
  drawShape = "oval",
  selectedId = null,
  colors = DEFAULT_MARK_COLORS,
  readOnly = false,
  showLabels = true,
  onSelect,
  onCreate,
  onUpdate,
}: BodyMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<{ shape: MarkShape; start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [liveMark, setLiveMark] = useState<BodyMark | null>(null);

  const editRef = useRef<EditDrag | null>(null);
  const pendingMoveRef = useRef<{ id: string; clientX: number; clientY: number } | null>(null);

  const interactive = !readOnly;

  // ── Responsive ölçüm ──────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imageRect: ContainRect = computeObjectContainRect(
    containerSize.w,
    containerSize.h,
    contentWidth,
    contentHeight,
  );

  const toNorm = useCallback(
    (clientX: number, clientY: number, clamp = true): { x: number; y: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return pointerToImageNormalized(clientX, clientY, rect, imageRect, { clamp });
    },
    [imageRect],
  );

  // ── Draft (yeni işaret) hareketi ──────────────────────────────────────────
  useEffect(() => {
    if (!draft) return;
    const onMove = (e: PointerEvent) => {
      const p = toNorm(e.clientX, e.clientY, true);
      if (p) setDraft((d) => (d ? { ...d, current: p } : d));
    };
    const onUp = (e: PointerEvent) => {
      const p = toNorm(e.clientX, e.clientY, true);
      const finalDraft = p ? { ...draft, current: p } : draft;
      const geom = boxFromDrag(finalDraft.start, finalDraft.current, finalDraft.shape);
      onCreate?.(geom);
      setDraft(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draft, toNorm, onCreate]);

  // ── Edit (move/resize/rotate) hareketi ────────────────────────────────────
  useEffect(() => {
    const active = editRef.current;
    if (!liveMark || !active) return;
    const onMove = (e: PointerEvent) => {
      const p = toNorm(e.clientX, e.clientY, true);
      if (!p) return;
      const cur = editRef.current;
      if (!cur) return;
      if (cur.kind === "move") {
        const dx = p.x - cur.startNorm.x;
        const dy = p.y - cur.startNorm.y;
        setLiveMark(moveMarkByDelta(cur.snapshot, dx, dy));
      } else if (cur.kind === "resize") {
        setLiveMark(resizeMarkByHandle(cur.snapshot, cur.handle, p));
      } else if (cur.kind === "rotate") {
        setLiveMark(rotateMarkByPointer(cur.snapshot, p));
      }
    };
    const onUp = () => {
      const cur = editRef.current;
      setLiveMark((final) => {
        if (cur && final) {
          onUpdate?.(cur.id, {
            cx: final.cx,
            cy: final.cy,
            rx: final.rx,
            ry: final.ry,
            angle: final.angle,
          });
        }
        return null;
      });
      editRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [liveMark, toNorm, onUpdate]);

  // ── Overlay pointer down (boş alan): add → draft başlat; diğer → deselect ──
  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    if (toolMode === "add") {
      const p = toNorm(e.clientX, e.clientY, true);
      if (!p) return;
      e.preventDefault();
      setDraft({ shape: drawShape, start: p, current: p });
    } else {
      onSelect?.(null);
    }
  };

  // ── İşaret gövdesine tıklama (select veya move başlat) ─────────────────────
  const startMove = (id: string, clientX: number, clientY: number) => {
    pendingMoveRef.current = { id, clientX, clientY };
    const onMove = (e: PointerEvent) => {
      const pend = pendingMoveRef.current;
      if (!pend) return;
      const dist = Math.hypot(e.clientX - pend.clientX, e.clientY - pend.clientY);
      if (dist < MOVE_DRAG_THRESHOLD) return;
      const snapshot = marks.find((m) => m.id === pend.id);
      const startNorm = toNorm(pend.clientX, pend.clientY, true);
      pendingMoveRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!snapshot || !startNorm) return;
      onSelect?.(snapshot.id);
      editRef.current = { kind: "move", id: snapshot.id, startNorm, snapshot };
      setLiveMark(snapshot);
    };
    const onUp = () => {
      // Eşiği geçmeden bırakıldı → yalnız seç.
      if (pendingMoveRef.current) {
        onSelect?.(pendingMoveRef.current.id);
        pendingMoveRef.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleResizeStart = (id: string, handle: ResizeHandle) => {
    const snapshot = marks.find((m) => m.id === id);
    if (!snapshot) return;
    editRef.current = { kind: "resize", id, handle, snapshot };
    setLiveMark(snapshot);
  };

  const handleRotateStart = (id: string) => {
    const snapshot = marks.find((m) => m.id === id);
    if (!snapshot) return;
    editRef.current = { kind: "rotate", id, snapshot };
    setLiveMark(snapshot);
  };

  const moveMode = toolMode === "move";
  const showEditHandles = toolMode === "move" || toolMode === "select";

  const overlayStyle: React.CSSProperties = {
    left: imageRect.left,
    top: imageRect.top,
    width: imageRect.width,
    height: imageRect.height,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ touchAction: draft || liveMark ? "none" : undefined }}
    >
      {/* Silhouette zemin — contain-rect'e yerleşir */}
      <div className="pointer-events-none absolute" style={overlayStyle}>
        {background}
      </div>

      {/* İşaret overlay'i */}
      <div
        className={`absolute ${toolMode === "add" && interactive ? "cursor-crosshair" : ""}`}
        style={overlayStyle}
        onPointerDown={handleOverlayPointerDown}
      >
        {marks.map((m) => {
          const render = liveMark && liveMark.id === m.id ? liveMark : m;
          return (
            <MarkShapeView
              key={m.id}
              mark={render}
              isSelected={selectedId === m.id}
              interactive={interactive}
              moveMode={moveMode}
              showEditHandles={showEditHandles}
              colors={colors}
              showLabel={showLabels}
              onSelect={(id) => onSelect?.(id)}
              onMovePointerDown={startMove}
              onResizeStart={handleResizeStart}
              onRotateStart={handleRotateStart}
            />
          );
        })}

        {draft ? (
          <MarkDraftPreview shape={draft.shape} start={draft.start} current={draft.current} colors={colors} />
        ) : null}
      </div>
    </div>
  );
}
