"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_IMAGE_SRC,
  atlasBackgroundLabel,
  resolveAtlasBackgroundKey,
} from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { computeObjectContainRect } from "@/app/refleksoloji/bolge-haritasi/utils/imageContainRect";
import type { ProtocolDisplayRegion, ProtocolFootView } from "../types";

const REGION_FILL = "rgba(239, 68, 68, 0.28)";
const REGION_STROKE = "rgb(220, 38, 38)";

type ProtocolFootMapProps = {
  regions: ProtocolDisplayRegion[];
  footView: ProtocolFootView;
  highlightOrgan: string | null;
  activeOrganName: string | null;
};

export function ProtocolFootMap({
  regions,
  footView,
  highlightOrgan,
  activeOrganName,
}: ProtocolFootMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const backgroundKey = resolveAtlasBackgroundKey(footView, activeOrganName);
  const imageSrc = ATLAS_IMAGE_SRC[backgroundKey];
  const imageLabel = atlasBackgroundLabel(backgroundKey);

  const imageRect = useMemo(
    () => computeObjectContainRect(containerSize.w, containerSize.h, naturalSize.w, naturalSize.h),
    [containerSize, naturalSize],
  );

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

  const overlayStyle = useMemo(
    () => ({
      left: imageRect.left,
      top: imageRect.top,
      width: imageRect.width,
      height: imageRect.height,
    }),
    [imageRect],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70">
      <div className="shrink-0 border-b border-violet-100/80 px-3 py-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-800">Ayak Haritası</p>
        <p className="text-sm font-semibold text-slate-600">{imageLabel}</p>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1 bg-white">
        <img
          src={imageSrc}
          alt={imageLabel}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />

        {imageRect.width > 0 ? (
          <div className="absolute z-10" style={overlayStyle}>
            {regions.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-sm font-medium text-slate-500">
                Bu görünümde gösterilecek bölge yok.
              </p>
            ) : (
              regions.map((region) => {
                const isHighlight =
                  !highlightOrgan || region.organ.toLocaleLowerCase("tr") === highlightOrgan.toLocaleLowerCase("tr");
                const left = (region.cx - region.rx) * 100;
                const top = (region.cy - region.ry) * 100;
                const width = region.rx * 2 * 100;
                const height = region.ry * 2 * 100;

                return (
                  <div
                    key={region.id}
                    className="pointer-events-none absolute transition-opacity duration-200"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      opacity: isHighlight ? 1 : 0.35,
                    }}
                  >
                    <div
                      className="h-full w-full border-2"
                      style={{
                        borderRadius: region.shape === "oval" ? 9999 : 6,
                        backgroundColor: REGION_FILL,
                        borderColor: REGION_STROKE,
                        boxShadow: isHighlight ? "0 0 16px rgba(239,68,68,0.55)" : undefined,
                      }}
                      title={region.organ}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
