"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "./ui";
import type { ApiResult, ListEnvelope } from "../yebsShowcaseApi";

/**
 * Ortak liste görünümü: opsiyonel arama + debounce + grid. Her entity kendi
 * loader'ını ve kart renderer'ını sağlar. Salt-okunur; hiçbir aksiyon kontrolü yok.
 */
export function ListShell<T extends { id: string }>({
  title,
  searchable,
  searchPlaceholder,
  emptyTitle,
  emptyHint,
  load,
  renderCard,
}: {
  title: string;
  searchable: boolean;
  searchPlaceholder?: string;
  emptyTitle: string;
  emptyHint?: string;
  load: (q: string, signal: AbortSignal) => Promise<ApiResult<ListEnvelope<T>>>;
  renderCard: (row: T) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRows(null);
      setError(null);
      void load(query.trim(), ctrl.signal).then((res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok) setRows(res.data.rows);
        else setError(res.error);
      });
    }, query ? 260 : 0);
    return () => {
      ctrl.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // load kimliği sabit değil ama query her değişimde yeniden çalışır — kasıtlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-800">{title}</h2>
      </div>

      {searchable ? (
        <div className="mb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? "Ara…"}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} />
      ) : rows === null ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.id}>{renderCard(row)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
