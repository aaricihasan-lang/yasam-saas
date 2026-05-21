"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { toFloat } from "@/lib/urun-stok/dogaltasStockLogic";
import { DOGALTAS_INVENTORY_TABLE } from "@/lib/urun-stok/dogaltasInventoryDb";
import {
  CATEGORY_LABELS,
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

const pageShell = "relative z-10 w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-violet-200/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-violet-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-200/50";

const btnSecondary =
  "inline-flex h-12 min-h-[48px] items-center justify-center rounded-2xl border-2 border-violet-200 bg-violet-50 px-6 text-sm font-black text-slate-800 transition hover:bg-violet-100 no-underline";

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
      className={`flex flex-col gap-4 rounded-[24px] border-2 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:gap-6 sm:p-5 ${
        row.isCritical ? "border-rose-300 ring-2 ring-rose-100" : "border-violet-100"
      }`}
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-violet-100 sm:h-28 sm:w-28">
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
        <h2 className="text-xl font-black leading-tight text-slate-900 sm:text-2xl">{row.name}</h2>
        <p className="text-sm font-semibold text-slate-600 sm:text-base">{row.groupLabel}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold text-slate-700 sm:text-base">
          <span>Birim maliyet: {row.costPerUnitLabel}</span>
          <span>Tahmini değer: {fmtMoney(row.stockValue)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch sm:items-end">
        <p className="mb-1 text-center text-xs font-black uppercase tracking-wider text-slate-500 sm:text-right">
          Mevcut stok
        </p>
        <div
          className={`rounded-2xl border-2 px-5 py-4 text-center sm:min-w-[140px] ${
            row.isCritical
              ? "border-rose-400 bg-gradient-to-br from-rose-50 to-orange-50"
              : "border-violet-300 bg-gradient-to-br from-violet-50 to-indigo-50"
          }`}
        >
          <p className="text-2xl font-black leading-none text-slate-900 sm:text-3xl">{row.stockDisplay}</p>
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

  const reload = useCallback(async () => {
    const tid = await getSyncedTenantId();
    setTenantId(tid);
    const result = await loadLiveStockRowsAsync(tid, toFloat(usdRate, 0));
    setRows(result.rows);
    setInventorySource(result.dogaltasSource);
    console.log("[canli-stok] okuma", {
      tenant_id: result.tenantId,
      kaynak: result.dogaltasSource,
      tablo: DOGALTAS_INVENTORY_TABLE,
      dogaltasSatir: result.rows.filter((r) => r.category === "dogaltas").length,
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <div className="mb-6 flex flex-wrap justify-between gap-3">
          <Link href="/urun-stok" className={btnSecondary}>
            ← Ürün & Stok Merkezi
          </Link>
          <Link href="/urun-stok" className={btnSecondary}>
            Ana Panele Dön
          </Link>
        </div>

        <header className={`${panelClass} mb-6`}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-violet-700">Canlı depo</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl xl:text-5xl">Canlı Stok Merkezi</h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Tüm modüllerdeki gerçek stoklar tek ekranda — salt okunur. Satış veya manuel düzenleme burada yapılmaz;
            stoklar ilgili modül envanterinden anlık okunur.
          </p>
          <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 font-mono text-sm text-violet-950">
            Doğaltaş stok kaynağı: {DOGALTAS_INVENTORY_TABLE} · tenant_id: {tenantId ?? "—"} · okuma:{" "}
            {inventorySource}
          </p>
        </header>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`${panelClass} !p-5`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Ürün çeşidi</p>
            <p className="mt-2 text-3xl font-black text-violet-900">{summary.totalVarieties}</p>
          </div>
          <div className={`${panelClass} !p-5`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Toplam stok miktarı</p>
            <p className="mt-2 text-lg font-black leading-snug text-violet-900 sm:text-xl">
              {formatStockTotals(summary)}
            </p>
          </div>
          <div className={`${panelClass} !p-5`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Kritik stoktaki ürünler</p>
            <p className="mt-2 text-3xl font-black text-rose-700">{summary.criticalCount}</p>
          </div>
          <div className={`${panelClass} !p-5`}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Tahmini stok değeri</p>
            <p className="mt-2 text-2xl font-black text-emerald-800 sm:text-3xl">{fmtMoney(summary.totalValue)}</p>
          </div>
        </div>

        <section className={`${panelClass} mb-6 space-y-4`}>
          <h2 className="text-lg font-black text-slate-800">Filtreler</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-black">Ürün adı ara</span>
              <input
                className={inputClass}
                type="search"
                placeholder="Ad, grup veya kategori…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black">Kategori</span>
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
              <span className="mb-2 block text-sm font-black">Doğaltaş USD kuru (₺)</span>
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
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black">
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
              className={`rounded-2xl border-2 px-4 py-3 text-sm font-black transition ${
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
              className={`rounded-2xl border-2 px-4 py-3 text-sm font-black transition ${
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
              className={`rounded-2xl border-2 px-4 py-3 text-sm font-black transition ${
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
