/** Satış Raporları & Karar Destek — salt okunur analiz */

import {
  type AccessorySaleRecord,
  loadAccessorySales,
} from "@/lib/urun-stok/accessoryStockLogic";
import {
  fmtMoney,
  itemKey,
  type SaleLine,
  type SaleRecord,
  loadSales as loadDogaltasSales,
  toFloat,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  CATEGORY_LABELS,
  GENERAL_SALES_STORAGE_KEY,
  type GeneralSaleRecord,
  type ProductCategory,
  loadGeneralSales,
} from "@/lib/urun-stok/generalSalesLogic";
import { loadLiveStockRows, type LiveStockRow } from "@/lib/urun-stok/liveStockLogic";
import {
  type OilSaleRecord,
  loadOilSales,
} from "@/lib/urun-stok/oilStockLogic";
import {
  type OtherSaleRecord,
  loadOtherSales,
} from "@/lib/urun-stok/otherStockLogic";
import {
  type SoapCreamSaleRecord,
  loadSoapCreamSales,
} from "@/lib/urun-stok/soapCreamStockLogic";

export type ReportSaleLine = {
  id: string;
  timestamp: string;
  date: Date | null;
  category: ProductCategory;
  categoryLabel: string;
  productName: string;
  productSubtitle: string;
  productKey: string;
  qty: number;
  unit: string;
  lineCost: number;
  lineSale: number;
  profit: number;
  profitPct: number;
  source: string;
  recordName: string;
};

export type PeriodFilter =
  | "today"
  | "week"
  | "month"
  | "year"
  | "all"
  | "custom";

export type SalesSummary = {
  todaySales: number;
  weekSales: number;
  monthSales: number;
  yearSales: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalLoss: number;
  unitsSold: number;
  avgProfitPct: number;
};

export type ProductInsight = {
  productName: string;
  category: ProductCategory;
  soldYear: number;
  soldMonth: number;
  sold30d: number;
  totalRevenue: number;
  totalProfit: number;
  avgSalePrice: number;
  avgCost: number;
  currentStock: number;
  stockUnit: string;
  lastSaleDate: string | null;
  topType: string;
  decision: string;
  decisionColor: string;
  badges: string[];
};

const SOURCE_LABELS: Record<ProductCategory, string> = {
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
  other: "Diğer Ürünler",
};

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/İ/g, "i").replace(/ı/g, "i");
}

function parseTimestamp(ts: string): Date | null {
  if (!ts) return null;
  const d = new Date(ts.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function lineFingerprint(l: ReportSaleLine): string {
  return [
    l.timestamp,
    l.category,
    l.productKey,
    l.qty.toFixed(4),
    l.lineCost.toFixed(2),
    l.lineSale.toFixed(2),
  ].join("|");
}

function allocLineSale(lineCost: number, totalCost: number, salePrice: number): number {
  if (totalCost <= 0) return salePrice;
  return (lineCost / totalCost) * salePrice;
}

function dogaltasLineToReport(
  line: SaleLine,
  rec: SaleRecord,
  source: string,
): ReportSaleLine {
  const lineCost = line.line_total || line.unit * line.qty;
  const lineSale = allocLineSale(lineCost, rec.total_cost, rec.sale_price);
  const profit = lineSale - lineCost;
  const date = parseTimestamp(rec.timestamp);
  return {
    id: `dogaltas:${rec.timestamp}:${line.stone}:${line.type}:${line.qty}`,
    timestamp: rec.timestamp,
    date,
    category: "dogaltas",
    categoryLabel: CATEGORY_LABELS.dogaltas,
    productName: line.stone,
    productSubtitle: line.type,
    productKey: itemKey(line.stone, line.type),
    qty: line.qty,
    unit: "adet",
    lineCost,
    lineSale,
    profit,
    profitPct: lineCost > 0 ? (profit / lineCost) * 100 : 0,
    source,
    recordName: rec.name,
  };
}

function flattenDogaltas(source: string): ReportSaleLine[] {
  return loadDogaltasSales().flatMap((rec) =>
    rec.lines.map((l) => dogaltasLineToReport(l, rec, source)),
  );
}

type MeasureSaleLine = {
  productId: string;
  productName: string;
  saleQty: number;
  saleUnit?: string;
  saleBaseQty?: number;
  lineCost: number;
  lineSale: number;
  productGroup?: string;
  oilType?: string;
};

function flattenMeasure(
  category: ProductCategory,
  records: { lines: MeasureSaleLine[]; timestamp: string; name: string }[],
  source: string,
): ReportSaleLine[] {
  return records.flatMap((rec) =>
    rec.lines.map((l) => {
      const lineCost = l.lineCost;
      const lineSale = l.lineSale;
      const profit = lineSale - lineCost;
      const qty = l.saleBaseQty ?? l.saleQty;
      const date = parseTimestamp(rec.timestamp);
      return {
        id: `${category}:${rec.timestamp}:${l.productId}:${qty}`,
        timestamp: rec.timestamp,
        date,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        productName: l.productName,
        productSubtitle: l.productGroup || l.oilType || "",
        productKey: l.productId,
        qty,
        unit: l.saleUnit || "adet",
        lineCost,
        lineSale,
        profit,
        profitPct: lineCost > 0 ? (profit / lineCost) * 100 : 0,
        source,
        recordName: rec.name,
      };
    }),
  );
}

function flattenGeneral(): ReportSaleLine[] {
  return loadGeneralSales().flatMap((rec) =>
    rec.lines.map((l) => {
      const lineCost = l.lineCost;
      const lineSale = l.lineSale;
      const profit = lineSale - lineCost;
      const date = parseTimestamp(rec.timestamp);
      return {
        id: `general:${rec.timestamp}:${l.category}:${l.productId}:${l.saleBaseQty}`,
        timestamp: rec.timestamp,
        date,
        category: l.category,
        categoryLabel: CATEGORY_LABELS[l.category],
        productName: l.productName,
        productSubtitle: l.productSubtitle,
        productKey: l.productId,
        qty: l.saleBaseQty ?? l.saleQty,
        unit: l.saleUnit,
        lineCost,
        lineSale,
        profit,
        profitPct: lineCost > 0 ? (profit / lineCost) * 100 : 0,
        source: "Merkezi Satış",
        recordName: rec.name,
      };
    }),
  );
}

/** Tüm kaynaklardan satış satırlarını yükle; çift kayıtları tekilleştir. */
export function loadAllReportLines(usdRate = 0): ReportSaleLine[] {
  void usdRate;
  const general = flattenGeneral();
  const seen = new Set(general.map(lineFingerprint));

  const moduleLines = [
    ...flattenDogaltas(SOURCE_LABELS.dogaltas),
    ...flattenMeasure("oil", loadOilSales(), SOURCE_LABELS.oil),
    ...flattenMeasure("soap_cream", loadSoapCreamSales(), SOURCE_LABELS.soap_cream),
    ...flattenMeasure("accessory", loadAccessorySales(), SOURCE_LABELS.accessory),
    ...flattenMeasure("other", loadOtherSales(), SOURCE_LABELS.other),
  ];

  const deduped: ReportSaleLine[] = [...general];
  for (const line of moduleLines) {
    const fp = lineFingerprint(line);
    if (!seen.has(fp)) {
      seen.add(fp);
      deduped.push(line);
    }
  }

  return deduped.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfYear(d: Date): Date {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

function isInPeriod(date: Date | null, period: PeriodFilter, custom?: { from: string; to: string }): boolean {
  if (!date) return period === "all";
  const now = new Date();
  if (period === "all") return true;
  if (period === "today") return date >= startOfDay(now);
  if (period === "week") return date >= startOfWeek(now);
  if (period === "month") return date >= startOfMonth(now);
  if (period === "year") return date >= startOfYear(now);
  if (period === "custom" && custom) {
    const from = custom.from ? startOfDay(new Date(custom.from)) : null;
    const to = custom.to ? new Date(custom.to + "T23:59:59") : null;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }
  return true;
}

export function filterReportLines(
  lines: ReportSaleLine[],
  opts: {
    q: string;
    category: ProductCategory | "all";
    period: PeriodFilter;
    customRange?: { from: string; to: string };
  },
): ReportSaleLine[] {
  let list = lines;
  if (opts.category !== "all") list = list.filter((l) => l.category === opts.category);
  list = list.filter((l) => isInPeriod(l.date, opts.period, opts.customRange));
  const ql = normalize(opts.q);
  if (ql) {
    list = list.filter(
      (l) =>
        normalize(l.productName).includes(ql) ||
        normalize(l.productSubtitle).includes(ql) ||
        normalize(l.categoryLabel).includes(ql),
    );
  }
  return list;
}

export function summarizeSales(lines: ReportSaleLine[]): SalesSummary {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  let todaySales = 0;
  let weekSales = 0;
  let monthSales = 0;
  let yearSales = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let unitsSold = 0;
  let profitPctSum = 0;
  let profitPctCount = 0;

  for (const line of lines) {
    const sale = line.lineSale;
    const cost = line.lineCost;
    const profit = line.profit;

    totalRevenue += sale;
    totalCost += cost;
    if (profit > 0) totalProfit += profit;
    if (profit < 0) totalLoss += Math.abs(profit);
    unitsSold += line.qty;
    if (line.lineCost > 0) {
      profitPctSum += (profit / line.lineCost) * 100;
      profitPctCount++;
    }

    if (line.date) {
      if (line.date >= todayStart) todaySales += sale;
      if (line.date >= weekStart) weekSales += sale;
      if (line.date >= monthStart) monthSales += sale;
      if (line.date >= yearStart) yearSales += sale;
    }
  }

  return {
    todaySales,
    weekSales,
    monthSales,
    yearSales,
    totalRevenue,
    totalCost,
    totalProfit,
    totalLoss,
    unitsSold,
    avgProfitPct: profitPctCount > 0 ? profitPctSum / profitPctCount : 0,
  };
}

export type ProductRank = {
  productName: string;
  productSubtitle: string;
  category: ProductCategory;
  qty: number;
  revenue: number;
  profit: number;
};

function rankProducts(lines: ReportSaleLine[]): ProductRank[] {
  const map = new Map<string, ProductRank>();
  for (const l of lines) {
    const key = `${l.category}:${l.productKey}`;
    const existing = map.get(key) || {
      productName: l.productName,
      productSubtitle: l.productSubtitle,
      category: l.category,
      qty: 0,
      revenue: 0,
      profit: 0,
    };
    existing.qty += l.qty;
    existing.revenue += l.lineSale;
    existing.profit += l.profit;
    map.set(key, existing);
  }
  return Array.from(map.values());
}

export function topSelling(lines: ReportSaleLine[], limit = 5): ProductRank[] {
  return [...rankProducts(lines)].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function leastSelling(lines: ReportSaleLine[], limit = 5): ProductRank[] {
  return [...rankProducts(lines)].sort((a, b) => a.qty - b.qty).slice(0, limit);
}

export function topProfit(lines: ReportSaleLine[], limit = 5): ProductRank[] {
  return [...rankProducts(lines)].sort((a, b) => b.profit - a.profit).slice(0, limit);
}

export function leastProfit(lines: ReportSaleLine[], limit = 5): ProductRank[] {
  return [...rankProducts(lines)].sort((a, b) => a.profit - b.profit).slice(0, limit);
}

export function lossMaking(lines: ReportSaleLine[], limit = 10): ProductRank[] {
  return [...rankProducts(lines)].filter((p) => p.profit < 0).slice(0, limit);
}

export function mostStockOut(lines: ReportSaleLine[], limit = 5): ProductRank[] {
  return [...rankProducts(lines)].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function highStockLowSales(
  lines: ReportSaleLine[],
  stockRows: LiveStockRow[],
  limit = 5,
): ProductRank[] {
  const stockMap = new Map(stockRows.map((s) => [s.id, s]));
  return [...rankProducts(lines)]
    .filter((p) => {
      const stock = stockMap.get(`${p.category}:${p.productKey}`);
      return stock && stock.stockAmount > 0 && p.qty < 3;
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function lowStockHighSales(
  lines: ReportSaleLine[],
  stockRows: LiveStockRow[],
  limit = 5,
): ProductRank[] {
  const stockMap = new Map(stockRows.map((s) => [s.id, s]));
  return [...rankProducts(lines)]
    .filter((p) => {
      const stock = stockMap.get(`${p.category}:${p.productKey}`);
      return stock && (stock.isCritical || stock.stockAmount <= 5);
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function buildProductInsight(
  lines: ReportSaleLine[],
  stockRows: LiveStockRow[],
  productName: string,
): ProductInsight | null {
  const ql = normalize(productName);
  if (!ql) return null;

  const productLines = lines.filter((l) => normalize(l.productName).includes(ql));
  if (!productLines.length) return null;

  const now = new Date();
  const yearStart = startOfYear(now);
  const monthStart = startOfMonth(now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let soldYear = 0;
  let soldMonth = 0;
  let sold30d = 0;
  let totalRevenue = 0;
  let totalProfit = 0;

  for (const l of productLines) {
    if (l.date && l.date >= yearStart) soldYear += l.qty;
    if (l.date && l.date >= monthStart) soldMonth += l.qty;
    if (l.date && l.date >= thirtyDaysAgo) sold30d += l.qty;
    totalRevenue += l.lineSale;
    totalProfit += l.profit;
  }

  const avgSalePrice =
    productLines.length > 0
      ? productLines.reduce((s, l) => s + l.lineSale, 0) / productLines.length
      : 0;
  const avgCost =
    productLines.length > 0
      ? productLines.reduce((s, l) => s + l.lineCost, 0) / productLines.length
      : 0;

  const stock =
    stockRows.find((s) => normalize(s.name).includes(ql)) ||
    stockRows.find((s) => normalize(s.name) === ql);

  const typeCount = new Map<string, number>();
  for (const l of productLines) {
    const t = l.productSubtitle || "Genel";
    typeCount.set(t, (typeCount.get(t) || 0) + l.qty);
  }
  const topType =
    Array.from(typeCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const lastSaleDate =
    productLines
      .map((l) => l.timestamp)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

  let decision = "İNCELE";
  let decisionColor = "bg-slate-100 text-slate-800";

  const all30d = lines
    .filter((l) => l.date && l.date >= thirtyDaysAgo)
  const median30 =
    all30d.length > 0
      ? all30d.reduce((s, l) => s + l.qty, 0) / new Set(all30d.map((l) => l.productKey)).size
      : 0;
  const highSales = sold30d >= Math.max(median30 * 1.2, 3);
  const lowSales = sold30d <= Math.max(median30 * 0.4, 1);
  const stockAmt = stock?.stockAmount ?? 0;
  const lowStock = stock?.isCritical || stockAmt <= 5;
  const highStock = stockAmt > 15;

  if (totalProfit < 0) {
    decision = "FİYATI GÖZDEN GEÇİR";
    decisionColor = "bg-amber-100 text-amber-900";
  } else if (highSales && lowStock) {
    decision = "ALINABİLİR";
    decisionColor = "bg-emerald-100 text-emerald-900";
  } else if (highSales && highStock) {
    decision = "BEKLE";
    decisionColor = "bg-blue-100 text-blue-900";
  } else if (lowSales && highStock) {
    decision = "ALMA";
    decisionColor = "bg-rose-100 text-rose-900";
  } else if (lowSales && lowStock) {
    decision = "DİKKATLİ AL";
    decisionColor = "bg-orange-100 text-orange-900";
  }

  return {
    productName: productLines[0]?.productName || productName,
    category: productLines[0]?.category || "dogaltas",
    soldYear,
    soldMonth,
    sold30d,
    totalRevenue,
    totalProfit,
    avgSalePrice,
    avgCost,
    currentStock: stock?.stockAmount || 0,
    stockUnit: stock?.unitLabel || "adet",
    lastSaleDate,
    topType,
    decision,
    decisionColor,
    badges: [],
  };
}

export function generateSmartAlerts(lines: ReportSaleLine[]): string[] {
  const alerts: string[] = [];
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const thisMonth = lines.filter((l) => l.date && l.date >= monthStart);
  const prevMonth = lines.filter(
    (l) => l.date && l.date >= prevMonthStart && l.date < monthStart,
  );

  if (thisMonth.length > 0) {
    const top = [...rankProducts(thisMonth)].sort((a, b) => b.qty - a.qty)[0];
    if (top) {
      alerts.push(`Bu ay en çok satan ürün: ${top.productName}`);
    }
  }

  const lossCount = [...rankProducts(lines)].filter((p) => p.profit < 0).length;
  if (lossCount > 0) {
    alerts.push(`${lossCount} ürün zararına satılmış`);
  }

  const thisMonthRev = thisMonth.reduce((s, l) => s + l.lineSale, 0);
  const prevMonthRev = prevMonth.reduce((s, l) => s + l.lineSale, 0);
  if (prevMonthRev > 0 && thisMonthRev > prevMonthRev) {
    const pct = ((thisMonthRev - prevMonthRev) / prevMonthRev) * 100;
    alerts.push(`Satışlar geçen aya göre %${pct.toFixed(0)} arttı`);
  }

  for (const cat of Object.keys(CATEGORY_LABELS) as ProductCategory[]) {
    const label = CATEGORY_LABELS[cat];
    const cur = thisMonth.filter((l) => l.category === cat).reduce((s, l) => s + l.lineSale, 0);
    const prev = prevMonth.filter((l) => l.category === cat).reduce((s, l) => s + l.lineSale, 0);
    if (prev > 0 && cur > prev * 1.1) {
      alerts.push(`${label} satışları geçen aya göre arttı`);
    }
    if (prev > 0 && cur < prev * 0.85) {
      alerts.push(`${label} kategorisi yavaşladı`);
    }
  }

  return alerts.slice(0, 8);
}

export { fmtMoney, CATEGORY_LABELS, GENERAL_SALES_STORAGE_KEY };
export type { ProductCategory, LiveStockRow };
