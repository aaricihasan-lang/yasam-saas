"use client";

import type { Region } from "../../types";
import { getPointsBounds, regionHasBox, regionToPercentBox } from "../../utils/regionGeometry";
import {
  REGION_FILL,
  REGION_FREE_STROKE_WIDTH,
  REGION_SELECTED_SHADOW,
  REGION_STROKE,
  REGION_STROKE_WIDTH,
} from "../../utils/regionStyles";
import type { ResizeHandle } from "../../utils/regionTransform";
import { RegionHandles } from "./RegionHandles";

const HANDLE_CLASS =
  "absolute z-30 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-red-600 shadow-sm touch-none";

type ThickLineEndpoint = "start" | "end";

type RegionShapeProps = {
  region: Region;
  isSelected: boolean;
  interactive: boolean;
  moveMode: boolean;
  showEditHandles: boolean;
  onSelect: (id: string) => void;
  onMovePointerDown?: (id: string, clientX: number, clientY: number) => void;
  onResizeStart?: (id: string, handle: ResizeHandle, clientX: number, clientY: number) => void;
  onRotateStart?: (id: string, clientX: number, clientY: number) => void;
  onThickLineEndpointStart?: (
    id: string,
    endpoint: ThickLineEndpoint,
    clientX: number,
    clientY: number,
  ) => void;
  onThickLineRotateStart?: (id: string, clientX: number, clientY: number) => void;
};

export function regionHasThickLine(
  region: Region,
): region is Region & { x1: number; y1: number; x2: number; y2: number; lineWidth: number } {
  return (
    region.shape === "thick_line" &&
    typeof region.x1 === "number" &&
    typeof region.y1 === "number" &&
    typeof region.x2 === "number" &&
    typeof region.y2 === "number" &&
    typeof region.lineWidth === "number"
  );
}

export function RegionShape({
  region,
  isSelected,
  interactive,
  moveMode,
  showEditHandles,
  onSelect,
  onMovePointerDown,
  onResizeStart,
  onRotateStart,
  onThickLineEndpointStart,
  onThickLineRotateStart,
}: RegionShapeProps) {
  const label = region.organ;

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!interactive) return;

    if (moveMode && onMovePointerDown) {
      onMovePointerDown(region.id, e.clientX, e.clientY);
      return;
    }
    onSelect(region.id);
  };

  if (regionHasThickLine(region)) {
    const { x1, y1, x2, y2, lineWidth } = region;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const strokeW = Math.max(2, lineWidth * 100 * 1.05);
    const hitStrokeW = Math.max(12, lineWidth * 100 * 5);
    const handlesVisible = showEditHandles && isSelected && interactive;

    return (
      <div
        className={`absolute inset-0 touch-none select-none ${interactive ? "" : "pointer-events-none"} ${isSelected ? "z-20" : "z-10"}`}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <line
            x1={x1 * 100}
            y1={y1 * 100}
            x2={x2 * 100}
            y2={y2 * 100}
            stroke={REGION_STROKE}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={
              isSelected
                ? { filter: "drop-shadow(0 0 6px rgba(239,68,68,0.9)) drop-shadow(0 0 14px rgba(239,68,68,0.45))" }
                : undefined
            }
          />
        </svg>

        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={x1 * 100}
            y1={y1 * 100}
            x2={x2 * 100}
            y2={y2 * 100}
            stroke="transparent"
            strokeWidth={hitStrokeW}
            strokeLinecap="round"
            className={interactive ? (moveMode ? "cursor-move" : "cursor-pointer") : ""}
            onPointerDown={handleBodyPointerDown}
          />
        </svg>

        {handlesVisible ? (
          <>
            <button
              type="button"
              aria-label="Çizgi başlangıcı"
              className={`${HANDLE_CLASS} cursor-crosshair`}
              style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onThickLineEndpointStart?.(region.id, "start", e.clientX, e.clientY);
              }}
            />
            <button
              type="button"
              aria-label="Çizgi bitişi"
              className={`${HANDLE_CLASS} cursor-crosshair`}
              style={{ left: `${x2 * 100}%`, top: `${y2 * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onThickLineEndpointStart?.(region.id, "end", e.clientX, e.clientY);
              }}
            />
            <button
              type="button"
              aria-label="Çizgiyi döndür"
              className="absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow-md touch-none"
              style={{
                left: `${midX * 100}%`,
                top: `${midY * 100}%`,
                transform: "translate(-50%, calc(-50% - 10px))",
                cursor: "grab",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onThickLineRotateStart?.(region.id, e.clientX, e.clientY);
              }}
            />
          </>
        ) : null}

        {isSelected ? (
          <span
            className="pointer-events-none absolute z-30 max-w-[40%] truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-red-950 shadow-sm"
            style={{ left: `${midX * 100}%`, top: `${midY * 100}%`, transform: "translate(-50%, -120%)" }}
          >
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  if (region.shape === "free_draw" && region.points && region.points.length >= 1) {
    const pointsAttr = region.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
    const showLine = region.points.length >= 2;
    const bounds = getPointsBounds(region.points);

    return (
      <div
        className={`absolute ${interactive ? "" : "pointer-events-none"} ${isSelected ? "z-20" : "z-10"}`}
        style={{
          left: `${bounds.minX * 100}%`,
          top: `${bounds.minY * 100}%`,
          width: `${(bounds.maxX - bounds.minX) * 100}%`,
          height: `${(bounds.maxY - bounds.minY) * 100}%`,
        }}
      >
        <div
          role="button"
          tabIndex={interactive ? 0 : -1}
          onPointerDown={handleBodyPointerDown}
          className={`absolute inset-0 touch-none select-none ${interactive ? (moveMode ? "cursor-move" : "cursor-pointer") : ""}`}
          aria-label={label}
          title={label}
        >
          <svg
            className="absolute h-full w-full overflow-visible"
            viewBox={`${bounds.minX * 100} ${bounds.minY * 100} ${(bounds.maxX - bounds.minX) * 100} ${(bounds.maxY - bounds.minY) * 100}`}
            preserveAspectRatio="none"
          >
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
            <span className="pointer-events-none absolute left-0 top-0 max-w-[90%] truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-red-950 shadow-sm">
              {label}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const box = regionToPercentBox(region);
  if (!box) return null;

  const isOval = region.shape === "oval";
  const handlesVisible = showEditHandles && isSelected && regionHasBox(region);

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

/** Manuel çizim canlı önizleme */
export function FreeDrawDraftPreview({ points }: { points: { x: number; y: number }[] }) {
  if (points.length === 0) return null;

  if (points.length === 1) {
    return (
      <svg className="pointer-events-none absolute inset-0 z-[35] h-full w-full overflow-visible">
        <circle cx={points[0].x * 100} cy={points[0].y * 100} r={1.5} fill={REGION_STROKE} />
      </svg>
    );
  }

  const pointsAttr = points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  return (
    <svg className="pointer-events-none absolute inset-0 z-[35] h-full w-full overflow-visible">
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
