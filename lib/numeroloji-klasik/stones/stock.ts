// Klasik Numeroloji · Doğaltaş stok rozeti (SAF).
//
// Mevcut Numeroloji stok rozetiyle AYNI anlam (app/numeroloji/bilgi-bankasi/helpers/stoneStockLogic.ts referans alınmıştır;
// oradan İÇE AKTARILMAZ): `dogaltas_inventory` adları normalizeDuplicateName ile normalize edilir, eşleşme yalnız
// BİREBİR normalize ad (fuzzy / içerme YOK: "Akik" ≠ "Mor Akik"). Aynı adın adetleri toplanır.

import { normalizeDuplicateName } from "../../dogaltas/duplicateName";

export type ClassicStockIndex = Map<string, number>;
export type ClassicStockBadge = { name: string; stocked: boolean; adet: number; label: string };

export function buildClassicStockIndex(rows: readonly { name?: unknown; adet?: unknown }[]): ClassicStockIndex {
  const idx: ClassicStockIndex = new Map();
  for (const r of rows) {
    const key = normalizeDuplicateName(r?.name);
    if (!key) continue;
    const adet = typeof r?.adet === "number" && Number.isFinite(r.adet) ? Math.max(0, r.adet) : 0;
    idx.set(key, (idx.get(key) ?? 0) + adet);
  }
  return idx;
}

export function classicStockBadge(name: string, idx: ClassicStockIndex): ClassicStockBadge {
  const key = normalizeDuplicateName(name);
  if (!key || !idx.has(key)) return { name, stocked: false, adet: 0, label: "" };
  const adet = idx.get(key) ?? 0;
  return { name, stocked: true, adet, label: adet > 0 ? `Stokta · ${adet} adet` : "Stokta" };
}

export const CLASSIC_STOCK_HINT = "Yeşil işaretli taşlar stoklarınızda bulunmaktadır.";
