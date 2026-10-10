"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { useAtlasWorkspace } from "../hooks/useAtlasWorkspace";
import { useRegionEditingAllowed } from "../hooks/useRegionEditingAllowed";
import { DEFAULT_POINT_SIZE, resolvePointSize, type PointSize, type RegionDrawShape, type RegionToolMode } from "../types";
import { AtlasConflictBanner } from "./AtlasConflictBanner";
import { AtlasSaveToast } from "./AtlasSaveToast";
import { FootCanvas } from "./FootCanvas";
import { MobileEditNoticePanel } from "./MobileEditNoticePanel";
import { OrganListPanel } from "./OrganListPanel";
import { RegionNotesPanel } from "./RegionNotesPanel";
import { RegionToolbar } from "./RegionToolbar";
import { SyncStatusBadge } from "@/app/refleksoloji/components/SyncStatusBadge";
import { getReflexologySyncStatus } from "@/lib/refleksoloji/syncStatus";

type RegionMapLayoutProps = {
  initialOrgan?: string | null;
};

export function RegionMapLayout({ initialOrgan = null }: RegionMapLayoutProps) {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { showToast } = useToast();
  const [toolMode, setToolMode] = useState<RegionToolMode>("select");
  const [drawShape, setDrawShape] = useState<RegionDrawShape>("oval");
  const [pointSize, setPointSize] = useState<PointSize>(DEFAULT_POINT_SIZE);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [saveSeq, setSaveSeq] = useState(0);
  const [savedTick, setSavedTick] = useState(0);

  // ÜRÜN KURALI: telefon/dar ekranda harita salt-okuma (hassas koordinat düzenleme
  // yalnız masaüstünde). Tek kaynak → hem UI hem etkileşim buradan karar alır.
  const editingAllowed = useRegionEditingAllowed();

  const workspace = useAtlasWorkspace(initialOrgan);

  // Masaüstü tam ekran: üstteki global uygulama çubuğu da sayfada olduğundan 100vh, çubuk
  // yüksekliği kadar sayfa scroll'u üretiyordu. Yükseklik = viewport − main'in gerçek üst
  // konumu (çubuk yüksekliği değişse de doğru; ölçülene kadar eski 100vh davranışı).
  const mainRef = useRef<HTMLElement>(null);
  const [mainTop, setMainTop] = useState(0);
  const hydrated = workspace.hydrated;
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => setMainTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    measure();
    const prev = el.previousElementSibling;
    const ro = prev ? new ResizeObserver(measure) : null;
    if (prev) ro?.observe(prev);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hydrated]);

  // Ekran daraldığında (desktop→mobil) düzenleme modunda asılı kalınmasın → salt-görüntüle.
  // (Etkileşim zaten FootCanvas'ta editingAllowed ile kilitli; bu yalnız deterministik
  //  toolMode senkronu — güvenlik değil, tutarlılık içindir.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editingAllowed) setToolMode("select");
  }, [editingAllowed]);

  const saveAtlas = workspace.handleSave;

  // Nokta boyutu: "Bölge Ekle + Nokta" modunda seçici YALNIZ sonraki noktanın boyutunu ayarlar
  // (az önce konan seçili nokta değişmez). Ekleme modu dışında seçili bir nokta varsa seçici o
  // noktanın boyutunu gösterir/değiştirir (ve bu boyut sonraki noktalar için de hatırlanır).
  const { displayRegions, selectedRegionId, handleUpsertRegion } = workspace;
  const placingPoint = toolMode === "add" && drawShape === "point";
  const selectedPoint = useMemo(
    () =>
      placingPoint
        ? null
        : (displayRegions.find((r) => r.id === selectedRegionId && r.shape === "point") ?? null),
    [placingPoint, displayRegions, selectedRegionId],
  );
  const handlePointSizeChange = useCallback(
    (size: PointSize) => {
      setPointSize(size);
      if (selectedPoint && editingAllowed) handleUpsertRegion({ ...selectedPoint, pointSize: size });
    },
    [selectedPoint, editingAllowed, handleUpsertRegion],
  );

  const handleSave = useCallback(() => {
    // Salt-okuma güvence: toolbar mobilde gizli olsa da kaydetme burada da engellenir.
    if (!editingAllowed) return;
    // RF-03: bildirim yalnız bu kayıttan SONRAKİ gerçek senkron sonucunu gösterir.
    setSaveSeq(getReflexologySyncStatus().seq);
    const saved = saveAtlas();
    if (!saved) {
      showToast({ type: "error", title: "Depolama Hatası", message: STORAGE_QUOTA_ERROR_MESSAGE });
      return;
    }
    setToolMode("select");
    setSaveToastVisible(true);
    // Organ Atlası panelinin bölge sayılarını tazele (kaydet sonrası).
    setSavedTick((t) => t + 1);
  }, [editingAllowed, saveAtlas, showToast]);

  const dismissSaveToast = useCallback(() => {
    setSaveToastVisible(false);
  }, []);

  if (!workspace.hydrated) {
    return (
      <main className="flex w-full flex-1 items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-sm font-semibold text-violet-900">Atlas yükleniyor…</p>
      </main>
    );
  }

  return (
    <main
      ref={mainRef}
      style={{ "--bh-main-top": `${mainTop}px` } as CSSProperties}
      className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased lg:h-[calc(100vh-var(--bh-main-top))] lg:min-h-0 lg:w-full lg:overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-none flex-col px-2 py-1 sm:px-3 lg:h-full">
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
          {/* REF-007 / FA-13: atlas senkron sonucu + "yeniden dene" görünür. */}
          {!isDemo ? <SyncStatusBadge className="shrink-0" /> : null}
        </div>

        {!isDemo && workspace.quarantineCount > 0 ? (
          <p className="mb-1 shrink-0 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950">
            Bu cihazda sahibi belirsiz eski atlas verisi bulundu.{" "}
            <Link href="/refleksoloji/kayitli-atlas" className="underline underline-offset-2">
              Kayıtlı Atlas&apos;ta içe aktarın veya silin
            </Link>
            .
          </p>
        ) : null}

        {/* P1-5: aynı organ başka cihazda farklı değiştirildi → yerel korunur, kullanıcı seçer. */}
        {!isDemo ? <AtlasConflictBanner /> : null}

        <div className="flex min-h-0 flex-col gap-1.5 lg:flex-1">
          <div className="flex min-h-0 flex-col gap-2 lg:flex-1 lg:flex-row lg:gap-3">
            <OrganListPanel
              organs={workspace.organs}
              selectedOrgans={workspace.selectedOrgans}
              activeOrgan={workspace.activeOrgan}
              selectedRegionId={workspace.selectedRegionId}
              onToggleOrgan={workspace.handleToggleOrgan}
              onAddOrgan={workspace.handleAddOrgan}
              onDeleteDrawing={workspace.handleDeleteSelectedDrawing}
              editingAllowed={editingAllowed}
            />
            <div className="flex h-[58vh] min-h-[420px] min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
              <FootCanvas
                activeOrgan={workspace.activeOrgan}
                selectedOrgans={workspace.selectedOrgans}
                selectedFoot={workspace.selectedFoot}
                selectedView={workspace.selectedView}
                toolMode={toolMode}
                drawShape={drawShape}
                pointSize={pointSize}
                regions={workspace.displayRegions}
                onUpsertRegion={workspace.handleUpsertRegion}
                selectedRegionId={workspace.selectedRegionId}
                onSelectRegion={workspace.setSelectedRegionId}
                onDrawComplete={() => setToolMode("select")}
                editingAllowed={editingAllowed}
              />
            </div>
            <RegionNotesPanel selectedOrgan={workspace.activeOrgan} atlasVersion={savedTick + workspace.atlasRevision} />
          </div>

          {/* Telefon/dar ekran: premium bilgi paneli (düzenleme masaüstünde). */}
          {!editingAllowed ? <MobileEditNoticePanel /> : null}

          <RegionToolbar
            selectedFoot={workspace.selectedFoot}
            setSelectedFoot={workspace.setSelectedFoot}
            selectedView={workspace.selectedView}
            setSelectedView={workspace.setSelectedView}
            toolMode={toolMode}
            setToolMode={setToolMode}
            drawShape={drawShape}
            setDrawShape={setDrawShape}
            pointSize={selectedPoint ? resolvePointSize(selectedPoint.pointSize) : pointSize}
            onPointSizeChange={handlePointSizeChange}
            showPointSize={drawShape === "point" || selectedPoint !== null}
            onSave={handleSave}
            onClear={workspace.handleClear}
            editingAllowed={editingAllowed}
          />
        </div>
      </div>

      <AtlasSaveToast
        visible={saveToastVisible}
        onDismiss={dismissSaveToast}
        sinceSeq={saveSeq}
        localOnly={isDemo}
      />
    </main>
  );
}
