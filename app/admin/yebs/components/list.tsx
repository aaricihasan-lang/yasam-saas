"use client";

// ============================================================
// YEBS A8 — Ortak liste altyapısı: useYebsList hook + ListLayout kabuğu
// - server offset pagination, abort ile stale-response yarışı koruması
// - çift fetch engeli (in-flight guard), Türkçe-güvenli arama debounce dışarıda
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ApiResult, ListEnvelope } from "@/lib/yebs/ui/types";
import { LoadingBlock, ErrorBlock, EmptyBlock, Pagination } from "./primitives";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";

export const DEFAULT_LIMIT = 25;

export type ListState<T> = {
  rows: T[]; count: number | null; offset: number; limit: number;
  loading: boolean; error: string | null;
  reload: () => void;
  setOffset: (o: number) => void;
};

/**
 * fetcher: (offset, limit, signal) => ApiResult<ListEnvelope<T>>
 * deps: fetcher yeniden kurulduğunda (filtre/arama değişince) offset sıfırlanır.
 */
export function useYebsList<T>(
  fetcher: (offset: number, limit: number, signal: AbortSignal) => Promise<ApiResult<ListEnvelope<T>>>,
  resetKey: string,
  limit = DEFAULT_LIMIT,
): ListState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tick = useRef(0);

  // resetKey değişince offset sıfırla
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOffset(0); }, [resetKey]);

  const run = useCallback(async (o: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const my = ++tick.current;
    setLoading(true); setError(null);
    const r = await fetcher(o, limit, ac.signal);
    if (my !== tick.current || ac.signal.aborted) return; // stale yanıt at
    if (r.ok) { setRows(r.data.rows); setCount(r.data.count); }
    else { setError(codeMeta(r.code).message); setRows([]); }
    setLoading(false);
  }, [fetcher, limit]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void run(offset); return () => abortRef.current?.abort(); }, [run, offset]);

  return {
    rows, count, offset, limit, loading, error,
    reload: () => run(offset),
    setOffset,
  };
}

export function ListLayout<T>({
  title, subtitle, newHref, toolbar, state, columns, renderCard, rowKey, rowHref,
}: {
  title: string; subtitle?: string; newHref?: string;
  toolbar?: ReactNode;
  state: ListState<T>;
  columns: { key: string; header: string; cell: (row: T) => ReactNode; className?: string }[];
  renderCard: (row: T) => ReactNode;
  rowKey: (row: T) => string;
  rowHref: (row: T) => string;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {newHref && (
          <Link href={newHref} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
            <Plus className="h-4 w-4" aria-hidden /> Yeni
          </Link>
        )}
      </div>

      {toolbar && <div className="mb-3">{toolbar}</div>}

      {state.loading && state.rows.length === 0 ? (
        <LoadingBlock />
      ) : state.error ? (
        <ErrorBlock message={state.error} onRetry={state.reload} />
      ) : state.rows.length === 0 ? (
        <EmptyBlock />
      ) : (
        <>
          {/* Masaüstü: tam genişlik tablo */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-slate-50/90 text-left text-xs text-slate-500">
                <tr>{columns.map((c) => <th key={c.key} className={`px-3 py-2 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-slate-100 hover:bg-violet-50/40">
                    {columns.map((c, i) => (
                      <td key={c.key} className={`px-3 py-2 ${c.className ?? ""}`}>
                        {i === 0 ? <Link href={rowHref(row)} className="block font-semibold text-slate-800 hover:text-violet-700">{c.cell(row)}</Link> : c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil: kart */}
          <div className="grid gap-2 md:hidden">
            {state.rows.map((row) => (
              <Link key={rowKey(row)} href={rowHref(row)}
                className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm active:scale-[0.99]">
                {renderCard(row)}
              </Link>
            ))}
          </div>

          <Pagination offset={state.offset} limit={state.limit} count={state.count} loading={state.loading} onPage={state.setOffset} />
        </>
      )}
    </section>
  );
}
