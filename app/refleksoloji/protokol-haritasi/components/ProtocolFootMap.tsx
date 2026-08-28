"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_IMAGE_SRC,
  atlasBackgroundLabel,
  resolveAtlasBackgroundKey,
} from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { computeObjectContainRect } from "@/app/refleksoloji/bolge-haritasi/utils/imageContainRect";
import { THICK_LINE_RENDER_STROKE_PX } from "@/app/refleksoloji/bolge-haritasi/types";
import { REGION_FREE_STROKE_WIDTH } from "@/app/refleksoloji/bolge-haritasi/utils/regionStyles";
import type { ColoredDisplayRegion, ProtocolFootView } from "../types";

type ProtocolFootMapProps = {
  regions: ColoredDisplayRegion[];
  footView: ProtocolFootView;
  missingOrgans: string[];
  onFootViewChange: (view: ProtocolFootView) => void;
  /** Kayıtlı protokol detay — daha belirgin görünüm kontrolleri */
  prominentControls?: boolean;
  /** Üst kart başlığı dışarıda — çift başlık ve fazla çerçeveyi kaldırır */
  embedded?: boolean;
};

export function ProtocolFootMap({
  regions,
  footView,
  missingOrgans,
  onFootViewChange,
  prominentControls = false,
  embedded = false,
}: ProtocolFootMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const backgroundKey = resolveAtlasBackgroundKey(footView, null);
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

  const shellClass = embedded
    ? "flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
    : "flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/90 bg-white/80 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70";

  return (
    <div className={shellClass}>
      <div
        className={`shrink-0 border-b border-violet-100/80 ${embedded ? "px-2.5 py-2" : "px-3 py-2"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {embedded ? (
              <p className="text-xs font-bold text-violet-800">{imageLabel}</p>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">
                  Ayak Haritası Önizleme
                </p>
                <p className="text-xs font-semibold text-slate-600">{imageLabel}</p>
              </>
            )}
          </div>
          <div className={`flex gap-1.5 ${prominentControls ? "rounded-2xl bg-violet-100/60 p-1.5 ring-1 ring-violet-200/80" : ""}`}>
            <button
              type="button"
              onClick={() => onFootViewChange("taban")}
              aria-pressed={footView === "taban"}
              className={
                prominentControls
                  ? `rounded-xl border-2 px-4 py-2 text-sm font-black shadow-md transition ${
                      footView === "taban"
                        ? "border-fuchsia-500 bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white"
                        : "border-violet-200 bg-white text-violet-900 hover:bg-violet-50"
                    }`
                  : `rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      footView === "taban"
                        ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                        : "border-violet-200/80 bg-violet-50/80 text-violet-800"
                    }`
              }
            >
              Taban
            </button>
            <button
              type="button"
              onClick={() => onFootViewChange("yan")}
              aria-pressed={footView === "yan"}
              className={
                prominentControls
                  ? `rounded-xl border-2 px-4 py-2 text-sm font-black shadow-md transition ${
                      footView === "yan"
                        ? "border-fuchsia-500 bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white"
                        : "border-violet-200 bg-white text-violet-900 hover:bg-violet-50"
                    }`
                  : `rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      footView === "yan"
                        ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                        : "border-violet-200/80 bg-violet-50/80 text-violet-800"
                    }`
              }
            >
              Yan
            </button>
          </div>
        </div>
      </div>

      {missingOrgans.length > 0 ? (
        <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/95 px-3 py-2">
          <p className="text-xs font-bold text-amber-950">
            Atlas bulunamayan organlar: {missingOrgans.join(", ")}
          </p>
          <p className="mt-0.5 text-xs font-medium text-amber-900/90">
            Bu organ için atlas bölgesi kayıtlı değil. Önce{" "}
            <Link href="/refleksoloji/bolge-haritasi" className="font-bold underline hover:text-amber-950">
              Bölge Haritası
            </Link>
            &apos;ndan organ bölgesi ekleyin.
          </p>
        </div>
      ) : null}

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
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-base font-medium text-slate-500">
                Organ ekleyin; kayıtlı atlas bölgeleri burada renkli gösterilir.
              </p>
            ) : (
              <>
                {/* oval / rect — kutu (mevcut davranış, regresyonsuz) */}
                {regions
                  .filter(
                    (r) =>
                      (r.shape === "oval" || r.shape === "rect") &&
                      r.cx != null &&
                      r.cy != null &&
                      r.rx != null &&
                      r.ry != null,
                  )
                  .map((region) => {
                    const left = (region.cx! - region.rx!) * 100;
                    const top = (region.cy! - region.ry!) * 100;
                    const width = region.rx! * 2 * 100;
                    const height = region.ry! * 2 * 100;
                    // Atlas ile parite: Bölge Haritası/Kayıtlı Atlas oval/rect döndürmeyi
                    // (RegionShape) merkez etrafında uygular. Aynı contract'ı burada da uygula.
                    const angle = region.angle ?? 0;

                    return (
                      <div
                        key={region.id}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                          transform: angle !== 0 ? `rotate(${angle}deg)` : undefined,
                          transformOrigin: "center center",
                        }}
                      >
                        <div
                          className="h-full w-full border-2"
                          style={{
                            borderRadius: region.shape === "oval" ? 9999 : 6,
                            backgroundColor: region.fill,
                            borderColor: region.stroke,
                            boxShadow: prominentControls
                              ? `0 0 22px ${region.stroke}88, 0 0 8px ${region.fill}`
                              : `0 0 14px ${region.stroke}55`,
                          }}
                          title={region.organ}
                        />
                      </div>
                    );
                  })}

                {/* free_draw / thick_line — SVG (Bölge Haritası geometrisiyle aynı) */}
                {regions.some((r) => r.shape === "free_draw" || r.shape === "thick_line") ? (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    {regions.map((region) => {
                      if (
                        region.shape === "free_draw" &&
                        region.points &&
                        region.points.length >= 1
                      ) {
                        if (region.points.length === 1) {
                          return (
                            <circle
                              key={region.id}
                              cx={region.points[0].x * 100}
                              cy={region.points[0].y * 100}
                              r={1.2}
                              fill={region.stroke}
                            />
                          );
                        }
                        const pts = region.points
                          .map((p) => `${p.x * 100},${p.y * 100}`)
                          .join(" ");
                        return (
                          <polyline
                            key={region.id}
                            points={pts}
                            fill="none"
                            stroke={region.stroke}
                            strokeWidth={REGION_FREE_STROKE_WIDTH}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      }
                      if (
                        region.shape === "thick_line" &&
                        region.x1 != null &&
                        region.y1 != null &&
                        region.x2 != null &&
                        region.y2 != null
                      ) {
                        return (
                          <line
                            key={region.id}
                            x1={region.x1 * 100}
                            y1={region.y1 * 100}
                            x2={region.x2 * 100}
                            y2={region.y2 * 100}
                            stroke={region.stroke}
                            strokeWidth={THICK_LINE_RENDER_STROKE_PX}
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      }
                      return null;
                    })}
                  </svg>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
