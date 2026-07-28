"use client";

/**
 * NKB-V5 — Oturum açan uzmanın Doğaltaş stokunu TEK toplu istekle yükler ve normalize-ad indeksi döner.
 * Taş başına ayrı istek YOK (N+1 yok). tenant sunucuda oturumdan; istemci tenant göndermez.
 */
import { useEffect, useState } from "react";
import { fetchInventoryRows } from "@/lib/urun-stok/dogaltasInventoryApi";
import { buildStockIndex, type StockIndex } from "./stoneStockLogic";

export function useStoneStock(): StockIndex {
  const [idx, setIdx] = useState<StockIndex>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    void fetchInventoryRows().then(({ rows }) => {
      if (!cancelled) setIdx(buildStockIndex(rows as { name?: unknown; adet?: unknown }[]));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return idx;
}
