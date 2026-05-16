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
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full w-full max-w-none flex-col px-3 py-2">
        <div className="flex max-h-[90px] shrink-0 items-center gap-3 pb-1.5">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200/90 bg-white/85 px-2.5 py-1.5 text-[11px] font-black text-violet-900 shadow-sm ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:px-3 sm:text-xs"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Ana Menü</span>
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-violet-700/85 sm:text-[10px]">
              Refleksoloji · Bölge Haritası
            </p>
            <h1 className="truncate text-lg font-black leading-tight tracking-tight text-slate-900 sm:text-xl">
              Bölge Haritası
            </h1>
            <p className="hidden truncate text-[11px] font-medium text-slate-600 xl:block">
              Organ seçin, ayak haritasında bölgeleri işaretleyin.
            </p>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex min-h-0 flex-1 gap-2 lg:flex-row lg:gap-3">
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
    </main>
  );
}
