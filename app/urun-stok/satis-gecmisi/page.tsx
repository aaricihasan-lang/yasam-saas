"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(254,205,211,0.35),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(251,113,133,0.12),transparent_30%),linear-gradient(160deg,#fff1f2_0%,#fdf2f8_42%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-rose-200/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-rose-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-200/50";

const btnSecondary =
  "inline-flex h-12 min-h-[48px] items-center justify-center rounded-2xl border-2 border-rose-200 bg-rose-50 px-6 text-sm font-black text-slate-800 transition hover:bg-rose-100 no-underline";

const periodBtn = (active: boolean) =>
  `rounded-2xl border-2 px-4 py-3 text-sm font-black transition ${
    active
      ? "border-rose-500 bg-rose-100 text-rose-900"
      : "border-rose-200 bg-white text-slate-700 hover:border-rose-300"
  }`;

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border-2 border-rose-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black leading-tight text-slate-900 sm:text-2xl">{value}</p>
    </div>
  );
}

function RankList({ title, items, valueKey }: { title: string; items: ProductRank[]; valueKey: "qty" | "profit" | "revenue" }) {
  return (
    <div className="rounded-[24px] border-2 border-rose-100 bg-white/90 p-4">
      <h3 className="text-base font-black text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Veri yok</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((p, i) => (
            <li key={`${p.productName}-${p.category}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                {i + 1}. {p.productName}
              </span>
              <span className="shrink-0 text-sm font-black text-rose-800">
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
  const [allLines, setAllLines] = useState<ReturnType<typeof loadAllReportLines>>([]);
  const [stockRows, setStockRows] = useState<ReturnType<typeof loadLiveStockRows>>([]);
  const [usdRate, setUsdRate] = useState("");

  const reload = useCallback(() => {
    const rate = toFloat(usdRate, 0);
    setAllLines(loadAllReportLines(rate));
    setStockRows(loadLiveStockRows(rate));
  }, [usdRate]);

  useEffect(() => {
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
        <div className="flex min-h-screen items-center justify-center text-lg font-semibold text-slate-600">
          Yükleniyor…
        </div>
      </main>
    );
  }

  const summaryCards = [
    { label: "Bugünkü satış", value: fmtMoney(summary.todaySales) },
    { label: "Haftalık satış", value: fmtMoney(summary.weekSales) },
    { label: "Aylık satış", value: fmtMoney(summary.monthSales) },
    { label: "Yıllık satış", value: fmtMoney(summary.yearSales) },
    { label: "Toplam ciro", value: fmtMoney(summary.totalRevenue) },
    { label: "Toplam maliyet", value: fmtMoney(summary.totalCost) },
    { label: "Toplam kâr", value: fmtMoney(summary.totalProfit) },
    { label: "Toplam zarar", value: fmtMoney(summary.totalLoss) },
    { label: "Satılan ürün adedi", value: summary.unitsSold.toFixed(1) },
    { label: "Ortalama kâr oranı", value: `%${summary.avgProfitPct.toFixed(1)}` },
  ];

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-rose-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-pink-200/30 blur-3xl" />
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
          <p className="text-sm font-black uppercase tracking-[0.3em] text-rose-700">Rapor & analiz</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl xl:text-5xl">
            Satış Raporları & Karar Destek
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Salt okunur rapor ekranı — satış, stok düzenleme veya kayıt silme yapılmaz. Tüm modül satış
            geçmişleri tekilleştirilerek gösterilir.
          </p>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((c) => (
            <SummaryCard key={c.label} label={c.label} value={c.value} />
          ))}
        </section>

        <section className={`${panelClass} mb-6 space-y-4`}>
          <h2 className="text-lg font-black text-slate-800">Filtreler</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-black">Ürün ara</span>
              <input
                className={inputClass}
                type="search"
                placeholder="Örn. Ametist, Lavanta Yağı…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black">Kategori</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory | "all")}
              >
                <option value="all">Tümü</option>
                {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Bugün"],
                ["week", "Bu hafta"],
                ["month", "Bu ay"],
                ["year", "Bu yıl"],
                ["all", "Tüm zamanlar"],
                ["custom", "Özel tarih"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={periodBtn(period === id)} onClick={() => setPeriod(id)}>
                {label}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black">Başlangıç</span>
                <input className={inputClass} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-black">Bitiş</span>
                <input className={inputClass} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="block max-w-xs">
            <span className="mb-2 block text-sm font-black">Doğaltaş USD kuru (₺)</span>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              placeholder="Canlı stok maliyeti"
            />
          </label>
        </section>

        {insight ? (
          <section className={`${panelClass} mb-6 border-rose-300`}>
            <h2 className="text-xl font-black text-slate-900">Satın alma karar desteği — {insight.productName}</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className={`rounded-2xl px-5 py-3 text-lg font-black ${insight.decisionColor}`}>
                {insight.decision}
              </span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Bu yıl satış</p>
                <p className="text-2xl font-black">{insight.soldYear}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Bu ay satış</p>
                <p className="text-2xl font-black">{insight.soldMonth}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Son 30 gün</p>
                <p className="text-2xl font-black">{insight.sold30d}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Canlı stok</p>
                <p className="text-2xl font-black">
                  {insight.currentStock} {insight.stockUnit}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Toplam ciro</p>
                <p className="text-xl font-black">{fmtMoney(insight.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Toplam kâr</p>
                <p className="text-xl font-black">{fmtMoney(insight.totalProfit)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Ort. satış fiyatı</p>
                <p className="text-xl font-black">{fmtMoney(insight.avgSalePrice)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Ort. maliyet</p>
                <p className="text-xl font-black">{fmtMoney(insight.avgCost)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-600">
              Son satış: {insight.lastSaleDate || "—"} · En çok satılan tip: {insight.topType}
            </p>
          </section>
        ) : null}

        {alerts.length > 0 ? (
          <section className={`${panelClass} mb-6 border-amber-200 bg-amber-50/50`}>
            <h2 className="text-lg font-black text-amber-900">Akıllı uyarılar</h2>
            <ul className="mt-4 space-y-2">
              {alerts.map((a) => (
                <li key={a} className="rounded-xl bg-white/80 px-4 py-3 text-base font-semibold text-amber-950">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mb-6">
          <h2 className="mb-4 text-xl font-black text-slate-900">Satış analizleri</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <RankList title="En çok satan" items={topSelling(filtered)} valueKey="qty" />
            <RankList title="En az satan" items={leastSelling(filtered)} valueKey="qty" />
            <RankList title="En çok kâr bırakan" items={topProfit(filtered)} valueKey="profit" />
            <RankList title="En az kâr bırakan" items={leastProfit(filtered)} valueKey="profit" />
            <RankList title="Zarar ettiren" items={lossMaking(filtered)} valueKey="profit" />
            <RankList title="Stoktan en çok çıkan" items={mostStockOut(filtered)} valueKey="qty" />
            <RankList
              title="Çok stok, az satış"
              items={highStockLowSales(filtered, stockRows)}
              valueKey="qty"
            />
            <RankList
              title="Az stok, çok satış"
              items={lowStockHighSales(filtered, stockRows)}
              valueKey="qty"
            />
          </div>
        </section>

        <section className={panelClass}>
          <h2 className="mb-4 text-xl font-black text-slate-900">Satış tablosu</h2>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-base text-slate-600">
              Seçilen filtrelere uygun satış kaydı bulunamadı.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm sm:text-base">
                <thead>
                  <tr className="border-b-2 border-rose-100 text-xs font-black uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Tarih</th>
                    <th className="px-3 py-3">Kategori</th>
                    <th className="px-3 py-3">Ürün</th>
                    <th className="px-3 py-3 text-right">Miktar</th>
                    <th className="px-3 py-3">Birim</th>
                    <th className="px-3 py-3 text-right">Maliyet</th>
                    <th className="px-3 py-3 text-right">Satış</th>
                    <th className="px-3 py-3 text-right">Kâr</th>
                    <th className="px-3 py-3 text-right">Kâr %</th>
                    <th className="px-3 py-3">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-rose-50 hover:bg-rose-50/40">
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">{row.timestamp}</td>
                      <td className="px-3 py-3">{row.categoryLabel}</td>
                      <td className="px-3 py-3 font-bold">
                        {row.productName}
                        {row.productSubtitle ? (
                          <span className="block text-xs font-medium text-slate-500">{row.productSubtitle}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-black">{row.qty}</td>
                      <td className="px-3 py-3">{row.unit}</td>
                      <td className="px-3 py-3 text-right">{fmtMoney(row.lineCost)}</td>
                      <td className="px-3 py-3 text-right">{fmtMoney(row.lineSale)}</td>
                      <td
                        className={`px-3 py-3 text-right font-black ${
                          row.profit < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {fmtMoney(row.profit)}
                      </td>
                      <td className="px-3 py-3 text-right">{row.profitPct.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-xs font-bold">{row.source}</td>
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
