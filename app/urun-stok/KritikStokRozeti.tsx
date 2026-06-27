"use client";

/**
 * KritikStokRozeti — Ürün & Stok hub'ında canlı kritik stok sayacı.
 * Senaryo 2: uzman uygulamayı açar açmaz, tıklamadan "🔴 N kritik ürün" görür;
 * dokununca Canlı Stok'ta kritik filtreye gider. DB öncelikli (cihazlar arası).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  isCriticalAmount,
  loadLiveStockRows,
  loadLiveStockRowsAsync,
  loadStockThresholds,
} from "@/lib/urun-stok/liveStockLogic";

export default function KritikStokRozeti() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const t = loadStockThresholds();
        const demo = readYasamUser()?.is_demo_account === true;
        let rows;
        if (demo) {
          rows = loadLiveStockRows(0);
        } else {
          const tid = await getSyncedTenantId();
          rows = (await loadLiveStockRowsAsync(tid, 0)).rows;
        }
        const n = rows.filter((r) => isCriticalAmount(r.stockAmount, r.unitLabel, t)).length;
        if (alive) setCount(n);
      } catch {
        if (alive) setCount(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (count === null) return null; // yüklenirken sessiz (hub'ı geciktirme)

  if (count === 0) {
    return (
      <Link
        href="/urun-stok/canli-stok"
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800 no-underline"
      >
        ✓ Kritik stok yok
      </Link>
    );
  }

  return (
    <Link
      href="/urun-stok/canli-stok"
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-rose-300 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800 no-underline transition hover:bg-rose-100"
    >
      🔴 {count} kritik ürün — listeye git →
    </Link>
  );
}
