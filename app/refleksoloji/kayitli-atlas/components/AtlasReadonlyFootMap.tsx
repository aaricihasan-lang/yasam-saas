"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { RegionShape } from "@/app/refleksoloji/bolge-haritasi/components/regions/RegionShape";
import type { FootView, Region } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  ATLAS_IMAGE_SRC,
  atlasBackgroundLabel,
  resolveAtlasBackgroundKey,
} from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { computeObjectContainRect } from "@/app/refleksoloji/bolge-haritasi/utils/imageContainRect";

type AtlasReadonlyFootMapProps = {
  regions: Region[];
  footView: FootView;
  onFootViewChange: (view: FootView) => void;
};

export function AtlasReadonlyFootMap({
  regions,
  footView,
  onFootViewChange,
}: AtlasReadonlyFootMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  // EKOLE BAĞIMSIZ: arka plan DOĞRUDAN footView'dan; organ adı KULLANILMAZ.
  const backgroundKey = resolveAtlasBackgroundKey(footView);
  const imageSrc = ATLAS_IMAGE_SRC[backgroundKey];
  const imageLabel = atlasBackgroundLabel(backgroundKey);

  const visibleRegions = useMemo(
    () => regions.filter((r) => r.view === footView),
    [regions, footView],
  );

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
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-[24px] border border-violet-100/90 bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-violet-100/80 px-4 py-3">
        <p className="text-base font-semibold text-slate-600">{imageLabel}</p>
        {/* EKOLE BAĞIMSIZ: 3 bağımsız görünüm — organın hangi görünümde bölgesi
            varsa manuel seçilebilir. Organ adı arka planı belirlemez. */}
        <div className="flex gap-2">
          {([
            { view: "taban", label: "Taban" },
            { view: "yan_ic", label: "Yan İç" },
            { view: "yan_dis", label: "Yan Dış" },
          ] as const).map(({ view, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => onFootViewChange(view)}
              aria-pressed={footView === view}
              className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                footView === view
                  ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                  : "border-violet-200/80 bg-violet-50/80 text-violet-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
            {visibleRegions.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-base font-medium text-slate-500">
                Bu görünümde kayıtlı bölge yok.
              </p>
            ) : (
              visibleRegions.map((region) => (
                <RegionShape
                  key={region.id}
                  region={region}
                  isSelected={false}
                  interactive={false}
                  moveMode={false}
                  showEditHandles={false}
                  onSelect={() => {}}
                />
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
