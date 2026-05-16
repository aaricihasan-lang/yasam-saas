"use client";

import Link from "next/link";
import { useState } from "react";
import { FootCanvas } from "./FootCanvas";
import { OrganListPanel } from "./OrganListPanel";
import { RegionNotesPanel } from "./RegionNotesPanel";
import { RegionToolbar } from "./RegionToolbar";
import type { FootSide, FootView, Region, RegionToolMode } from "../types";

export function RegionMapLayout() {
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [selectedFoot, setSelectedFoot] = useState<FootSide>("left");
  const [selectedView, setSelectedView] = useState<FootView>("taban");
  const [toolMode, setToolMode] = useState<RegionToolMode>("select");
  const [userRegions, setUserRegions] = useState<Region[]>([]);

  return (
    <main className="relative h-screen overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-[96vw] max-w-[1850px] flex-col px-3 py-2 sm:px-4 sm:py-3 lg:px-5">
        <Link
          href="/refleksoloji"
          className="mb-2 inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-violet-200/90 bg-white/85 px-3.5 py-2 text-xs font-black text-violet-900 shadow-md ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:text-sm"
        >
          <span aria-hidden>←</span>
          Refleksoloji Ana Menü
        </Link>

        <header className="mb-2 shrink-0">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-700/85 sm:text-[11px]">
            Refleksoloji · Bölge Haritası
          </p>
          <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-[1.65rem]">
            Bölge Haritası
          </h1>
          <p className="mt-0.5 max-w-3xl text-xs font-medium text-slate-600 sm:text-sm">
            Organ seçin, ayak haritasında bölgeleri işaretleyin ve atlas notlarını yönetin.
          </p>
        </header>

        <div className="flex h-[calc(100vh-110px)] max-h-[calc(100vh-110px)] min-h-0 flex-col gap-2">
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
            <OrganListPanel selectedOrgan={selectedOrgan} setSelectedOrgan={setSelectedOrgan} />
            <FootCanvas
              selectedOrgan={selectedOrgan}
              selectedFoot={selectedFoot}
              selectedView={selectedView}
              toolMode={toolMode}
              userRegions={userRegions}
              setUserRegions={setUserRegions}
            />
            <RegionNotesPanel selectedOrgan={selectedOrgan} />
          </div>

          <div className="shrink-0">
            <RegionToolbar
              selectedFoot={selectedFoot}
              setSelectedFoot={setSelectedFoot}
              selectedView={selectedView}
              setSelectedView={setSelectedView}
              toolMode={toolMode}
              setToolMode={setToolMode}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
