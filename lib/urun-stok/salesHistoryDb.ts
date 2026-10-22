/**
 * salesHistoryDb.ts — DB-CANONICAL satış geçmişini rapor satırlarına (ReportSaleLine)
 * çevirir (USM-003 / USM-017). Satış geçmişi artık localStorage değil; server'dan
 * sayfalı okunur, cihazlar arası kalıcıdır. Tarihler timestamptz'den yerel saat
 * diliminde gösterilir (USM-009 — string kesme yok).
 */
import { CATEGORY_LABELS, type ProductCategory } from "@/lib/urun-stok/generalSalesLogic";
import type { ReportSaleLine } from "@/lib/urun-stok/salesReportsLogic";
import {
  fetchSalesHistory,
  type SaleInventoryType,
  type SaleItemRow,
  type SaleRow,
} from "@/lib/urun-stok/salesApi";

/**
 * US-008: satış kaydının `source` alanı ham kod olarak tutulur ("central", "oil", …) ve bu
 * DEĞİŞMEZ (DB/RPC sözleşmesi). Ekranda Türkçe etiket gösterilir; bilinmeyen değer olduğu gibi.
 */
const SALE_SOURCE_LABELS: Record<string, string> = {
  central: "Merkezi Satış",
  dogaltas: "Doğaltaş",
  oil: "Yağ",
  soap_cream: "Sabun / Krem",
  accessory: "Tespih / Takı / Aksesuar",
  other: "Diğer Ürünler",
};

export function saleSourceLabel(source: string | null | undefined): string {
  const key = String(source ?? "").trim();
  if (!key) return "—";
  return SALE_SOURCE_LABELS[key] ?? key;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** timestamptz ISO → yerel saat dilimi gösterimi (USM-009). */
export function formatSoldAtLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * DB satış geçmişini ReportSaleLine[]'e çevirir. Yalnız "completed" satışlar
 * (iptal edilenler ciro/kâr'a dahil edilmez). Makul üst sınıra kadar sayfalar.
 */
export async function loadDbReportLines(maxSales = 2000): Promise<{ lines: ReportSaleLine[]; error: string | null }> {
  const lines: ReportSaleLine[] = [];
  let offset = 0;
  const limit = 200;
  let guard = 0;

  while (lines.length < maxSales && guard < 40) {
    guard += 1;
    const res = await fetchSalesHistory({ limit, offset, status: "completed" });
    if (!res.ok) return { lines, error: res.error ?? "Satış geçmişi okunamadı." };

    const saleById = new Map<string, SaleRow>();
    for (const s of res.sales) saleById.set(s.id, s);

    for (const it of res.items as SaleItemRow[]) {
      const sale = saleById.get(it.sale_id);
      if (!sale) continue;
      const category = it.inventory_type as ProductCategory;
      const name = it.product_name_snapshot || "";
      const subtitle = it.product_subtitle_snapshot || "";
      const date = new Date(sale.sold_at);
      lines.push({
        id: it.id,
        timestamp: formatSoldAtLocal(sale.sold_at),
        date: Number.isNaN(date.getTime()) ? null : date,
        category,
        categoryLabel: CATEGORY_LABELS[category] ?? category,
        productName: name,
        productSubtitle: subtitle,
        productKey: `${name}|${subtitle}`,
        qty: num(it.quantity),
        unit: it.unit || "",
        lineCost: num(it.line_cost_total),
        lineSale: num(it.line_sale_total),
        profit: num(it.line_profit),
        profitPct: num(it.markup_pct),
        source: saleSourceLabel(sale.source),
        recordName: sale.note || name,
        hiddenFromList: Boolean(sale.hidden_at),
      });
    }

    if (!res.hasMore) break;
    offset += limit;
  }

  lines.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return { lines, error: null };
}

/**
 * Tek kategoriye ait canonical DB satışları — satış bazında gruplu. Kategori
 * "Satış Geçmişi" sekmesi merkezî geçmiş ile AYNI inventory_sales/items verisinden
 * beslenir. İptal edilenler dahil (status ile). Her grup DB sale_id taşır → UI iptal.
 */
export type DbCategorySale = {
  saleId: string;
  soldAt: string;
  soldAtDisplay: string;
  status: "completed" | "cancelled";
  note: string;
  source: string;
  /** "Listeden Sil" anı (null = görünür). Finansal anlamı yoktur. */
  hiddenAt: string | null;
  /** Satıştaki TOPLAM kalem sayısı (tüm kategoriler) — çok kategorili satış tespiti için. */
  itemCount: number;
  items: SaleItemRow[];
};

export async function loadDbCategorySales(
  category: SaleInventoryType,
  maxItems = 2000,
): Promise<{ sales: DbCategorySale[]; error: string | null }> {
  const byId = new Map<string, DbCategorySale>();
  const order: string[] = [];
  let offset = 0;
  const limit = 200;
  let guard = 0;
  let total = 0;

  while (total < maxItems && guard < 40) {
    guard += 1;
    const res = await fetchSalesHistory({ inventoryType: category, limit, offset });
    if (!res.ok) return { sales: [...order.map((id) => byId.get(id)!)], error: res.error ?? "Satış geçmişi okunamadı." };

    const saleById = new Map<string, SaleRow>();
    for (const s of res.sales) saleById.set(s.id, s);

    for (const it of res.items as SaleItemRow[]) {
      const sale = saleById.get(it.sale_id);
      if (!sale) continue;
      let grp = byId.get(sale.id);
      if (!grp) {
        grp = {
          saleId: sale.id,
          soldAt: sale.sold_at,
          soldAtDisplay: formatSoldAtLocal(sale.sold_at),
          status: sale.status,
          note: sale.note || "",
          source: sale.source || "",
          hiddenAt: sale.hidden_at ?? null,
          itemCount: num(sale.item_count),
          items: [],
        };
        byId.set(sale.id, grp);
        order.push(sale.id);
      }
      grp.items.push(it);
      total += 1;
    }

    if (!res.hasMore) break;
    offset += limit;
  }

  const sales = order.map((id) => byId.get(id)!);
  sales.sort((a, b) => (b.soldAt || "").localeCompare(a.soldAt || ""));
  return { sales, error: null };
}
