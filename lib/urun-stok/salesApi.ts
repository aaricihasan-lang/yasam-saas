/**
 * salesApi.ts — Ürün & Stok CANONICAL satış istemci sarmalayıcısı.
 *
 * Tüm satış işlemleri /api/urun-stok/sales* güvenli uçlarından geçer; stok düşümü
 * ve satış geçmişi SERVER + DB'de kalıcıdır (USM-001/003/004/005). localStorage
 * artık authoritative DEĞİL — yalnız cache/legacy uyumluluk.
 *
 * Auth: dogaltasApi authHeaders deseni (x-user-id + x-session-token).
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

export type SaleInventoryType = "dogaltas" | "oil" | "soap_cream" | "accessory" | "other";

export type CatalogProduct = {
  inventory_type: SaleInventoryType;
  inventory_id: string;
  client_id: string;
  name: string;
  subtitle: string;
  stock: number;
  unit: string;
  measure_type: string;
  cost_per_unit: number;
  sale_per_unit: number;
  profit_pct: number;
  photo_count: number;
};

export type SaleLineInput = {
  inventory_type: SaleInventoryType;
  inventory_id: string;
  quantity: number;
  markup_pct?: number;
  unit_sale_price?: number;
};

export type SaleItemRow = {
  id: string;
  sale_id: string;
  inventory_type: SaleInventoryType;
  inventory_id: string;
  product_name_snapshot: string;
  product_subtitle_snapshot: string;
  unit: string;
  quantity: string | number;
  unit_cost_snapshot: string | number;
  unit_sale_price_snapshot: string | number;
  markup_pct: string | number;
  currency_snapshot: string;
  line_cost_total: string | number;
  line_sale_total: string | number;
  line_profit: string | number;
};

export type SaleRow = {
  id: string;
  source: string;
  status: "completed" | "cancelled";
  note: string;
  sold_at: string;
  total_cost: string | number;
  total_sale: string | number;
  total_profit: string | number;
  item_count: number;
  cancelled_at: string | null;
};

/** Kararlı, benzersiz idempotency anahtarı (network retry-safe). */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `sale_${crypto.randomUUID()}`;
    }
  } catch { /* fall through */ }
  return `sale_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * STK-03: aynı satış DENEMESİNİN tekrarında (ağ hatası sonrası "tekrar dene") aynı anahtar kullanılır;
 * sunucu ikinci isteği duplicate olarak döndürür, ikinci satış OLUŞMAZ. Satır içeriği (imza) değişince
 * ya da başarılı satıştan sonra (çağıran null'lar) yeni anahtar üretilir → yeni bilinçli satış ayrı işlemdir.
 */
export type SaleAttempt = { signature: string; key: string };

export function saleAttemptFor(prev: SaleAttempt | null, signature: string): SaleAttempt {
  if (prev && prev.signature === signature) return prev;
  return { signature, key: newIdempotencyKey() };
}

export async function fetchSalesCatalog(): Promise<{ ok: boolean; products: CatalogProduct[]; error?: string }> {
  const r = await dogaltasApiGet<{ products?: CatalogProduct[] }>("/api/urun-stok/sales/catalog");
  return { ok: r.ok, products: r.data?.products ?? [], error: r.error };
}

export async function createSale(input: {
  idempotencyKey: string;
  source?: string;
  note?: string;
  lines: SaleLineInput[];
}): Promise<{
  ok: boolean;
  duplicate?: boolean;
  saleId?: string;
  sale?: SaleRow;
  items?: SaleItemRow[];
  demo?: boolean;
  error?: string;
}> {
  const r = await dogaltasApiSend<{ sale_id?: string; duplicate?: boolean; sale?: SaleRow; items?: SaleItemRow[] }>(
    "/api/urun-stok/sales",
    "POST",
    {
      idempotency_key: input.idempotencyKey,
      source: input.source ?? "central",
      note: input.note ?? "",
      lines: input.lines,
    },
  );
  return {
    ok: r.ok,
    duplicate: r.data?.duplicate,
    saleId: r.data?.sale_id,
    sale: r.data?.sale,
    items: r.data?.items,
    demo: r.demo,
    error: r.error,
  };
}

export async function fetchSalesHistory(opts?: {
  limit?: number;
  offset?: number;
  status?: "completed" | "cancelled";
  inventoryType?: SaleInventoryType;
}): Promise<{ ok: boolean; sales: SaleRow[]; items: SaleItemRow[]; hasMore: boolean; error?: string }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.status) params.set("status", opts.status);
  if (opts?.inventoryType) params.set("inventory_type", opts.inventoryType);
  const qs = params.toString();
  const r = await dogaltasApiGet<{ sales?: SaleRow[]; items?: SaleItemRow[]; hasMore?: boolean }>(
    `/api/urun-stok/sales${qs ? `?${qs}` : ""}`,
  );
  return {
    ok: r.ok,
    sales: r.data?.sales ?? [],
    items: r.data?.items ?? [],
    hasMore: Boolean(r.data?.hasMore),
    error: r.error,
  };
}

/**
 * Kategori sayfası satışı — sayfa yalnız client_id (dogaltas'ta name+type) bilir;
 * DB uuid'ini kataloğdan çözer, sonra CANONICAL createSale'i çağırır. Böylece
 * kategori satışları da merkezî ile AYNI atomik server motorunu kullanır
 * (USM-004/005). Katalog yalnız stoğu > 0 ürünleri döndürür.
 */
export type CategorySaleLineRef = {
  clientId?: string;   // oil/soap_cream/accessory/other
  name?: string;       // dogaltas eşlemesi
  type?: string;       // dogaltas eşlemesi
  quantity: number;
  markupPct?: number;
  unitSalePrice?: number;
};

function dogaltasKey(name: string, type: string): string {
  return `${(name || "").trim().toLocaleLowerCase("tr")}|${(type || "").trim().toLocaleLowerCase("tr")}`;
}

export async function createCategorySale(input: {
  category: SaleInventoryType;
  idempotencyKey: string;
  note?: string;
  lines: CategorySaleLineRef[];
}): Promise<{
  ok: boolean;
  duplicate?: boolean;
  saleId?: string;
  sale?: SaleRow;
  items?: SaleItemRow[];
  demo?: boolean;
  error?: string;
}> {
  const cat = await fetchSalesCatalog();
  if (!cat.ok) return { ok: false, error: cat.error ?? "Katalog okunamadı." };

  const byClientId = new Map<string, string>();
  const byNameType = new Map<string, string>();
  for (const p of cat.products) {
    if (p.inventory_type !== input.category) continue;
    if (p.client_id) byClientId.set(p.client_id, p.inventory_id);
    byNameType.set(dogaltasKey(p.name, p.subtitle), p.inventory_id);
  }

  const resolved: SaleLineInput[] = [];
  for (const ln of input.lines) {
    let invId: string | undefined;
    if (ln.clientId) invId = byClientId.get(ln.clientId);
    if (!invId && (ln.name || ln.type)) invId = byNameType.get(dogaltasKey(ln.name ?? "", ln.type ?? ""));
    if (!invId) {
      return { ok: false, error: "Ürün stokta bulunamadı. Stok bilgisi yenilendi." };
    }
    resolved.push({
      inventory_type: input.category,
      inventory_id: invId,
      quantity: ln.quantity,
      ...(ln.markupPct != null ? { markup_pct: ln.markupPct } : {}),
      ...(ln.unitSalePrice != null ? { unit_sale_price: ln.unitSalePrice } : {}),
    });
  }

  return createSale({
    idempotencyKey: input.idempotencyKey,
    source: input.category,
    note: input.note,
    lines: resolved,
  });
}

export type CancelOutcome = {
  ok: boolean;
  alreadyCancelled?: boolean;
  restored?: number;
  /** Satıştaki kalem sayısı (bilinmiyorsa null). */
  itemCount?: number | null;
  /** STK-06: ürünü silinmiş olduğu için stoğa geri EKLENEMEYEN kalem sayısı (bilinmiyorsa null). */
  notRestored?: number | null;
  demo?: boolean;
  error?: string;
};

export async function cancelSale(saleId: string): Promise<CancelOutcome> {
  const r = await dogaltasApiSend<{
    already_cancelled?: boolean;
    restored?: number;
    item_count?: number | null;
    not_restored?: number | null;
  }>(
    `/api/urun-stok/sales/${encodeURIComponent(saleId)}/cancel`,
    "POST",
  );
  return {
    ok: r.ok,
    alreadyCancelled: r.data?.already_cancelled,
    restored: r.data?.restored,
    itemCount: r.data?.item_count,
    notRestored: r.data?.not_restored,
    demo: r.demo,
    error: r.error,
  };
}

/**
 * STK-06: toplu iptal sonucunu kullanıcıya DOĞRU anlatan tek mesaj.
 * Eski davranış her başarılı iptalde "stok stoğa geri eklendi" diyordu; ürün silinmişse
 * stok aslında iade edilmiyordu (sahte başarı mesajı).
 */
export function describeCancelOutcomes(outcomes: readonly CancelOutcome[]): string {
  let cancelled = 0;
  let already = 0;
  let failed = 0;
  let notRestored = 0;
  let unknown = 0;
  for (const o of outcomes) {
    if (!o.ok) { failed += 1; continue; }
    if (o.alreadyCancelled) { already += 1; continue; }
    cancelled += 1;
    if (o.notRestored == null) unknown += 1;
    else notRestored += o.notRestored;
  }
  const parts: string[] = [];
  if (cancelled > 0) {
    const head = cancelled === 1 ? "Satış iptal edildi" : `${cancelled} satış iptal edildi`;
    if (notRestored > 0) {
      parts.push(
        `${head}. ${notRestored} ürün artık stok listesinde bulunmadığı (silindiği) için stoğa geri eklenemedi; ` +
          "satış kaydı geçmişte \"iptal\" olarak duruyor.",
      );
    } else if (unknown > 0) {
      parts.push(`${head}. Stok iadesi doğrulanamadı; lütfen stok miktarını kontrol edin.`);
    } else {
      parts.push(`${head}, satılan miktarlar stoğa geri eklendi.`);
    }
  }
  if (already > 0) parts.push(`${already} satış zaten iptal edilmişti; stok yeniden eklenmedi.`);
  if (failed > 0) parts.push(`${failed} iptal işlemi başarısız oldu.`);
  return parts.join(" ") || "İptal edilecek satış bulunamadı.";
}
