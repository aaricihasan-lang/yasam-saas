"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { toFloat } from "@/lib/urun-stok/dogaltasStockLogic";
import type { DogaltasInventoryLoadDebug } from "@/lib/urun-stok/dogaltasInventoryDb";
import {
  CATEGORY_LABELS,
  DOGALTAS_INVENTORY_TABLE,
  type LiveStockCategory,
  type LiveStockRow,
  filterLiveStock,
  fmtMoney,
  formatStockTotals,
  loadLiveStockRowsAsync,
  sortLiveStock,
  summarizeLiveStock,
} from "@/lib/urun-stok/liveStockLogic";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(221,214,254,0.35),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(129,140,248,0.14),transparent_30%),linear-gradient(160deg,#f5f3ff_0%,#eef2ff_40%,#faf5ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 sm:px-5 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-[18px] border-2 border-violet-200/80 bg-white/85 p-4 shadow-[0_8px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl";

const inputClass =
  "h-10 w-full rounded-xl border-2 border-violet-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-200/50";

const btnSecondary =
  "inline-flex h-9 min-h-[36px] items-center justify-center rounded-xl border-2 border-violet-200 bg-violet-50 px-4 text-sm font-black text-slate-800 transition hover:bg-violet-100 no-underline";

type SortMode = "name" | "stock-asc" | "stock-desc";

function ProductThumb({ photos, name }: { photos: string[]; name: string }) {
  const src = photos[0];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-full w-full object-cover" />
    );
  }
  const letter = (name.trim()[0] || "?").toUpperCase();
  return (
    <LetterPlaceholder letter={letter} />
  );
}

function LetterPlaceholder({ letter }: { letter: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-100 to-indigo-100 text-3xl font-black text-violet-800">
      {letter}
    </div>
  );
}

function StockCard({ row }: { row: LiveStockRow }) {
  return (
    <article
      className={`flex flex-col gap-3 rounded-[16px] border-2 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${
        row.isCritical ? "border-rose-300 ring-2 ring-rose-100" : "border-violet-100"
      }`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-violet-100 sm:h-20 sm:w-20">
        <ProductThumb photos={row.photos} name={row.name} />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className="rounded-xl bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-violet-800">
            {row.categoryLabel}
          </span>
          {row.isCritical ? (
            <span className="rounded-xl bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">Kritik stok</span>
          ) : null}
        </div>
        <h2 className="text-base font-black leading-tight text-slate-900 sm:text-lg">{row.name}</h2>
        <p className="text-sm font-semibold text-slate-600">{row.groupLabel}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-700">
          <span>Birim maliyet: {row.costPerUnitLabel}</span>
          <span>Tahmini değer: {fmtMoney(row.stockValue)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch sm:items-end">
        <p className="mb-1 text-center text-xs font-black uppercase tracking-wider text-slate-500 sm:text-right">
          Mevcut stok
        </p>
        <div
          className={`rounded-xl border-2 px-4 py-3 text-center sm:min-w-[110px] ${
            row.isCritical
              ? "border-rose-400 bg-gradient-to-br from-rose-50 to-orange-50"
              : "border-violet-300 bg-gradient-to-br from-violet-50 to-indigo-50"
          }`}
        >
          <p className="text-xl font-black leading-none text-slate-900 sm:text-2xl">{row.stockDisplay}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">birim: {row.unitLabel}</p>
        </div>
      </div>
    </article>
  );
}

export default function CanliStokMerkeziPage() {
  const [hydrated, setHydrated] = useState(false);
  const [rows, setRows] = useState<LiveStockRow[]>([]);
  const [usdRate, setUsdRate] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [inventorySource, setInventorySource] = useState<string>("—");
  const [inventoryDebug, setInventoryDebug] = useState<DogaltasInventoryLoadDebug | null>(
    null,
  );

  const reload = useCallback(async () => {
    const tid = await getSyncedTenantId();
    setTenantId(tid);
    const result = await loadLiveStockRowsAsync(tid, toFloat(usdRate, 0));
    setRows(result.rows);
    setInventorySource(result.dogaltasSource);
    setInventoryDebug(result.inventoryDebug);
    console.log("[canli-stok] okuma", {
      tablo: DOGALTAS_INVENTORY_TABLE,
      oturum_tenant_id: tid,
      kaynak: result.dogaltasSource,
      supabase_ham: result.inventoryDebug.supabaseRawCount,
      adet_gt_0: result.inventoryDebug.adetPositiveCount,
      listede_dogaltas: result.dogaltasListedCount,
      hata: result.inventoryDebug.supabaseError,
    });
  }, [usdRate]);

  useEffect(() => {
    void reload().then(() => setHydrated(true));
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => void reload();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("storage", onRefresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onRefresh();
    });
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, [reload]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LiveStockCategory | "all">("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [wordBusy, setWordBusy] = useState(false);

  async function exportStockWord(mode: "all" | "critical") {
    const tid = tenantId ?? await getSyncedTenantId();
    if (!tid) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/urun-stok/stock-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tid, exportMode: mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error || "Rapor oluşturulamadı.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dogaltas-stok-${mode === "critical" ? "kritik" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const list = filterLiveStock(rows, { q: search, category, criticalOnly });
    return sortLiveStock(list, sortMode);
  }, [rows, search, category, criticalOnly, sortMode]);

  const summary = useMemo(() => summarizeLiveStock(rows), [rows]);

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center text-lg font-semibold text-slate-600">
          Yükleniyor…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <header className={`${panelClass} mb-4`}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-700">Canlı depo</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Canlı Stok Merkezi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tüm modüllerdeki gerçek stoklar tek ekranda — salt okunur. Stoklar ilgili modül envanterinden anlık okunur.
          </p>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`${panelClass} !p-3`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Ürün çeşidi</p>
            <p className="mt-1.5 text-2xl font-black text-violet-900">{summary.totalVarieties}</p>
          </div>
          <div className={`${panelClass} !p-3`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Toplam stok miktarı</p>
            <p className="mt-1.5 text-base font-black leading-snug text-violet-900 sm:text-lg">
              {formatStockTotals(summary)}
            </p>
          </div>
          <div className={`${panelClass} !p-3`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Kritik stoktaki ürünler</p>
            <p className="mt-1.5 text-2xl font-black text-rose-700">{summary.criticalCount}</p>
          </div>
          <div className={`${panelClass} !p-3`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Tahmini stok değeri</p>
            <p className="mt-1.5 text-xl font-black text-emerald-800 sm:text-2xl">{fmtMoney(summary.totalValue)}</p>
          </div>
        </div>

        <section className={`${panelClass} mb-4 space-y-3`}>
          <h2 className="text-base font-black text-slate-800">Filtreler</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-sm font-black">Ürün adı ara</span>
              <input
                className={inputClass}
                type="search"
                placeholder="Ad, grup veya kategori…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-black">Kategori</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as LiveStockCategory | "all")}
              >
                <option value="all">Tümü</option>
                {(Object.keys(CATEGORY_LABELS) as LiveStockCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-black">Doğaltaş USD kuru (₺)</span>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={usdRate}
                onChange={(e) => setUsdRate(e.target.value)}
                placeholder="Maliyet hesabı için"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black">
              <input
                type="checkbox"
                className="h-5 w-5 accent-violet-600"
                checked={criticalOnly}
                onChange={(e) => setCriticalOnly(e.target.checked)}
              />
              Sadece kritik stoklar
            </label>
            <button
              type="button"
              className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
                sortMode === "stock-asc"
                  ? "border-violet-500 bg-violet-100 text-violet-900"
                  : "border-violet-200 bg-white text-slate-700"
              }`}
              onClick={() => setSortMode("stock-asc")}
            >
              Stok ↑ (azdan çoğa)
            </button>
            <button
              type="button"
              className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
                sortMode === "stock-desc"
                  ? "border-violet-500 bg-violet-100 text-violet-900"
                  : "border-violet-200 bg-white text-slate-700"
              }`}
              onClick={() => setSortMode("stock-desc")}
            >
              Stok ↓ (çoktan aza)
            </button>
            <button
              type="button"
              className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
                sortMode === "name"
                  ? "border-violet-500 bg-violet-100 text-violet-900"
                  : "border-violet-200 bg-white text-slate-700"
              }`}
              onClick={() => setSortMode("name")}
            >
              Ada göre
            </button>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            Listelenen: <span className="font-black text-violet-800">{filtered.length}</span> / {rows.length} stoklu
            kalem
          </p>
          {/* Word export butonları */}
          <div className="flex flex-wrap items-center gap-2 border-t border-violet-100 pt-3">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Word Raporu:</span>
            <button
              type="button"
              disabled={wordBusy || rows.length === 0}
              onClick={() => void exportStockWord("all")}
              className="rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
            >
              {wordBusy ? "⏳ Hazırlanıyor..." : `📄 Tüm Stok Word (${rows.length})`}
            </button>
            <button
              type="button"
              disabled={wordBusy || summary.criticalCount === 0}
              onClick={() => void exportStockWord("critical")}
              className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
            >
              {wordBusy ? "⏳..." : `⚠️ Kritik Stok Word (${summary.criticalCount})`}
            </button>
            <span className="text-xs text-slate-400">
              (Yalnızca Doğaltaş envanteri · diğer kategoriler yerel depolama tabanlı)
            </span>
          </div>
        </section>

        {filtered.length === 0 ? (
          <section className={`${panelClass} py-16 text-center`}>
            <p className="text-5xl" aria-hidden>
              📦
            </p>
            <h2 className="mt-4 text-2xl font-black text-slate-800">Henüz görüntülenecek stok yok</h2>
            <p className="mx-auto mt-3 max-w-md text-base text-slate-600">
              {rows.length === 0
                ? "Modüllerde stok girişi yaptığınızda veya satış sonrası kalan stok olduğunda burada otomatik görünür."
                : "Filtreleri gevşetin veya arama metnini temizleyin."}
            </p>
            <Link href="/urun-stok" className={`${btnSecondary} mt-8 inline-flex`}>
              Ürün & Stok Merkezine dön
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            {filtered.map((row) => (
              <StockCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
