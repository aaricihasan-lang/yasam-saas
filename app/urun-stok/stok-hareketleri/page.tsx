"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "stock_movements_v1";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(226,232,240,0.45),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(161,161,170,0.18),transparent_30%),linear-gradient(160deg,#f8fafc_0%,#f4f4f5_42%,#fafafa_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const btnSecondary =
  "inline-flex h-12 min-h-[48px] items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 text-sm font-black text-slate-800 transition hover:bg-slate-100 no-underline";

type StockMovement = {
  id?: string;
  timestamp?: string;
  created_at?: string;
  productName?: string;
  product_name?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  movementType?: string;
  movement_type?: string;
  type?: string;
  qty?: number;
  qty_delta?: number;
  quantity?: number;
  unit?: string;
  note?: string;
  reference?: string;
  source?: string;
};

function loadMovements(): StockMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as StockMovement[];
  } catch {
    return [];
  }
}

function movementTime(m: StockMovement): string {
  return m.timestamp || m.created_at || "";
}

function movementName(m: StockMovement): string {
  return m.productName || m.product_name || m.name || "—";
}

function movementCategory(m: StockMovement): string {
  return m.categoryLabel || m.category || "";
}

function movementTypeLabel(m: StockMovement): string {
  return m.movementType || m.movement_type || m.type || "—";
}

function movementQty(m: StockMovement): string {
  const n = m.qty_delta ?? m.qty ?? m.quantity;
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  const unit = m.unit ? ` ${m.unit}` : "";
  const sign = Number(n) > 0 ? "+" : "";
  return `${sign}${n}${unit}`;
}

function sortMovements(list: StockMovement[]): StockMovement[] {
  return [...list].sort((a, b) => {
    const ta = movementTime(a);
    const tb = movementTime(b);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return tb.localeCompare(ta);
  });
}

function MovementCard({ m, index }: { m: StockMovement; index: number }) {
  const time = movementTime(m);
  const cat = movementCategory(m);
  const qty = movementQty(m);
  const qtyNum = m.qty_delta ?? m.qty ?? m.quantity;
  const isOut = typeof qtyNum === "number" && qtyNum < 0;

  return (
    <article className="rounded-[24px] border-2 border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {cat ? (
              <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                {cat}
              </span>
            ) : null}
            <span
              className={`rounded-xl px-3 py-1 text-xs font-black uppercase ${
                isOut ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {movementTypeLabel(m)}
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900 sm:text-xl">{movementName(m)}</h2>
          {m.note ? <p className="text-sm font-medium text-slate-600">{m.note}</p> : null}
          {m.source || m.reference ? (
            <p className="text-xs font-semibold text-slate-500">
              {[m.source, m.reference].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`rounded-2xl border-2 px-4 py-3 text-xl font-black sm:text-2xl ${
              isOut
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {qty}
          </p>
          {time ? (
            <p className="mt-2 text-xs font-bold text-slate-500">{time}</p>
          ) : (
            <p className="mt-2 text-xs font-bold text-slate-400">#{index + 1}</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function StokHareketleriPage() {
  const [hydrated, setHydrated] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const reload = useCallback(() => {
    setMovements(sortMovements(loadMovements()));
  }, []);

  useEffect(() => {
    reload();
    setHydrated(true);
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("storage", onRefresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("storage", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const sorted = useMemo(() => sortMovements(movements), [movements]);

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center text-lg font-semibold text-slate-600">
          Yükleniyor…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-slate-200/50 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-zinc-200/40 blur-3xl" />
      </div>

      <div className={pageShell}>
        <div className="mb-6 flex flex-wrap justify-between gap-3">
          <Link href="/urun-stok" className={btnSecondary}>
            ← Ürün & Stok Merkezi
          </Link>
          <Link href="/urun-stok" className={btnSecondary}>
            Ana Panele Dön
          </Link>
        </div>

        <header className={`${panelClass} mb-6`}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-600">Geçmiş</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl xl:text-5xl">Stok Hareketleri</h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Ürün girişleri, satışlar ve stok değişim kayıtları tek listede.
          </p>
        </header>

        {sorted.length === 0 ? (
          <section className={`${panelClass} py-16 text-center`}>
            <p className="text-5xl" aria-hidden>
              📊
            </p>
            <h2 className="mt-4 text-2xl font-black text-slate-800">Stok hareketi yok</h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-slate-600">
              Henüz stok hareketi oluşmadı. Ürün girişleri ve satış işlemleri yapıldıkça burada
              listelenecek.
            </p>
            <Link href="/urun-stok" className={`${btnSecondary} mt-8 inline-flex`}>
              Ürün & Stok Merkezine dön
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-500">
              Toplam <span className="font-black text-slate-800">{sorted.length}</span> kayıt
            </p>
            {sorted.map((m, i) => (
              <MovementCard key={m.id || `${movementTime(m)}-${i}`} m={m} index={i} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
