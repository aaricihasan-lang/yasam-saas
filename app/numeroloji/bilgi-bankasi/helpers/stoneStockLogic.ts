/**
 * NKB-V5 — Numeroloji önerilen taşları uzmanın kendi Doğaltaş stokuyla eşleştirme (saf; client+server).
 *
 * Kaynak: dogaltas_inventory (tenant-scoped). Kanonik stone id YOK → normalize-EXACT ad eşleşmesi
 * (mevcut normalizeDuplicateName). Fuzzy/contains YOK: "Akik" ≠ "Mor Akik", "Kuvars" ≠ "Pembe Kuvars".
 * Kategori/grup başlıkları (ör. "Yeşil Taşları") yalnız birebir adı stokta varsa eşleşir → pratikte
 * kategori işaretlenmez. Yalnız oturum açan uzmanın tenant stoku (admin/global/demo/shared HARİÇ —
 * bu filtre veri kaynağı katmanında zaten uygulanır).
 */
import { normalizeDuplicateName } from "@/lib/dogaltas/duplicateName";

/** normalize-ad → toplam adet (>=0). Anahtarın varlığı = stokta. */
export type StockIndex = Map<string, number>;

export type StockInfo = { stocked: boolean; adet: number };

/** Envanter satırlarından normalize-ad indeksini kurar (aynı adın adetleri toplanır). */
export function buildStockIndex(rows: { name?: unknown; adet?: unknown }[]): StockIndex {
  const idx: StockIndex = new Map();
  for (const r of rows) {
    const key = normalizeDuplicateName(r?.name);
    if (!key) continue;
    const adet = typeof r?.adet === "number" && Number.isFinite(r.adet) ? Math.max(0, r.adet) : 0;
    idx.set(key, (idx.get(key) ?? 0) + adet);
  }
  return idx;
}

/** Bir taş adının stok durumu (EXACT normalize eşleşme; fuzzy YOK). */
export function matchStock(stoneName: string, idx: StockIndex): StockInfo {
  const key = normalizeDuplicateName(stoneName);
  if (!key || !idx.has(key)) return { stocked: false, adet: 0 };
  return { stocked: true, adet: idx.get(key) ?? 0 };
}

/** Stok etiketi: adet varsa "Stokta · N adet", yoksa "Stokta"; stokta değilse boş. */
export function stockLabel(info: StockInfo): string {
  if (!info.stocked) return "";
  return info.adet > 0 ? `Stokta · ${info.adet} adet` : "Stokta";
}

export const STOCK_HINT = "Yeşil işaretli taşlar stoklarınızda bulunmaktadır.";
export const STOCK_HINT_WORD = "Yeşil işaretli taşlar uzman stoklarında bulunmaktadır.";
