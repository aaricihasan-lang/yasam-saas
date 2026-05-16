"use client";

import type { ResizeHandle } from "../../utils/regionTransform";

const HANDLE_CLASS =
  "absolute z-30 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-red-600 shadow-sm";

type RegionHandlesProps = {
  onResizeStart: (handle: ResizeHandle, clientX: number, clientY: number) => void;
  onRotateStart: (clientX: number, clientY: number) => void;
};

const HANDLES: { id: ResizeHandle; className: string; cursor: string }[] = [
  { id: "tl", className: "left-0 top-0", cursor: "nwse-resize" },
  { id: "t", className: "left-1/2 top-0", cursor: "ns-resize" },
  { id: "tr", className: "left-full top-0", cursor: "nesw-resize" },
  { id: "r", className: "left-full top-1/2", cursor: "ew-resize" },
  { id: "br", className: "left-full top-full", cursor: "nwse-resize" },
  { id: "b", className: "left-1/2 top-full", cursor: "ns-resize" },
  { id: "bl", className: "left-0 top-full", cursor: "nesw-resize" },
  { id: "l", className: "left-0 top-1/2", cursor: "ew-resize" },
];

export function RegionHandles({ onResizeStart, onRotateStart }: RegionHandlesProps) {
  return (
    <>
      {HANDLES.map((h) => (
        <button
          key={h.id}
          type="button"
          aria-label={`Boyutlandır: ${h.id}`}
          className={`${HANDLE_CLASS} ${h.className}`}
          style={{ cursor: h.cursor }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onResizeStart(h.id, e.clientX, e.clientY);
          }}
        />
      ))}
      <button
        type="button"
        aria-label="Döndür"
        className="absolute left-1/2 top-0 z-30 h-3 w-3 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-full border-2 border-white bg-red-500 shadow-md"
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRotateStart(e.clientX, e.clientY);
        }}
      />
    </>
  );
}
