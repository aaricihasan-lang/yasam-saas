"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { listNumerologyAnalyses, resolveNumerolojiTenantId } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { BulkExportBar } from "@/components/common/BulkExportBar";

const listeNavSecondaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white/80 px-4 py-2 text-sm font-bold text-violet-800 no-underline backdrop-blur-sm transition-all duration-200 hover:border-violet-300 hover:bg-violet-50";

const listeNavPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(139,92,246,0.28)] no-underline transition-all duration-200 hover:shadow-[0_6px_18px_rgba(139,92,246,0.35)]";

export default function NumerolojiListePage() {
  const pathname = usePathname();
  const [rows, setRows] = useState<NumerolojiListeSatir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  async function exportWord(mode: "selected" | "all" | "filtered") {
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
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
        body: JSON.stringify({ tenantId, exportMode: mode === "all" ? "all" : "selected", ids }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numeroloji-${mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz hata */ } finally {
      setWordBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f3ff_38%,#ecfeff_100%)] text-slate-900 antialiased">
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute left-0 top-0 h-[280px] w-[280px] rounded-full bg-fuchsia-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute right-0 top-0 h-[280px] w-[280px] rounded-full bg-amber-300/20 blur-[100px]" aria-hidden />
      <div className="relative z-10 w-full px-5 py-4 xl:px-8 2xl:px-12">

        <div className="rounded-[22px] border border-violet-300/40 bg-white/80 px-5 py-4 shadow-[0_0_28px_rgba(139,92,246,0.10)] backdrop-blur-xl sm:px-6 sm:py-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link href="/numeroloji" className={listeNavSecondaryClass}>
              ← Modül seçimi
            </Link>
            <Link href="/numeroloji/analiz" className={listeNavPrimaryClass}>
              <span aria-hidden>✨</span> Yeni analiz
            </Link>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Kayıtlı analizler
          </h1>
          <p className="mt-1.5 max-w-lg text-sm font-medium text-slate-500">
            Tüm numeroloji kayıtlarınızı görüntüleyin ve yönetin.
          </p>
        </div>

        {!loading && rows.length > 0 ? (
          <div className="mt-3 space-y-3">
            <input
              id="noj-liste-ara"
              aria-label="Ad veya soyad ara"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad veya soyad ara…"
              className="h-10 w-full rounded-xl border border-violet-200 bg-white/90 px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-300/25"
              autoComplete="off"
            />

            <BulkExportBar
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
            />
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-[18px] border border-violet-300/35 bg-white/80 px-5 py-6 text-sm font-semibold text-slate-500 shadow-[0_0_20px_rgba(139,92,246,0.08)] backdrop-blur-xl">
            Yükleniyor…
          </div>
        ) : null}

        {!loading && error ? (
          <p className="mt-4 text-sm font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-violet-300/35 bg-white/80 px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-[0_0_20px_rgba(139,92,246,0.08)] backdrop-blur-xl">
            Henüz kayıtlı analiz yok.
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && filteredRows.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-violet-300/35 bg-white/80 px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-[0_0_20px_rgba(139,92,246,0.08)] backdrop-blur-xl">
            Aramanızla eşleşen kayıt bulunamadı.
          </div>
        ) : null}

        {!loading && !error && filteredRows.length > 0 ? (
          <ul className="mt-3 w-full space-y-2">
            {filteredRows.map((r) => (
              <NumerolojiListeKarti
                key={r.id}
                row={r}
                isSelected={selectedIds.has(r.id)}
                onToggleSelect={() => toggleSelection(r.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
