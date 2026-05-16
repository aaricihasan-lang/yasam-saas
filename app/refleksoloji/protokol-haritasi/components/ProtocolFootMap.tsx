"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_IMAGE_SRC,
  atlasBackgroundLabel,
  resolveAtlasBackgroundKey,
} from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { computeObjectContainRect } from "@/app/refleksoloji/bolge-haritasi/utils/imageContainRect";
import type { ColoredDisplayRegion, ProtocolFootView } from "../types";

type ProtocolFootMapProps = {
  regions: ColoredDisplayRegion[];
  footView: ProtocolFootView;
  missingOrgans: string[];
  onFootViewChange: (view: ProtocolFootView) => void;
};

export function ProtocolFootMap({
  regions,
  footView,
  missingOrgans,
  onFootViewChange,
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/90 bg-white/80 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70">
      <div className="shrink-0 border-b border-violet-100/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-800">
              Ayak Haritası Önizleme
            </p>
            <p className="mt-1 text-base font-semibold text-slate-600">{imageLabel}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFootViewChange("taban")}
              aria-pressed={footView === "taban"}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                footView === "taban"
                  ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                  : "border-violet-200/80 bg-violet-50/80 text-violet-800"
              }`}
            >
              Taban
            </button>
            <button
              type="button"
              onClick={() => onFootViewChange("yan")}
              aria-pressed={footView === "yan"}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                footView === "yan"
                  ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                  : "border-violet-200/80 bg-violet-50/80 text-violet-800"
              }`}
            >
              Yan
            </button>
          </div>
        </div>
      </div>

      {missingOrgans.length > 0 ? (
        <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/95 px-5 py-3">
          <p className="text-sm font-bold text-amber-950">
            Atlas bulunamayan organlar: {missingOrgans.join(", ")}
          </p>
          <p className="mt-1 text-sm font-medium text-amber-900/90">
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
              regions.map((region) => {
                const left = (region.cx - region.rx) * 100;
                const top = (region.cy - region.ry) * 100;
                const width = region.rx * 2 * 100;
                const height = region.ry * 2 * 100;

                return (
                  <div
                    key={region.id}
                    className="pointer-events-none absolute"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                    }}
                  >
                    <div
                      className="h-full w-full border-2"
                      style={{
                        borderRadius: region.shape === "oval" ? 9999 : 6,
                        backgroundColor: region.fill,
                        borderColor: region.stroke,
                        boxShadow: `0 0 14px ${region.stroke}55`,
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
