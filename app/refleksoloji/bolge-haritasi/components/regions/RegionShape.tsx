"use client";

import type { Region } from "../../types";
import { regionHasBox, regionToPercentBox } from "../../utils/regionGeometry";
import {
  REGION_FILL,
  REGION_FREE_STROKE_WIDTH,
  REGION_SELECTED_SHADOW,
  REGION_STROKE,
  REGION_STROKE_WIDTH,
} from "../../utils/regionStyles";
import type { ResizeHandle } from "../../utils/regionTransform";
import { RegionHandles } from "./RegionHandles";

type RegionShapeProps = {
  region: Region;
  isSelected: boolean;
  interactive: boolean;
  moveMode: boolean;
  showEditHandles: boolean;
  onSelect: (id: string) => void;
  onMoveStart?: (id: string, clientX: number, clientY: number) => void;
  onResizeStart?: (id: string, handle: ResizeHandle, clientX: number, clientY: number) => void;
  onRotateStart?: (id: string, clientX: number, clientY: number) => void;
};

export function RegionShape({
  region,
  isSelected,
  interactive,
  moveMode,
  showEditHandles,
  onSelect,
  onMoveStart,
  onResizeStart,
  onRotateStart,
}: RegionShapeProps) {
  const label = region.organ;

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!interactive) return;
    if (moveMode && onMoveStart) {
      onMoveStart(region.id, e.clientX, e.clientY);
      return;
    }
    onSelect(region.id);
  };

  if (region.shape === "free_draw" && region.points && region.points.length >= 1) {
    const pointsAttr = region.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
    const showLine = region.points.length >= 2;

    return (
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        onPointerDown={handleBodyPointerDown}
        className={`absolute inset-0 ${interactive ? (moveMode ? "cursor-move" : "cursor-pointer") : "pointer-events-none"} ${
          isSelected ? "z-20" : "z-10"
        }`}
        aria-label={label}
        title={label}
      >
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {showLine ? (
            <polyline
              points={pointsAttr}
              fill="none"
              stroke={REGION_STROKE}
              strokeWidth={REGION_FREE_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle
              cx={region.points[0].x * 100}
              cy={region.points[0].y * 100}
              r={1.2}
              fill={REGION_STROKE}
            />
          )}
        </svg>
        {isSelected ? (
          <span className="pointer-events-none absolute left-1 top-1 max-w-[90%] truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-red-950 shadow-sm">
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  const box = regionToPercentBox(region);
  if (!box) return null;

  const isOval = region.shape === "oval";
  const handlesVisible = showEditHandles && isSelected && regionHasBox(region);

  return (
    <div
      className={`absolute ${interactive ? "" : "pointer-events-none"} ${isSelected ? "z-20" : "z-10"}`}
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
          backgroundColor: REGION_FILL,
          borderColor: REGION_STROKE,
          borderWidth: REGION_STROKE_WIDTH,
          boxShadow: isSelected ? REGION_SELECTED_SHADOW : undefined,
        }}
        aria-label={label}
        title={label}
      >
        <span className="pointer-events-none max-w-[92%] truncate px-1 text-center text-[10px] font-bold leading-tight text-red-950 sm:text-[11px]">
          {label}
        </span>
      </div>

      {handlesVisible && onResizeStart && onRotateStart ? (
        <RegionHandles
          onResizeStart={(handle, clientX, clientY) => onResizeStart(region.id, handle, clientX, clientY)}
          onRotateStart={(clientX, clientY) => onRotateStart(region.id, clientX, clientY)}
        />
      ) : null}
    </div>
  );
}

/** Sürükleme önizlemesi — kırmızı */
export function RegionDraftPreview({
  shape,
  start,
  current,
}: {
  shape: "oval" | "rect";
  start: { x: number; y: number };
  current: { x: number; y: number };
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
        backgroundColor: REGION_FILL,
        border: `${REGION_STROKE_WIDTH}px solid ${REGION_STROKE}`,
      }}
    />
  );
}

/** Manuel çizim canlı önizleme — 1+ nokta */
export function FreeDrawDraftPreview({ points }: { points: { x: number; y: number }[] }) {
  if (points.length === 0) return null;

  if (points.length === 1) {
    return (
      <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
        <circle
          cx={points[0].x * 100}
          cy={points[0].y * 100}
          r={1.5}
          fill={REGION_STROKE}
        />
      </svg>
    );
  }

  const pointsAttr = points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  return (
    <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={REGION_STROKE}
        strokeWidth={REGION_FREE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
