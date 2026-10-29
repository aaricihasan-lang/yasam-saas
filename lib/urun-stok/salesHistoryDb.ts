/**
 * salesHistoryDb.ts — DB-CANONICAL satış geçmişini rapor satırlarına (ReportSaleLine)
 * çevirir (USM-003 / USM-017). Satış geçmişi artık localStorage değil; server'dan
 * sayfalı okunur, cihazlar arası kalıcıdır. Tarihler timestamptz'den yerel saat
 * diliminde gösterilir (USM-009 — string kesme yok).
 */
import { CATEGORY_LABELS, type ProductCategory } from "@/lib/urun-stok/generalSalesLogic";
import { compareLinesNewestFirst, type ReportSaleLine } from "@/lib/urun-stok/salesReportsLogic";
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
 * Satış Öncesi Hata #3 — yükleme durumu. `complete:false` iken çağıran toplamları/sıralamaları
 * KESİN SONUÇ olarak GÖSTERMEMELİ (eksik veri açıkça bildirilir).
 */
export type SalesLoadState = { complete: boolean; error: string | null; reason: string | null };

/** Sayfa boyutu (sunucu üst sınırı 200) ve sonsuz döngü / aşırı büyüklük emniyeti. */
export const SALES_PAGE_SIZE = 200;
export const MAX_SALES_PAGES = 1000; // 200.000 satış (rapor) / 200.000 kalem (kategori)

const INCOMPLETE_FETCH = "Satış geçmişinin bir kısmı okunamadı (bağlantı veya sunucu hatası).";

/** Eksik/başarısız yükleme için kullanıcıya gösterilecek tek açıklama (tam yüklemede null). */
export function salesLoadIssue(state: SalesLoadState): string | null {
  if (state.complete) return null;
  const why = state.reason ?? state.error ?? "Satış geçmişi tam yüklenemedi.";
  return `${why} Toplamlar ve sıralamalar eksik veriye dayanacağı için kesin sonuç olarak gösterilmiyor. Sayfayı yenileyip tekrar deneyin.`;
}

/**
 * DB satış geçmişini ReportSaleLine[]'e çevirir. Yalnız "completed" satışlar (iptal edilenler
 * ciro/kâr'a dahil edilmez). İMLEÇLİ sayfalama ile SONUNA KADAR okunur (sessiz kayıt sınırı yok);
 * kalem kimliğine göre tekilleştirilir; sıralama gerçek tarihe göre. Herhangi bir sayfa hatası,
 * sunucunun bildirdiği kalem sayısı tutarsızlığı veya emniyet sınırı → complete:false.
 */
export async function loadDbReportLines(): Promise<{ lines: ReportSaleLine[] } & SalesLoadState> {
  const lines: ReportSaleLine[] = [];
  const seenItems = new Set<string>();
  let cursor: string | null = null;
  let mismatch = 0;
  const done = (st: SalesLoadState) => ({ lines: lines.sort(compareLinesNewestFirst), ...st });

  for (let page = 0; ; page++) {
    if (page >= MAX_SALES_PAGES) {
      return done({ complete: false, error: null, reason: `Satış geçmişi çok büyük (${MAX_SALES_PAGES * SALES_PAGE_SIZE}+ satış); yalnız en yeni kısmı yüklendi.` });
    }
    const res = await fetchSalesHistory({ limit: SALES_PAGE_SIZE, cursor, status: "completed" });
    if (!res.ok) return done({ complete: false, error: res.error ?? "Satış geçmişi okunamadı.", reason: INCOMPLETE_FETCH });
    mismatch += res.itemCountMismatch.length;

    const saleById = new Map<string, SaleRow>();
    for (const s of res.sales) saleById.set(s.id, s);

    for (const it of res.items as SaleItemRow[]) {
      if (seenItems.has(it.id)) continue; // tekrar eden kayıt iki kez sayılmaz
      const sale = saleById.get(it.sale_id);
      if (!sale) { mismatch += 1; continue; }
      seenItems.add(it.id);
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
    if (!res.nextCursor || res.nextCursor === cursor) {
      return done({ complete: false, error: null, reason: "Satış geçmişi sayfalaması tamamlanamadı (sayfa imleci alınamadı)." });
    }
    cursor = res.nextCursor;
  }

  if (mismatch > 0) {
    return done({ complete: false, error: null, reason: `${mismatch} satışın kalemleri eksik okundu (kalem sayısı tutarsız).` });
  }
  return done({ complete: true, error: null, reason: null });
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
): Promise<{ sales: DbCategorySale[] } & SalesLoadState> {
  const byId = new Map<string, DbCategorySale>();
  const seenItems = new Set<string>();
  let cursor: string | null = null;
  let missingSale = 0;
  const done = (st: SalesLoadState) => {
    const sales = [...byId.values()];
    sales.sort((a, b) => {
      const ta = new Date(a.soldAt).getTime() || 0;
      const tb = new Date(b.soldAt).getTime() || 0;
      return tb !== ta ? tb - ta : b.saleId < a.saleId ? -1 : b.saleId > a.saleId ? 1 : 0;
    });
    return { sales, ...st };
  };

  for (let page = 0; ; page++) {
    if (page >= MAX_SALES_PAGES) {
      return done({ complete: false, error: null, reason: `Satış geçmişi çok büyük (${MAX_SALES_PAGES * SALES_PAGE_SIZE}+ kalem); yalnız en yeni kısmı yüklendi.` });
    }
    const res = await fetchSalesHistory({ inventoryType: category, limit: SALES_PAGE_SIZE, cursor });
    if (!res.ok) return done({ complete: false, error: res.error ?? "Satış geçmişi okunamadı.", reason: INCOMPLETE_FETCH });

    const saleById = new Map<string, SaleRow>();
    for (const s of res.sales) saleById.set(s.id, s);

    for (const it of res.items as SaleItemRow[]) {
      if (seenItems.has(it.id)) continue; // tekrar eden kalem iki kez eklenmez
      const sale = saleById.get(it.sale_id);
      if (!sale) { missingSale += 1; continue; }
      seenItems.add(it.id);
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
      }
      grp.items.push(it);
    }

    if (!res.hasMore) break;
    if (!res.nextCursor || res.nextCursor === cursor) {
      return done({ complete: false, error: null, reason: "Satış geçmişi sayfalaması tamamlanamadı (sayfa imleci alınamadı)." });
    }
    cursor = res.nextCursor;
  }

  if (missingSale > 0) {
    return done({ complete: false, error: null, reason: `${missingSale} satış kaleminin satış kaydı okunamadı.` });
  }
  return done({ complete: true, error: null, reason: null });
}
