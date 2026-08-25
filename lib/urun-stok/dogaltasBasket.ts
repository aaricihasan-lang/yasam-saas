/**
 * Doğaltaş satış sepeti — saf, deterministik ve satır-scoped state geçişleri.
 *
 * Sepet satırları (ürün) index yerine STABİL yerel `uid` ile kimliklenir; böylece
 * aynı isim/adetteki iki ürün sepetteyken yanlış satırın düzenlenmesi/silinmesi
 * imkânsızdır. Ekleme, düzenleme ve silme aynı canonical hesaplamayı kullanır —
 * `computeRecordTotals` tek doğruluk kaynağıdır ve ileride divergence oluşmaz.
 */

import type { SaleLine, SaleRecord } from "./dogaltasStockLogic";

/** İstemci tarafı sepet satırı: stabil yerel uid + temsil ettiği satış kaydı. */
export type BasketItem = {
  uid: string;
  record: SaleRecord;
};

/** Monotonik sayaçtan çakışmasız, deterministik yerel uid üret. */
export function makeBasketUid(seq: number): string {
  return `cart-${seq}`;
}

/** Canonical satır tutarı: birim maliyet × adet. */
export function computeLineTotal(unit: number, qty: number): number {
  return unit * qty;
}

/** Canonical kayıt toplamları — ekleme ve düzenlemenin ortak tek kaynağı. */
export function computeRecordTotals(
  lines: SaleLine[],
  profitPct: number,
): { total_cost: number; sale_price: number } {
  const total_cost = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const sale_price = total_cost * (1 + profitPct / 100);
  return { total_cost, sale_price };
}

/** Ham alanlardan bir SaleRecord kur; tüm türetilmiş değerleri yeniden hesapla. */
export function buildSaleRecord(input: {
  name: string;
  lines: Array<Omit<SaleLine, "line_total">>;
  profit_pct: number;
  photos: string[];
  timestamp: string;
}): SaleRecord {
  const lines: SaleLine[] = input.lines.map((l) => ({
    ...l,
    line_total: computeLineTotal(l.unit, l.qty),
  }));
  const { total_cost, sale_price } = computeRecordTotals(lines, input.profit_pct);
  return {
    name: input.name,
    lines,
    total_cost,
    sale_price,
    profit_pct: input.profit_pct,
    photos: input.photos,
    timestamp: input.timestamp,
  };
}

/** Tek sepet satırını uid ile kaldır — diğer satırlara asla dokunmaz. */
export function removeBasketItem(items: BasketItem[], uid: string): BasketItem[] {
  return items.filter((it) => it.uid !== uid);
}

/** Tek sepet satırının kaydını uid ile değiştir — diğer satırlara asla dokunmaz. */
export function updateBasketItem(
  items: BasketItem[],
  uid: string,
  record: SaleRecord,
): BasketItem[] {
  return items.map((it) => (it.uid === uid ? { ...it, record } : it));
}

/** Güncel sepetin aggregate toplamları. */
export function basketTotals(items: BasketItem[]): {
  totalCost: number;
  totalSale: number;
  totalProfit: number;
  count: number;
} {
  const totalCost = items.reduce((s, it) => s + (it.record.total_cost || 0), 0);
  const totalSale = items.reduce((s, it) => s + (it.record.sale_price || 0), 0);
  return { totalCost, totalSale, totalProfit: totalSale - totalCost, count: items.length };
}

/** Yerel uid'leri düş → commit'te persist edilen düz SaleRecord[]. */
export function toSaleRecords(items: BasketItem[]): SaleRecord[] {
  return items.map((it) => it.record);
}
