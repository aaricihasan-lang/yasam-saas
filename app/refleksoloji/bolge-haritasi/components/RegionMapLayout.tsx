"use client";

import Link from "next/link";
import { useState } from "react";
import { useAtlasWorkspace } from "../hooks/useAtlasWorkspace";
import type { RegionDrawShape, RegionToolMode } from "../types";
import { FootCanvas } from "./FootCanvas";
import { OrganListPanel } from "./OrganListPanel";
import { RegionNotesPanel } from "./RegionNotesPanel";
import { RegionToolbar } from "./RegionToolbar";

type RegionMapLayoutProps = {
  initialOrgan?: string | null;
};

export function RegionMapLayout({ initialOrgan = null }: RegionMapLayoutProps) {
  const [toolMode, setToolMode] = useState<RegionToolMode>("select");
  const [drawShape, setDrawShape] = useState<RegionDrawShape>("oval");

  const workspace = useAtlasWorkspace(initialOrgan);

  if (!workspace.hydrated) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-sm font-semibold text-violet-900">Atlas yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full w-full max-w-none flex-col px-2 py-1.5 sm:px-3">
        <div className="flex max-h-[90px] shrink-0 items-center gap-3 pb-1">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200/90 bg-white/85 px-2.5 py-1.5 text-sm font-black text-violet-900 shadow-sm ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:px-3"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Ana Menü</span>
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-violet-700/90 sm:text-xs">
              Refleksoloji · Bölge Haritası
            </p>
            <h1 className="truncate text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
              Bölge Haritası
            </h1>
            <p className="line-clamp-1 text-sm font-medium text-slate-600">
              Organ ekleyin, çizin, kaydedin — atlas localStorage&apos;a yazılır.
            </p>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex min-h-0 flex-1 gap-2 lg:flex-row lg:gap-3">
            <OrganListPanel
              organs={workspace.organs}
              selectedOrgans={workspace.selectedOrgans}
              activeOrgan={workspace.activeOrgan}
              onToggleOrgan={workspace.handleToggleOrgan}
              onAddOrgan={workspace.handleAddOrgan}
              onDeleteOrgan={workspace.handleDeleteOrgan}
            />
            <FootCanvas
              activeOrgan={workspace.activeOrgan}
              selectedOrgans={workspace.selectedOrgans}
              selectedFoot={workspace.selectedFoot}
              selectedView={workspace.selectedView}
              toolMode={toolMode}
              drawShape={drawShape}
              regions={workspace.displayRegions}
              onUpsertRegion={workspace.handleUpsertRegion}
              selectedRegionId={workspace.selectedRegionId}
              onSelectRegion={workspace.setSelectedRegionId}
            />
            <RegionNotesPanel selectedOrgan={workspace.activeOrgan} />
          </div>

          <RegionToolbar
            selectedFoot={workspace.selectedFoot}
            setSelectedFoot={workspace.setSelectedFoot}
            selectedView={workspace.selectedView}
            setSelectedView={workspace.setSelectedView}
            toolMode={toolMode}
            setToolMode={setToolMode}
            drawShape={drawShape}
            setDrawShape={setDrawShape}
            onSave={workspace.handleSave}
            onClear={workspace.handleClear}
          />
        </div>
      </div>
    </main>
  );
}
