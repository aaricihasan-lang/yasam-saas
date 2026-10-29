/**
 * salesHistoryServer.ts — GET /api/urun-stok/sales okuma çekirdeği (route + PG testleri aynı kodu kullanır).
 *
 * Satış raporu eksiksizliği (Satış Öncesi Hata #3):
 *   - İMLEÇLİ sayfalama (keyset): genel modda (sold_at, id), kategori modunda (created_at, id) azalan.
 *     Sayfalar arasında yeni satış eklenmesi / iptal edilmesi kayıt ATLATMAZ ve İKİ KEZ saydırmaz.
 *     (Eski `offset` modu geriye dönük uyumluluk için korunur.)
 *   - Satış kalemleri PostgREST `max-rows` (1000) tavanına takılmadan okunur (fetchAllRowsByIds);
 *     her sorguda tenant filtresi.
 *   - Tutarlılık: genel modda her satışın okunan kalem sayısı `item_count` ile karşılaştırılır;
 *     uyuşmazlık `itemCountMismatch` ile istemciye bildirilir (sessiz eksik toplam yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { isMissingVisibilityColumn } from "@/lib/urun-stok/salesVisibility";

export const SALES_INVENTORY_TYPES = new Set(["dogaltas", "oil", "soap_cream", "accessory", "other"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST'in döndürdüğü timestamptz biçimi (ör. 2026-10-28T10:00:00.123456+00:00). Değer
// filtreye olduğu gibi (mikrosaniye kaybı olmadan) geri verilir; başka karakter kabul edilmez.
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;

const SALE_COLS_BASE = "id, source, status, note, sold_at, total_cost, total_sale, total_profit, item_count, cancelled_at";
const SALE_COLS = `${SALE_COLS_BASE}, hidden_at`;
const ITEM_COLS = "id, sale_id, inventory_type, inventory_id, product_name_snapshot, product_subtitle_snapshot, unit, quantity, unit_cost_snapshot, unit_sale_price_snapshot, markup_pct, currency_snapshot, line_cost_total, line_sale_total, line_profit";

export type SalesHistoryParams = {
  limit: number;
  offset: number;
  /** "<timestamptz>|<uuid>" — önceki sayfanın son satırı (sold_at|id veya created_at|id). */
  cursor: string | null;
  status: string | null;
  inventoryType: string | null;
};

export type SalesHistoryPage =
  | {
      ok: true;
      sales: unknown[];
      items: unknown[];
      hasMore: boolean;
      nextCursor: string | null;
      /** Okunan kalem sayısı item_count'tan farklı olan satış kimlikleri (genel mod). */
      itemCountMismatch: string[];
    }
  | { ok: false; status: 400 | 500; error: string; code?: string };

export function parseSalesHistoryParams(sp: URLSearchParams): SalesHistoryParams {
  return {
    limit: Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200),
    offset: Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0),
    cursor: sp.get("cursor"),
    status: sp.get("status"),
    inventoryType: sp.get("inventory_type"),
  };
}

function parseCursor(raw: string | null): { ts: string; id: string } | null | "invalid" {
  if (raw == null || raw === "") return null;
  const i = raw.lastIndexOf("|");
  if (i < 0) return "invalid";
  const ts = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!TS_RE.test(ts) || !UUID_RE.test(id)) return "invalid";
  return { ts, id };
}

/** (col < ts) OR (col = ts AND id < cursorId) — azalan keyset; değerler doğrulanmış ve tırnaklı. */
function keysetFilter(col: string, c: { ts: string; id: string }): string {
  return `${col}.lt."${c.ts}",and(${col}.eq."${c.ts}",id.lt.${c.id})`;
}

type Row = Record<string, unknown>;

export async function readSalesHistoryPage(
  db: SupabaseClient,
  tenantId: string,
  p: SalesHistoryParams,
): Promise<SalesHistoryPage> {
  const cursor = parseCursor(p.cursor);
  if (cursor === "invalid") return { ok: false, status: 400, error: "Geçersiz sayfa imleci." };
  const statusFilter = p.status === "completed" || p.status === "cancelled" ? p.status : null;

  // ── Kategori-filtreli mod (kalem bazlı sayfalama) ──
  if (p.inventoryType !== null) {
    if (!SALES_INVENTORY_TYPES.has(p.inventoryType)) return { ok: false, status: 400, error: "Geçersiz ürün kategorisi." };
    let iq = db
      .from("inventory_sale_items")
      .select(`${ITEM_COLS}, created_at`)
      .eq("tenant_id", tenantId)
      .eq("inventory_type", p.inventoryType)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (cursor) iq = iq.or(keysetFilter("created_at", cursor));
    const from = cursor ? 0 : p.offset;
    const { data: itemRowsRaw, error: itemErr } = await iq.range(from, from + p.limit); // limit+1 → hasMore
    if (itemErr) {
      console.error("[urun-stok/sales] kategori satır hata", { code: (itemErr as { code?: string }).code });
      return { ok: false, status: 500, error: "Satış geçmişi okunamadı." };
    }
    const allItems = (itemRowsRaw ?? []) as unknown as Row[];
    const hasMore = allItems.length > p.limit;
    const pageItems = hasMore ? allItems.slice(0, p.limit) : allItems;
    let sales: unknown[] = [];
    if (pageItems.length > 0) {
      const saleIds = [...new Set(pageItems.map((i) => String(i.sale_id)))];
      const readSales = (cols: string) =>
        fetchAllRowsByIds<Row>(saleIds, (chunk, f, t) => {
          let sq = db.from("inventory_sales").select(cols).eq("tenant_id", tenantId).in("id", chunk);
          if (statusFilter) sq = sq.eq("status", statusFilter);
          return sq.order("id").range(f, t);
        });
      let res = await readSales(SALE_COLS);
      if (!res.ok && isMissingVisibilityColumn(res.error)) res = await readSales(SALE_COLS_BASE);
      if (!res.ok) {
        console.error("[urun-stok/sales] kategori satış hata", { code: (res.error as { code?: string })?.code });
        return { ok: false, status: 500, error: "Satış geçmişi okunamadı." };
      }
      sales = res.rows;
    }
    const last = pageItems[pageItems.length - 1];
    return {
      ok: true,
      sales,
      items: pageItems,
      hasMore,
      nextCursor: hasMore && last ? `${String(last.created_at)}|${String(last.id)}` : null,
      itemCountMismatch: [],
    };
  }

  // ── Genel (satış bazlı) mod ──
  const listQuery = (cols: string) => {
    let q = db
      .from("inventory_sales")
      .select(cols)
      .eq("tenant_id", tenantId)
      .order("sold_at", { ascending: false })
      .order("id", { ascending: false });
    if (statusFilter) q = q.eq("status", statusFilter);
    if (cursor) q = q.or(keysetFilter("sold_at", cursor));
    const from = cursor ? 0 : p.offset;
    return q.range(from, from + p.limit); // limit+1 satır → hasMore tespiti
  };
  let { data: salesRows, error } = await listQuery(SALE_COLS);
  if (error && isMissingVisibilityColumn(error)) ({ data: salesRows, error } = await listQuery(SALE_COLS_BASE));
  if (error) {
    console.error("[urun-stok/sales] liste hata", { code: (error as { code?: string }).code });
    return { ok: false, status: 500, error: "Satış geçmişi okunamadı." };
  }
  const rows = (salesRows ?? []) as unknown as Row[];
  const hasMore = rows.length > p.limit;
  const pageRows = hasMore ? rows.slice(0, p.limit) : rows;

  let items: Row[] = [];
  const itemCountMismatch: string[] = [];
  if (pageRows.length > 0) {
    const ids = pageRows.map((r) => String(r.id));
    // 1000 satır tavanı: bir sayfadaki satışların kalemleri 1000'i aşabilir → sayfalı + parçalı okuma.
    const res = await fetchAllRowsByIds<Row>(ids, (chunk, f, t) =>
      db.from("inventory_sale_items").select(ITEM_COLS).eq("tenant_id", tenantId).in("sale_id", chunk).order("id").range(f, t));
    if (!res.ok) {
      console.error("[urun-stok/sales] satır hata", { code: (res.error as { code?: string })?.code });
      return { ok: false, status: 500, error: "Satış geçmişi okunamadı." };
    }
    items = res.rows;
    const perSale = new Map<string, number>();
    for (const it of items) perSale.set(String(it.sale_id), (perSale.get(String(it.sale_id)) ?? 0) + 1);
    for (const r of pageRows) {
      if ((perSale.get(String(r.id)) ?? 0) !== Number(r.item_count ?? 0)) itemCountMismatch.push(String(r.id));
    }
  }
  const last = pageRows[pageRows.length - 1];
  return {
    ok: true,
    sales: pageRows,
    items,
    hasMore,
    nextCursor: hasMore && last ? `${String(last.sold_at)}|${String(last.id)}` : null,
    itemCountMismatch,
  };
}
