"use client";

import type { Region } from "../../types";
import { regionHasBox, regionToPercentBox } from "../../utils/regionGeometry";

const SELECTED_GLOW =
  "ring-2 ring-violet-400/95 ring-offset-1 ring-offset-white/90 shadow-[0_0_24px_rgba(167,139,250,0.65)]";

type RegionShapeProps = {
  region: Region;
  isSelected: boolean;
  interactive: boolean;
  moveMode: boolean;
  onSelect: (id: string) => void;
  onMoveStart?: (id: string, clientX: number, clientY: number) => void;
};

export function RegionShape({
  region,
  isSelected,
  interactive,
  moveMode,
  onSelect,
  onMoveStart,
}: RegionShapeProps) {
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (!interactive) return;
    if (moveMode && onMoveStart) {
      onMoveStart(id, e.clientX, e.clientY);
      return;
    }
    onSelect(id);
  };
  const color = region.color ?? "rgba(196, 181, 253, 0.55)";
  const label = region.organ;

  if (region.shape === "free_draw" && region.points && region.points.length >= 2) {
    const pointsAttr = region.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

    return (
      <button
        type="button"
        onPointerDown={(e) => handlePointerDown(e, region.id)}
        className={`absolute inset-0 transition-all duration-200 ${
          interactive ? (moveMode ? "cursor-move" : "cursor-pointer") : "pointer-events-none"
        } ${isSelected ? "z-20" : "z-10"}`}
        aria-label={label}
        title={label}
      >
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={pointsAttr}
            fill="none"
            stroke={isSelected ? "rgba(124, 58, 237, 0.95)" : color.replace(/[\d.]+\)$/, "0.85)")}
            strokeWidth={isSelected ? 1.8 : 1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {isSelected ? (
          <span className="pointer-events-none absolute left-1 top-1 max-w-[90%] truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-violet-950 shadow-sm">
            {label}
          </span>
        ) : null}
        {isSelected ? (
          <span
            className={`pointer-events-none absolute inset-0 rounded ${SELECTED_GLOW}`}
            aria-hidden
          />
        ) : null}
      </button>
    );
  }

  const box = regionToPercentBox(region);
  if (!box) return null;

  const isOval = region.shape === "oval";

  return (
    <button
      type="button"
      onPointerDown={(e) => handlePointerDown(e, region.id)}
      className={`absolute flex items-center justify-center transition-all duration-200 ${
        interactive ? (moveMode ? "cursor-move hover:brightness-105" : "cursor-pointer hover:brightness-105") : "pointer-events-none"
      } ${isSelected ? `z-20 scale-[1.02] ${SELECTED_GLOW}` : "z-10 opacity-80 hover:opacity-90"}`}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: box.transform,
        transformOrigin: "center center",
        borderRadius: isOval ? 9999 : 4,
        backgroundColor: isSelected ? color.replace(/[\d.]+\)$/, "0.78)") : color,
      }}
      aria-label={label}
      title={label}
    >
      <span className="pointer-events-none max-w-[92%] truncate px-1 text-center text-[10px] font-bold leading-tight text-slate-900 sm:text-[11px]">
        {label}
      </span>
    </button>
  );
}

/** Sürükleme önizlemesi */
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
      className="pointer-events-none absolute border-2 border-dashed border-violet-500/80 bg-violet-300/25"
      style={{
        left: `${cx - rx}%`,
        top: `${cy - ry}%`,
        width: `${rx * 2}%`,
        height: `${ry * 2}%`,
        borderRadius: shape === "oval" ? 9999 : 4,
      }}
    />
  );
}

export function FreeDrawDraftPreview({ points }: { points: { x: number; y: number }[] }) {
  if (points.length < 2) return null;
  const pointsAttr = points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  return (
    <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
      <polyline
        points={pointsAttr}
        fill="none"
        stroke="rgba(124, 58, 237, 0.85)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
