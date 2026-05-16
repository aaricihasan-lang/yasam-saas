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
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-8">
        <Link
          href="/refleksoloji"
          className="mb-4 inline-flex w-fit items-center gap-2 rounded-2xl border border-violet-200/90 bg-white/85 px-4 py-2.5 text-sm font-black text-violet-900 shadow-md ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:mb-5"
        >
          <span aria-hidden>←</span>
          Refleksoloji Ana Menü
        </Link>

        <header className="mb-4 sm:mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-700/85 sm:text-[11px]">
            Refleksoloji · Bölge Haritası
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Bölge Haritası</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Organ seçin, ayak haritasında bölgeleri işaretleyin ve atlas notlarını yönetin.
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(240px,300px)] lg:items-stretch lg:gap-5">
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

        <div className="mt-4 shrink-0 lg:mt-5">
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
