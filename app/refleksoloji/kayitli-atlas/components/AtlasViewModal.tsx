"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getRegionsForOrgan, loadAtlas } from "@/lib/atlasStorage";
import type { FootView } from "@/app/refleksoloji/bolge-haritasi/types";
import { AtlasReadonlyFootMap } from "./AtlasReadonlyFootMap";

type AtlasViewModalProps = {
  open: boolean;
  organName: string;
  onClose: () => void;
};

export function AtlasViewModal({ open, organName, onClose }: AtlasViewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [footView, setFootView] = useState<FootView>("taban");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFootView("taban");
  }, [open, organName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const regions = useMemo(() => {
    if (!open) return [];
    try {
      return getRegionsForOrgan(loadAtlas(), organName);
    } catch {
      return [];
    }
  }, [open, organName]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="atlas-view-title"
      onClick={onClose}
    >
      <div
        className="flex h-[min(900px,calc(100vh-64px))] w-[min(1100px,calc(100vw-32px))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-700">
              Atlas Görüntüle
            </p>
            <h2 id="atlas-view-title" className="mt-1 text-2xl font-black text-slate-900">
              {organName}
            </h2>
            <p className="mt-1 text-base font-medium text-slate-500">
              {regions.length} kayıtlı bölge · salt okunur önizleme
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
          >
            Kapat
          </button>
        </header>

        <div className="min-h-0 flex-1">
          <AtlasReadonlyFootMap
            regions={regions}
            footView={footView}
            onFootViewChange={setFootView}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
