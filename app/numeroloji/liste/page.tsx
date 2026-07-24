"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { listNumerologyAnalyses, resolveNumerolojiTenantId, resolveNumerolojiUserAndTenant } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { RowErrorBoundary } from "../components/RowErrorBoundary";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { numApi, numApiError } from "../helpers/numApiClient";
import { MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { isDemoNumerologiOpenRecord } from "@/lib/demo/demoNumeroloji";

const listeNavSecondaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-violet-800 no-underline backdrop-blur-sm transition-all duration-200 hover:border-violet-300 hover:bg-violet-50";

const listeNavPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-bold text-white shadow-[0_2px_10px_rgba(139,92,246,0.22)] no-underline transition-all duration-200 hover:shadow-[0_4px_14px_rgba(139,92,246,0.30)]";

export default function NumerolojiListePage() {
  const pathname = usePathname();
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const { isDemo } = useDemoGuard();
  const [rows, setRows] = useState<NumerolojiListeSatir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Toplu seçim
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      setError("Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.");
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await listNumerologyAnalyses(tenantId);
    if (e) {
      setError(`Kayıtlar yüklenemedi: ${e}`);
      setRows([]);
    } else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void loadRows();
    });
  }, [loadRows, pathname]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => {
      const adSoyad = `${r.name} ${r.surname}`.toLocaleLowerCase("tr-TR");
      return adSoyad.includes(q);
    });
  }, [rows, search]);

  // Demo modda Hasan YILMAZ her zaman en üstte
  const displayRows = useMemo(() => {
    if (!isDemo) return filteredRows;
    const open = filteredRows.filter((r) => isDemoNumerologiOpenRecord(r));
    const rest = filteredRows.filter((r) => !isDemoNumerologiOpenRecord(r));
    return [...open, ...rest];
  }, [filteredRows, isDemo]);

  const hasActiveFilter = Boolean(search.trim());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredRows.map((r) => r.id)));
  }, [filteredRows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function handleBulkDelete() {
    if (isDemo) {
      showToast({ title: "Demo Modu", message: "Demo hesapta silme işlemi gerçekleştirilemez.", type: "error" });
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      showToast({ title: "Hata", message: MISSING_SESSION_TENANT_MESSAGE, type: "error" });
      return;
    }

    const confirmed = await deleteConfirm({
      title: "Seçili analizleri sil",
      message: `${ids.length} numeroloji analizini silmek istediğinizden emin misiniz?`,
      secondMessage: "Bu işlem geri alınamaz. Seçili kayıtlar kalıcı olarak silinecek.",
    });
    if (!confirmed) return;

    setDeleteLoading(true);

    // tenant_id SUNUCUDA session'dan alınır; çapraz-tenant silme engellidir.
    const res = await numApi("/api/numeroloji/analyses", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });

    setDeleteLoading(false);

    const err = numApiError(res);
    if (err) {
      showToast({ title: "Hata", message: `Seçili kayıtlar silinemedi: ${err}`, type: "error" });
      return;
    }

    const deletedIds = Array.isArray(res.json.ids) ? (res.json.ids as string[]) : ids;
    const deletedCount = typeof res.json.deleted === "number" ? res.json.deleted : deletedIds.length;
    if (deletedCount === 0) {
      showToast({ title: "Hata", message: "Silme işlemi gerçekleşmedi. Lütfen tekrar deneyin.", type: "error" });
      return;
    }

    const deletedIdSet = new Set(deletedIds);
    setRows((prev) => prev.filter((r) => !deletedIdSet.has(r.id)));
    setSelectedIds(new Set());
    showToast({ title: "Başarılı", message: `${deletedCount} analiz başarıyla silindi.`, type: "success" });
  }

  async function exportWord(mode: "selected" | "all" | "filtered") {
    if (isDemo) {
      showToast({ title: "Demo Modu", message: "Demo hesapta toplu Word raporu alınamaz.", type: "error" });
      return;
    }
    const session = await resolveNumerolojiUserAndTenant();
    if (!session) {
      showToast({ title: "Hata", message: "Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.", type: "error" });
      return;
    }
    const { userId, tenantId } = session;
    setWordBusy(true);
    try {
      let ids: string[] | undefined;
      if (mode === "selected") {
        ids = [...selectedIds];
        if (!ids.length) return;
      } else if (mode === "filtered") {
        ids = filteredRows.map((r) => r.id);
        if (!ids.length) return;
      }
      const res = await fetch("/api/numeroloji/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, userId, exportMode: mode === "all" ? "all" : "selected", ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numeroloji-${mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: "Başarılı", message: "Numeroloji raporu indirildi.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f3ff_38%,#ecfeff_100%)] text-slate-900 antialiased">
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute left-0 top-0 h-[280px] w-[280px] rounded-full bg-fuchsia-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute right-0 top-0 h-[280px] w-[280px] rounded-full bg-amber-300/20 blur-[100px]" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-5 py-3 xl:px-8">

        {/* Hero */}
        <div className="px-[clamp(8px,2.5vw,14px)] py-2 md:rounded-[18px] md:border md:border-violet-300/40 md:bg-white/80 md:px-5 md:py-3.5 md:shadow-[0_0_20px_rgba(139,92,246,0.08)] md:backdrop-blur-xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link href="/numeroloji" className={listeNavSecondaryClass}>
              ← Modül seçimi
            </Link>
            <Link href="/numeroloji/analiz" className={listeNavPrimaryClass}>
              <span aria-hidden>✨</span> Yeni analiz
            </Link>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Kayıtlı analizler
          </h1>
          <p className="mt-1 max-w-lg text-xs font-medium text-slate-500">
            Tüm numeroloji kayıtlarınızı görüntüleyin ve yönetin.
          </p>
        </div>

        {/* Demo bilgilendirme banner */}
        {isDemo && (
          <div className="mt-2.5 md:rounded-[14px] md:border md:border-blue-200 md:bg-blue-50/95 md:px-5 md:py-4 md:shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
              <div>
                <p className="text-sm font-black text-blue-900">Demo Modu — Örnek Analiz Listesi</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                  <span className="font-black">Hasan YILMAZ</span> örnek analizi tamamen açıktır ve tüm içeriğe erişilebilir.
                  Diğer kayıtlar sistemi göstermek için eklenmiştir; analiz içerikleri demo güvenliği nedeniyle flu gösterilir.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && rows.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            <input
              id="noj-liste-ara"
              aria-label="Ad veya soyad ara"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad veya soyad ara…"
              className="h-9 w-full rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-300/25"
              autoComplete="off"
            />

            {/* Demo modda toplu işlem çubuğu gizlenir */}
            {!isDemo && (
              <BulkExportBar
                compact
                hideWordOnMobile
                selectedCount={selectedIds.size}
                totalCount={rows.length}
                filteredCount={filteredRows.length}
                hasActiveFilter={hasActiveFilter}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                onExportSelected={() => void exportWord("selected")}
                onExportAll={() => void exportWord("all")}
                onExportFiltered={hasActiveFilter ? () => void exportWord("filtered") : undefined}
                isExporting={wordBusy}
                onDeleteSelected={() => void handleBulkDelete()}
                isDeleting={deleteLoading}
              />
            )}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-3 px-[clamp(8px,2.5vw,14px)] py-5 text-sm font-semibold text-slate-500 md:rounded-[14px] md:border md:border-violet-300/35 md:bg-white/80 md:px-5 md:shadow-[0_0_16px_rgba(139,92,246,0.07)] md:backdrop-blur-xl">
            Yükleniyor…
          </div>
        ) : null}

        {!loading && error ? (
          <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="mt-3 px-[clamp(8px,2.5vw,14px)] py-8 text-center text-sm font-semibold text-slate-500 md:rounded-[14px] md:border md:border-violet-300/35 md:bg-white/80 md:px-5 md:shadow-[0_0_16px_rgba(139,92,246,0.07)] md:backdrop-blur-xl">
            Henüz kayıtlı analiz yok.
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && displayRows.length === 0 ? (
          <div className="mt-3 px-[clamp(8px,2.5vw,14px)] py-6 text-center text-sm font-semibold text-slate-500 md:rounded-[14px] md:border md:border-violet-300/35 md:bg-white/80 md:px-5 md:shadow-[0_0_16px_rgba(139,92,246,0.07)] md:backdrop-blur-xl">
            Aramanızla eşleşen kayıt bulunamadı.
          </div>
        ) : null}

        {!loading && !error && displayRows.length > 0 ? (
          <ul className="mt-2.5 w-full space-y-1.5">
            {displayRows.map((r) => (
              <RowErrorBoundary key={r.id}>
                <NumerolojiListeKarti
                  row={r}
                  isSelected={selectedIds.has(r.id)}
                  onToggleSelect={isDemo ? undefined : () => toggleSelection(r.id)}
                />
              </RowErrorBoundary>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
