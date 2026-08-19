"use client";

import type { BodyMark } from "../types";
import { markToPercentBox } from "../geometry/markGeometry";
import type { ResizeHandle } from "../geometry/markTransform";
import { MarkHandles } from "./MarkHandles";

/**
 * Tek işaret (placement) renderer — kutu (oval/rect). Refleksoloji RegionShape
 * eşleniği ama alan-özel (organ) alan yok; etiket + renk parametrik.
 */

export type MarkColors = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  selectedShadow: string;
  labelText: string;
};

export const DEFAULT_MARK_COLORS: MarkColors = {
  // Kupa & Hacamat çalışma dili: sıcak amber/kızıl noktalar (kırmızı değil — modül kimliği).
  fill: "rgba(217, 119, 6, 0.28)",
  stroke: "#b45309",
  strokeWidth: 2,
  selectedShadow: "0 0 0 2px rgba(180,83,9,0.35), 0 0 14px rgba(217,119,6,0.55)",
  labelText: "#451a03",
};

type MarkShapeProps = {
  mark: BodyMark;
  isSelected: boolean;
  interactive: boolean;
  moveMode: boolean;
  showEditHandles: boolean;
  colors?: MarkColors;
  showLabel?: boolean;
  onSelect: (id: string) => void;
  onMovePointerDown?: (id: string, clientX: number, clientY: number) => void;
  onResizeStart?: (id: string, handle: ResizeHandle, clientX: number, clientY: number) => void;
  onRotateStart?: (id: string, clientX: number, clientY: number) => void;
};

export function MarkShape({
  mark,
  isSelected,
  interactive,
  moveMode,
  showEditHandles,
  colors = DEFAULT_MARK_COLORS,
  showLabel = true,
  onSelect,
  onMovePointerDown,
  onResizeStart,
  onRotateStart,
}: MarkShapeProps) {
  const box = markToPercentBox(mark);
  const isOval = mark.shape === "oval";
  const stroke = mark.color ?? colors.stroke;
  const handlesVisible = showEditHandles && isSelected && interactive;

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!interactive) return;
    if (moveMode && onMovePointerDown) {
      onMovePointerDown(mark.id, e.clientX, e.clientY);
      return;
    }
    onSelect(mark.id);
  };

  return (
    <div
      className={`absolute touch-none select-none ${interactive ? "" : "pointer-events-none"} ${isSelected ? "z-20" : "z-10"}`}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: box.transform,
        transformOrigin: "center center",
      }}
    >
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        onPointerDown={handleBodyPointerDown}
        className={`absolute inset-0 flex items-center justify-center border-2 transition-shadow ${
          interactive ? (moveMode ? "cursor-move" : "cursor-pointer") : ""
        }`}
        style={{
          borderRadius: isOval ? 9999 : 4,
          backgroundColor: colors.fill,
          borderColor: stroke,
          borderWidth: colors.strokeWidth,
          boxShadow: isSelected ? colors.selectedShadow : undefined,
        }}
        aria-label={mark.label}
        title={mark.label}
      >
        {showLabel && mark.label ? (
          <span
            className="pointer-events-none max-w-[92%] truncate px-1 text-center text-[10px] font-bold leading-tight sm:text-[11px]"
            style={{ color: colors.labelText }}
          >
            {mark.label}
          </span>
        ) : null}
      </div>

      {handlesVisible && onResizeStart && onRotateStart ? (
        <MarkHandles
          color={stroke}
          onResizeStart={(handle, clientX, clientY) => onResizeStart(mark.id, handle, clientX, clientY)}
          onRotateStart={(clientX, clientY) => onRotateStart(mark.id, clientX, clientY)}
        />
      ) : null}
    </div>
  );
}

/** Sürükleme önizlemesi (yeni işaret oluştururken). */
export function MarkDraftPreview({
  shape,
  start,
  current,
  colors = DEFAULT_MARK_COLORS,
}: {
  shape: "oval" | "rect";
  start: { x: number; y: number };
  current: { x: number; y: number };
  colors?: MarkColors;
}) {
  const cx = ((start.x + current.x) / 2) * 100;
  const cy = ((start.y + current.y) / 2) * 100;
  const rx = (Math.abs(current.x - start.x) / 2) * 100;
  const ry = (Math.abs(current.y - start.y) / 2) * 100;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: `${cx - rx}%`,
        top: `${cy - ry}%`,
        width: `${rx * 2}%`,
        height: `${ry * 2}%`,
        borderRadius: shape === "oval" ? 9999 : 4,
        backgroundColor: colors.fill,
        border: `${colors.strokeWidth}px solid ${colors.stroke}`,
      }}
    />
  );
}
