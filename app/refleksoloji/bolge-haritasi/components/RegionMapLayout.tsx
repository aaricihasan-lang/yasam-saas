"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { useAtlasWorkspace } from "../hooks/useAtlasWorkspace";
import type { RegionDrawShape, RegionToolMode } from "../types";
import { AtlasSaveToast } from "./AtlasSaveToast";
import { FootCanvas } from "./FootCanvas";
import { OrganListPanel } from "./OrganListPanel";
import { RegionNotesPanel } from "./RegionNotesPanel";
import { RegionToolbar } from "./RegionToolbar";

type RegionMapLayoutProps = {
  initialOrgan?: string | null;
};

export function RegionMapLayout({ initialOrgan = null }: RegionMapLayoutProps) {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { showToast } = useToast();
  const [toolMode, setToolMode] = useState<RegionToolMode>("select");
  const [drawShape, setDrawShape] = useState<RegionDrawShape>("oval");
  const [saveToastVisible, setSaveToastVisible] = useState(false);

  const workspace = useAtlasWorkspace(initialOrgan);

  const saveAtlas = workspace.handleSave;

  const handleSave = useCallback(() => {
    const saved = saveAtlas();
    if (!saved) {
      showToast({ type: "error", title: "Depolama Hatası", message: STORAGE_QUOTA_ERROR_MESSAGE });
      return;
    }
    setToolMode("select");
    setSaveToastVisible(true);
  }, [saveAtlas, showToast]);

  const dismissSaveToast = useCallback(() => {
    setSaveToastVisible(false);
  }, []);

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

      <div className="relative z-10 flex h-full w-full max-w-none flex-col px-2 py-1 sm:px-3">
        {isDemo && (
          <DemoModuleBanner
            className="shrink-0"
            message="Bölge haritasında yaptığınız çizimler sadece cihazınızda saklanır. Oturumunuz boyunca görünür; çıkışta silinir."
          />
        )}
        <div className="flex max-h-[60px] shrink-0 items-center gap-2 pb-1">
          <header className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-violet-700/90">
              Refleksoloji · Bölge Haritası
            </p>
            <h1 className="truncate text-base font-black leading-tight tracking-tight text-slate-900 sm:text-lg">
              Bölge Haritası
            </h1>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex min-h-0 flex-1 gap-2 lg:flex-row lg:gap-3">
            <OrganListPanel
              organs={workspace.organs}
              selectedOrgans={workspace.selectedOrgans}
              activeOrgan={workspace.activeOrgan}
              selectedRegionId={workspace.selectedRegionId}
              onToggleOrgan={workspace.handleToggleOrgan}
              onAddOrgan={workspace.handleAddOrgan}
              onDeleteDrawing={workspace.handleDeleteSelectedDrawing}
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
              onDrawComplete={() => setToolMode("select")}
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
            onSave={handleSave}
            onClear={workspace.handleClear}
          />
        </div>
      </div>

      <AtlasSaveToast visible={saveToastVisible} onDismiss={dismissSaveToast} />
    </main>
  );
}
