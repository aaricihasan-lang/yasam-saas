"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { toFloat } from "@/lib/urun-stok/dogaltasStockLogic";
import { loadLiveStockRows } from "@/lib/urun-stok/liveStockLogic";
import {
  CATEGORY_LABELS,
  type PeriodFilter,
  type ProductCategory,
  type ProductRank,
  buildProductInsight,
  filterReportLines,
  fmtMoney,
  generateSmartAlerts,
  highStockLowSales,
  leastProfit,
  leastSelling,
  loadAllReportLines,
  lossMaking,
  lowStockHighSales,
  mostStockOut,
  summarizeSales,
  topProfit,
  topSelling,
} from "@/lib/urun-stok/salesReportsLogic";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { seedDemoUrunStok } from "@/lib/demo/demoUrunStok";
import { DemoUrunStokBanner } from "@/components/demo/DemoUrunStokBanner";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(254,205,211,0.35),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(251,113,133,0.12),transparent_30%),linear-gradient(160deg,#fff1f2_0%,#fdf2f8_42%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-2xl border-2 border-rose-200/80 bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5";

const inputClass =
  "h-9 w-full rounded-xl border-2 border-rose-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200/50";

const periodBtn = (active: boolean) =>
  `rounded-xl border-2 px-3 py-1.5 text-xs font-black transition ${
    active
      ? "border-rose-500 bg-rose-100 text-rose-900"
      : "border-rose-200 bg-white text-slate-700 hover:border-rose-300"
  }`;

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-rose-100 bg-white p-3 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black leading-tight text-slate-900">{value}</p>
    </div>
  );
}

function RankList({ title, items, valueKey }: { title: string; items: ProductRank[]; valueKey: "qty" | "profit" | "revenue" }) {
  return (
    <div className="rounded-xl border-2 border-rose-100 bg-white/90 p-3">
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Veri yok</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((p, i) => (
            <li key={`${p.productName}-${p.category}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-rose-50/60 px-2.5 py-1.5">
              <span className="min-w-0 truncate text-xs font-bold text-slate-800">
                {i + 1}. {p.productName}
              </span>
              <span className="shrink-0 text-xs font-black text-rose-800">
                {valueKey === "qty"
                  ? `${p.qty.toFixed(1)}`
                  : valueKey === "profit"
                    ? fmtMoney(p.profit)
                    : fmtMoney(p.revenue)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SatisRaporlariPage() {
  const [hydrated, setHydrated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [allLines, setAllLines] = useState<ReturnType<typeof loadAllReportLines>>([]);
  const [stockRows, setStockRows] = useState<ReturnType<typeof loadLiveStockRows>>([]);
  const [usdRate, setUsdRate] = useState("");

  const reload = useCallback(() => {
    const rate = toFloat(usdRate, 0);
    setAllLines(loadAllReportLines(rate));
    setStockRows(loadLiveStockRows(rate));
  }, [usdRate]);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    reload();
    setHydrated(true);
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("storage", onRefresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("storage", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(
    () =>
      filterReportLines(allLines, {
        q: search,
        category,
        period,
        customRange: period === "custom" ? { from: dateFrom, to: dateTo } : undefined,
      }),
    [allLines, search, category, period, dateFrom, dateTo],
  );

  const summary = useMemo(() => summarizeSales(filtered), [filtered]);
  const insight = useMemo(
    () => (search.trim() ? buildProductInsight(allLines, stockRows, search) : null),
    [allLines, stockRows, search],
  );
  const alerts = useMemo(() => generateSmartAlerts(filtered), [filtered]);

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          Yukleniyor&hellip;
        </div>
      </main>
    );
  }

  const summaryCards = [
    { label: "Bugunku satis", value: fmtMoney(summary.todaySales) },
    { label: "Haftalik satis", value: fmtMoney(summary.weekSales) },
    { label: "Aylik satis", value: fmtMoney(summary.monthSales) },
    { label: "Yillik satis", value: fmtMoney(summary.yearSales) },
    { label: "Toplam ciro", value: fmtMoney(summary.totalRevenue) },
    { label: "Toplam maliyet", value: fmtMoney(summary.totalCost) },
    { label: "Toplam kar", value: fmtMoney(summary.totalProfit) },
    { label: "Toplam zarar", value: fmtMoney(summary.totalLoss) },
    { label: "Satilan urun adedi", value: summary.unitsSold.toFixed(1) },
    { label: "Ortalama kar orani", value: `%${summary.avgProfitPct.toFixed(1)}` },
  ];

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-rose-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-pink-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        {isDemo && <DemoUrunStokBanner />}
        <header className={`${panelClass} mb-3`}>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">Rapor &amp; analiz</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">
            Satis Raporlari &amp; Karar Destek
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Salt okunur rapor ekrani. Tum modul satis gecmisleri tekillestirilererek gosterilir.
          </p>
        </header>

        <section className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((c) => (
            <SummaryCard key={c.label} label={c.label} value={c.value} />
          ))}
        </section>

        <section className={`${panelClass} mb-3 space-y-3`}>
          <h2 className="text-sm font-black text-slate-800">Filtreler</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black">Urun ara</span>
              <input
                className={inputClass}
                type="search"
                placeholder="Orn. Ametist, Lavanta Yagi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black">Kategori</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory | "all")}
              >
                <option value="all">Tumu</option>
                {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", "Bugun"],
                ["week", "Bu hafta"],
                ["month", "Bu ay"],
                ["year", "Bu yil"],
                ["all", "Tum zamanlar"],
                ["custom", "Ozel tarih"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={periodBtn(period === id)} onClick={() => setPeriod(id)}>
                {label}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black">Baslangic</span>
                <input className={inputClass} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black">Bitis</span>
                <input className={inputClass} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs font-black">Dogaltas USD kuru (TL)</span>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              placeholder="Canli stok maliyeti"
            />
          </label>
        </section>

        {insight ? (
          <section className={`${panelClass} mb-3 border-rose-300`}>
            <h2 className="text-base font-black text-slate-900">Satin alma karar destegi &mdash; {insight.productName}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-xl px-4 py-2 text-base font-black ${insight.decisionColor}`}>
                {insight.decision}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Bu yil satis</p>
                <p className="text-xl font-black">{insight.soldYear}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Bu ay satis</p>
                <p className="text-xl font-black">{insight.soldMonth}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Son 30 gun</p>
                <p className="text-xl font-black">{insight.sold30d}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Canli stok</p>
                <p className="text-xl font-black">
                  {insight.currentStock} {insight.stockUnit}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Toplam ciro</p>
                <p className="text-lg font-black">{fmtMoney(insight.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Toplam kar</p>
                <p className="text-lg font-black">{fmtMoney(insight.totalProfit)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Ort. satis fiyati</p>
                <p className="text-lg font-black">{fmtMoney(insight.avgSalePrice)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Ort. maliyet</p>
                <p className="text-lg font-black">{fmtMoney(insight.avgCost)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-600">
              Son satis: {insight.lastSaleDate || "—"} &middot; En cok satilan tip: {insight.topType}
            </p>
          </section>
        ) : null}

        {alerts.length > 0 ? (
          <section className={`${panelClass} mb-3 border-amber-200 bg-amber-50/50`}>
            <h2 className="text-sm font-black text-amber-900">Akilli uyarilar</h2>
            <ul className="mt-3 space-y-1.5">
              {alerts.map((a) => (
                <li key={a} className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-amber-950">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mb-3">
          <h2 className="mb-3 text-base font-black text-slate-900">Satis analizleri</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RankList title="En cok satan" items={topSelling(filtered)} valueKey="qty" />
            <RankList title="En az satan" items={leastSelling(filtered)} valueKey="qty" />
            <RankList title="En cok kar birakan" items={topProfit(filtered)} valueKey="profit" />
            <RankList title="En az kar birakan" items={leastProfit(filtered)} valueKey="profit" />
            <RankList title="Zarar ettiren" items={lossMaking(filtered)} valueKey="profit" />
            <RankList title="Stoktan en cok cikan" items={mostStockOut(filtered)} valueKey="qty" />
            <RankList
              title="Cok stok, az satis"
              items={highStockLowSales(filtered, stockRows)}
              valueKey="qty"
            />
            <RankList
              title="Az stok, cok satis"
              items={lowStockHighSales(filtered, stockRows)}
              valueKey="qty"
            />
          </div>
        </section>

        <section className={panelClass}>
          <h2 className="mb-3 text-base font-black text-slate-900">Satis tablosu</h2>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">
              Secilen filtrelere uygun satis kaydi bulunamadi.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rose-100 text-xs font-black uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Tarih</th>
                    <th className="px-2 py-2">Kategori</th>
                    <th className="px-2 py-2">Ürün</th>
                    <th className="px-2 py-2 text-right">Miktar</th>
                    <th className="px-2 py-2">Birim</th>
                    <th className="px-2 py-2 text-right">Maliyet</th>
                    <th className="px-2 py-2 text-right">Satış</th>
                    <th className="px-2 py-2 text-right">Kâr</th>
                    <th className="px-2 py-2 text-right">Kâr %</th>
                    <th className="px-2 py-2">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-rose-50 hover:bg-rose-50/40">
                      <td className="px-2 py-2 font-semibold whitespace-nowrap">{row.timestamp}</td>
                      <td className="px-2 py-2">{row.categoryLabel}</td>
                      <td className="px-2 py-2 font-bold">
                        {row.productName}
                        {row.productSubtitle ? (
                          <span className="block text-xs font-medium text-slate-500">{row.productSubtitle}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right font-black">{row.qty}</td>
                      <td className="px-2 py-2">{row.unit}</td>
                      <td className="px-2 py-2 text-right">{fmtMoney(row.lineCost)}</td>
                      <td className="px-2 py-2 text-right">{fmtMoney(row.lineSale)}</td>
                      <td
                        className={`px-2 py-2 text-right font-black ${
                          row.profit < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {fmtMoney(row.profit)}
                      </td>
                      <td className="px-2 py-2 text-right">{row.profitPct.toFixed(1)}%</td>
                      <td className="px-2 py-2 text-xs font-bold">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
