/**
 * ÜRÜN & STOK — Word envanter raporu SAF belge kurucusu (USM-002 / USM-006 / USM-007; I18N RAPOR-AB).
 *
 * Route (`app/api/urun-stok/stock-report`) kimlik + tenant-scoped okuma + satır normalizasyonunu yapar;
 * belge burada kurulur (DB/ağ YOK → golden harness gerçek DOCX üretir).
 *
 * I18N çıktı dili sözleşmesi: tüm sistem metinleri `messages/<dil>/reports.stock.json`; `output` verilmezse
 * TR = bugünkü çıktı (golden: scripts/i18n/golden/reports-ab-tr.golden.json). HESAP dilden bağımsız: kritik
 * eşikleri, stok değeri, sayımlar değişmez; kategori KODU kanonik, yalnız etiketi dile göre. Para birimi TRY
 * SABİT (₺); yalnız sayı biçimi dile göre. Ürün adı / tür / grup (kullanıcı verisi) çevrilmez.
 */
import { Document } from "docx";
import {
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  divider,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
import { sourceReportLocale, type ReportLocale } from "@/lib/i18n/reportLocale";

const C_STOK = "4338ca"; // stok indigo
const C_CRIT = "dc2626"; // kritik kırmızı

// Birim tipine göre kritik eşiği (liveStockLogic DEFAULT_THRESHOLDS ile aynı).
const THRESHOLD_ADET = 5;
const THRESHOLD_ML = 300;
const THRESHOLD_GRAM = 300;

export type StockReportExportMode = "all" | "critical";

/** Kanonik kategori kodları (rapor sırası). */
export const STOCK_REPORT_CATEGORY_ORDER = ["dogaltas", "oil", "soap_cream", "accessory", "other"] as const;
export type StockReportCategory = (typeof STOCK_REPORT_CATEGORY_ORDER)[number];

export type StockReportRow = {
  category: StockReportCategory;
  name: string;
  subtitle: string;
  stock: number;
  /** Kayıtlı birim (adet / ml / gram …) — hesapta ham değer; görüntüde bilinen kodlar dile göre. */
  unit: string;
  unitCost: number;
  stockValue: number;
};

function thresholdForUnit(unit: string): number {
  const u = (unit || "").toLowerCase();
  if (u.includes("ml")) return THRESHOLD_ML;
  if (u.includes("gram") || u.includes("gr")) return THRESHOLD_GRAM;
  return THRESHOLD_ADET;
}

/** USM-006: 0 ve negatif dahil: stock <= eşik → kritik/tükenmiş. */
export function isCriticalStockRow(row: Pick<StockReportRow, "stock" | "unit">): boolean {
  return row.stock <= thresholdForUnit(row.unit);
}

export type StockReportInput = {
  rows: StockReportRow[];
  exportMode: StockReportExportMode;
  expertName?: string | null;
  now?: Date;
  /** I18N çıktı dili (route `resolveReportLocale`); verilmezse TR = bugünkü çıktı. */
  output?: ReportLocale | null;
};

export function buildStockReportDoc(input: StockReportInput): { doc: Document; filename: string; itemCount: number } {
  const { rows, exportMode } = input;
  const now = input.now ?? new Date();
  const rl = input.output ?? sourceReportLocale();
  const t = rl.t("reports.stock");
  const count = (key: string, n: number) => t(key, { count: n, shown: String(n) });
  const tz = rl.isSource ? undefined : { locale: rl.intlTag };

  const fmtMoney = (n: number): string => {
    if (!n || n <= 0) return "—";
    return `₺${rl.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const unitLabel = (unit: string): string => {
    const u = unit || "adet";
    return t.has(`unit.${u}`) ? t(`unit.${u}`) : u;
  };
  const fmtStock = (row: StockReportRow): string => {
    const u = unitLabel(row.unit);
    const val = Number.isInteger(row.stock) ? String(row.stock) : row.stock.toFixed(2);
    if (row.stock <= 0) return `${val} ${u} ${t("depleted")}`;
    return `${val} ${u}`;
  };
  const catLabel = (c: StockReportCategory) => t(`category.${c}`);

  const criticalAll = rows.filter(isCriticalStockRow);
  const reportRows = exportMode === "critical" ? criticalAll : rows;

  // ── İstatistikler ──
  let totalValue = 0;
  for (const r of rows) totalValue += Math.max(r.stockValue, 0);
  const depletedCount = rows.filter((r) => r.stock <= 0).length;
  const criticalCount = criticalAll.length;

  const perCategoryCount = new Map<string, number>();
  for (const r of rows) perCategoryCount.set(r.category, (perCategoryCount.get(r.category) ?? 0) + 1);

  // FA-02: rapor tarihi / dosya adı Europe/Istanbul yerel günü (sunucu UTC'de çalışır).
  const today = reportGeneratedLabel(tz, now);
  const dateSlug = reportFileDate(undefined, now);
  const expertName = input.expertName;
  const exportLabel = t(`scope.${exportMode}`);

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1: t("brand"),
    title2: t(`coverTitle.${exportMode}`),
    subtitle: t("coverSubtitle", { scope: exportLabel }),
    date: t("generatedOn", { date: today }),
    stats: [
      { label: t("cover.products"), value: String(rows.length) },
      { label: t("cover.categories"), value: String(perCategoryCount.size) },
      { label: t("cover.critical"), value: String(criticalCount) },
      { label: t("cover.depleted"), value: String(depletedCount) },
      { label: t("cover.value"), value: fmtMoney(totalValue) },
    ],
  }));

  all.push(...buildStatsPage([
    [t("stats.products"), String(rows.length)],
    [t("stats.categories"), String(perCategoryCount.size)],
    [t("stats.critical"), String(criticalCount)],
    [t("stats.depleted"), String(depletedCount)],
    [t("stats.value"), fmtMoney(totalValue)],
    [t("stats.scope"), exportLabel],
    ...(expertName ? [[rl.common.preparedBy, expertName] as [string, string]] : []),
  ], undefined, rl.common));

  // İçindekiler: STATİK + tıklanabilir girişler (gövde başlıklarından toplanır, gövde bittikten sonra bu
  // konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("stok");
  const tocAt = all.length;

  // ── Bölüm 1: Stok Özeti ──
  all.push(toc.h1Colored(t("summary.heading"), C_STOK, true));
  all.push(twoColTable([
    [t("summary.products"), String(rows.length)],
    [t("summary.categories"), String(perCategoryCount.size)],
    [t("summary.critical"), count("summary.productCount", criticalCount)],
    [t("summary.depleted"), count("summary.productCount", depletedCount)],
    [t("summary.value"), fmtMoney(totalValue)],
    [t("summary.scope"), exportLabel],
  ]));
  all.push(spacer());
  all.push(muted(t("summary.note")));

  // ── Bölüm 2: Kritik / Tükenmiş (all modda da göster) ──
  if (criticalAll.length > 0 && exportMode !== "critical") {
    all.push(toc.h1Colored(t("criticalSection.heading"), C_CRIT));
    all.push(muted(count("criticalSection.summary", criticalAll.length)));
    all.push(spacer());
    all.push(twoColTable(
      criticalAll.map((r) => [
        `${r.name} (${catLabel(r.category)})`,
        fmtStock(r) + (r.subtitle ? ` · ${r.subtitle}` : ""),
      ] as [string, string]),
    ));
  }

  // ── Bölüm 3 (veya 2 kritik modda): Kategori bazlı ürün listesi ──
  const listSectionN = exportMode === "critical" ? 2 : (criticalAll.length > 0 ? 3 : 2);
  all.push(toc.h1Colored(t("list.heading", { n: String(listSectionN) }), C_STOK, true));
  all.push(muted(count("list.summary", reportRows.length)));
  all.push(spacer());

  let globalN = 0;
  let sectionShown = 0;
  for (const cat of STOCK_REPORT_CATEGORY_ORDER) {
    const catRows = reportRows.filter((r) => r.category === cat);
    if (!catRows.length) continue;
    if (sectionShown > 0) all.push(divider());
    sectionShown++;
    all.push(toc.h2(catLabel(cat)));
    all.push(muted(count("list.categoryCount", catRows.length)));

    for (const row of catRows) {
      globalN++;
      const critical = isCriticalStockRow(row);
      all.push(profileLabel(
        `${critical ? (row.stock <= 0 ? t("list.depletedPrefix") : t("list.criticalPrefix")) : ""}${t("list.item", { n: String(globalN).padStart(3, "0") })}`,
        critical ? C_CRIT : C_STOK,
      ));
      all.push(h3(row.name));
      all.push(twoColTable([
        [t("fields.stock"), fmtStock(row) + (critical && row.stock > 0 ? t("criticalSuffix") : "")],
        ...(row.subtitle ? [[t("fields.group"), row.subtitle] as [string, string]] : []),
        ...(row.unitCost > 0 ? [[t("fields.unitCost"), fmtMoney(row.unitCost)] as [string, string]] : []),
        ...(row.stockValue > 0 ? [[t("fields.value"), fmtMoney(row.stockValue)] as [string, string]] : []),
      ]));
    }
  }

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, rl.common));

  const styles = rl.docxStyles();
  const doc = new Document({
    ...toc.documentOptions(),
    ...(styles ? { styles } : {}),
    sections: [{
      properties: {},
      footers: { default: buildFooter(t("footer", { scope: exportLabel }), { common: rl.common }) },
      children: all,
    }],
  });

  const filename = `${t("file.base")}-${t(`file.${exportMode}`)}-${dateSlug}.docx`;
  return { doc, filename, itemCount: reportRows.length };
}
