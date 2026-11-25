"use client";

import { useTranslations } from "next-intl";
import { useStockServerText } from "../useStockServerText";
import { useStockFormat } from "../useStockFormat";

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
  fmtMoney as libFmtMoney,
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
import { loadDbReportLines, salesLoadIssue } from "@/lib/urun-stok/salesHistoryDb";
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
  const { fmtMoney } = useStockFormat({ fmtMoney: libFmtMoney });
  const t = useTranslations("stock.reports");
  return (
    <div className="rounded-xl border-2 border-rose-100 bg-white/90 p-3">
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{t("noData")}</p>
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
  const t = useTranslations("stock.reports");
  const ss = useStockServerText();
  const { fmtMoney } = useStockFormat({ fmtMoney: libFmtMoney });
  const tS = useTranslations("stock.common");
  const tCat = useTranslations("stock.pricing");
  // Kategori kodu kanonik (option value); yalnız görünen etiket çevrilir.
  const catLabel = (c: string) => (tCat.has(`categories.${c}`) ? tCat(`categories.${c}`) : CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c);
  const [hydrated, setHydrated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [allLines, setAllLines] = useState<ReturnType<typeof loadAllReportLines>>([]);
  const [stockRows, setStockRows] = useState<ReturnType<typeof loadLiveStockRows>>([]);
  const [usdRate, setUsdRate] = useState("");
  // Satış Öncesi Hata #3: eksik/başarısız yükleme → toplamlar kesin sonuç olarak GÖSTERİLMEZ.
  const [loadIssue, setLoadIssue] = useState<string | null>(null);

  // USM-003/017: satış geçmişi DB-canonical (real hesap). Demo localStorage kalır.
  const reload = useCallback(async () => {
    const rate = toFloat(usdRate, 0);
    const demo = readYasamUser()?.is_demo_account === true;
    setStockRows(loadLiveStockRows(rate));
    if (demo) {
      setAllLines(loadAllReportLines(rate));
      setLoadIssue(null);
    } else {
      const res = await loadDbReportLines();
      setAllLines(res.lines);
      // QA K3D-01: TR'de lib metni birebir; diğer dillerde katalog karşılığı.
      const issue = salesLoadIssue(res);
      setLoadIssue(issue && !ss.isSourceLocale ? tS("msg.loadIssue") : issue);
    }
  }, [usdRate, ss, tS]);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    void reload().finally(() => setHydrated(true));
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => { void reload(); };
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
          {t("loading")}
        </div>
      </main>
    );
  }

  const na = "—";
  const summaryCards = loadIssue ? [
    { label: t("cards.today"), value: na },
    { label: t("cards.week"), value: na },
    { label: t("cards.month"), value: na },
    { label: t("cards.year"), value: na },
    { label: t("cards.revenue"), value: na },
    { label: t("cards.cost"), value: na },
    { label: t("cards.profit"), value: na },
    { label: t("cards.loss"), value: na },
    { label: t("cards.units"), value: na },
    { label: t("cards.avgMargin"), value: na },
  ] : [
    { label: t("cards.today"), value: fmtMoney(summary.todaySales) },
    { label: t("cards.week"), value: fmtMoney(summary.weekSales) },
    { label: t("cards.month"), value: fmtMoney(summary.monthSales) },
    { label: t("cards.year"), value: fmtMoney(summary.yearSales) },
    { label: t("cards.revenue"), value: fmtMoney(summary.totalRevenue) },
    { label: t("cards.cost"), value: fmtMoney(summary.totalCost) },
    { label: t("cards.profit"), value: fmtMoney(summary.totalProfit) },
    { label: t("cards.loss"), value: fmtMoney(summary.totalLoss) },
    { label: t("cards.units"), value: summary.unitsSold.toFixed(1) },
    { label: t("cards.avgMargin"), value: `%${summary.avgProfitPct.toFixed(1)}` },
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-700">{t("eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("subtitle")}
          </p>
        </header>

        {loadIssue ? (
          <section role="alert" data-testid="sales-report-incomplete" className={`${panelClass} mb-3 border-red-300 bg-red-50/90`}>
            <p className="text-sm font-black text-red-800">{t("incomplete")}</p>
            <p className="mt-1 text-sm font-semibold text-red-900">{loadIssue}</p>
            <button
              type="button"
              className="mt-2 rounded-xl border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 hover:bg-red-100"
              onClick={() => void reload()}
            >
              {t("retry")}
            </button>
          </section>
        ) : null}

        <section className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((c) => (
            <SummaryCard key={c.label} label={c.label} value={c.value} />
          ))}
        </section>

        <section className={`${panelClass} mb-3 space-y-3`}>
          <h2 className="text-sm font-black text-slate-800">{t("filters")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black">{t("searchProduct")}</span>
              <input
                className={inputClass}
                type="search"
                placeholder={t("searchPh")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black">{t("category")}</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory | "all")}
              >
                <option value="all">{t("all")}</option>
                {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {catLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", t("period.today")],
                ["week", t("period.week")],
                ["month", t("period.month")],
                ["year", t("period.year")],
                ["all", t("period.all")],
                ["custom", t("period.custom")],
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
                <span className="mb-1 block text-xs font-black">{t("start")}</span>
                <input className={inputClass} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black">{t("end")}</span>
                <input className={inputClass} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs font-black">{t("usdRate")}</span>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              placeholder={t("usdRatePh")}
            />
          </label>
        </section>

        {insight && !loadIssue ? (
          <section className={`${panelClass} mb-3 border-rose-300`}>
            <h2 className="text-base font-black text-slate-900">{t("insightTitle", { product: insight.productName })}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-xl px-4 py-2 text-base font-black ${insight.decisionColor}`}>
                {insight.decision}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.yearSales")}</p>
                <p className="text-xl font-black">{insight.soldYear}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.monthSales")}</p>
                <p className="text-xl font-black">{insight.soldMonth}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.last30")}</p>
                <p className="text-xl font-black">{insight.sold30d}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.liveStock")}</p>
                <p className="text-xl font-black">
                  {insight.currentStock} {insight.stockUnit}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.revenue")}</p>
                <p className="text-lg font-black">{fmtMoney(insight.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.profit")}</p>
                <p className="text-lg font-black">{fmtMoney(insight.totalProfit)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.avgPrice")}</p>
                <p className="text-lg font-black">{fmtMoney(insight.avgSalePrice)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{t("insight.avgCost")}</p>
                <p className="text-lg font-black">{fmtMoney(insight.avgCost)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-600">
              {t("insight.footer", { date: insight.lastSaleDate || "—", type: insight.topType })}
            </p>
          </section>
        ) : null}

        {alerts.length > 0 && !loadIssue ? (
          <section className={`${panelClass} mb-3 border-amber-200 bg-amber-50/50`}>
            <h2 className="text-sm font-black text-amber-900">{t("alerts")}</h2>
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
          <h2 className="mb-3 text-base font-black text-slate-900">{t("analytics")}</h2>
          {loadIssue ? (
            <p className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">
              {t("rankHidden")}
            </p>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RankList title={t("rank.topSelling")} items={topSelling(filtered)} valueKey="qty" />
            <RankList title={t("rank.leastSelling")} items={leastSelling(filtered)} valueKey="qty" />
            <RankList title={t("rank.topProfit")} items={topProfit(filtered)} valueKey="profit" />
            <RankList title={t("rank.leastProfit")} items={leastProfit(filtered)} valueKey="profit" />
            <RankList title={t("rank.loss")} items={lossMaking(filtered)} valueKey="profit" />
            <RankList title={t("rank.stockOut")} items={mostStockOut(filtered)} valueKey="qty" />
            <RankList
              title={t("rank.highStockLowSales")}
              items={highStockLowSales(filtered, stockRows)}
              valueKey="qty"
            />
            <RankList
              title={t("rank.lowStockHighSales")}
              items={lowStockHighSales(filtered, stockRows)}
              valueKey="qty"
            />
          </div>
          )}
        </section>

        <section className={panelClass}>
          <h2 className="mb-3 text-base font-black text-slate-900">{t("tableTitle")}</h2>
          {loadIssue ? (
            <p className="mb-3 text-xs font-black text-red-800">{t("partial")}</p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">
              {t("noRows")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rose-100 text-xs font-black uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">{t("col.date")}</th>
                    <th className="px-2 py-2">{t("col.category")}</th>
                    <th className="px-2 py-2">{t("col.product")}</th>
                    <th className="px-2 py-2 text-right">{t("col.qty")}</th>
                    <th className="px-2 py-2">{t("col.unit")}</th>
                    <th className="px-2 py-2 text-right">{t("col.cost")}</th>
                    <th className="px-2 py-2 text-right">{t("col.sale")}</th>
                    <th className="px-2 py-2 text-right">{t("col.profit")}</th>
                    <th className="px-2 py-2 text-right">{t("col.profitPct")}</th>
                    <th className="px-2 py-2">{t("col.source")}</th>
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
                      <td className="px-2 py-2 text-xs font-bold">
                        {row.source}
                        {row.hiddenFromList ? (
                          <span className="block text-[11px] font-semibold text-slate-500">
                            {t("hiddenNote")}
                          </span>
                        ) : null}
                      </td>
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
