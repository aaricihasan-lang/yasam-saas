"use client";

import { useEffect, useId, useState } from "react";
import type { ListResult } from "@/lib/aromaterapi/readClient";
import { messageForCode } from "@/lib/aromaterapi/readClient";

/**
 * Aromaterapi V2 — C3D-D generic tek-seçim arama seçicisi (search-as-you-type).
 *
 * Mevcut C3C tenant-scoped read API'lerini tüketir (yeni endpoint YOK). Kontrollü:
 * minimum karakter eşiği, debounce, AbortController ile stale koruması, sunucu
 * pagination'ına uyum (tek istekte tüm kayıtları çekmez). Erişilebilir: label↔input,
 * 44px, focus-visible, klavye. Salt sunum + mevcut read.
 */

export type PickerItem = { id: string; label: string; sublabel?: string; data?: unknown };

export function EntitySearchPicker<T>({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
  search,
  toItem,
  minChars = 2,
  disabled = false,
  required = false,
  limit = 20,
}: {
  label: string;
  placeholder: string;
  selected: PickerItem | null;
  onSelect: (item: PickerItem) => void;
  onClear: () => void;
  /** C3C read wrapper: (URLSearchParams, signal) => ListResult<T>. */
  search: (params: URLSearchParams, signal: AbortSignal) => Promise<ListResult<T>>;
  toItem: (row: T) => PickerItem;
  minChars?: number;
  disabled?: boolean;
  required?: boolean;
  limit?: number;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fetchedKey, setFetchedKey] = useState("");

  const trimmed = query.trim();
  const active = open && trimmed.length >= minChars;
  const currentKey = active ? debounced : "";
  const loading = active && fetchedKey !== currentKey;

  // Debounce (setTimeout callback içinde setState → senkron değil, lint-uyumlu).
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(h);
  }, [query]);

  // Fetch — yalnız async .then içinde setState.
  useEffect(() => {
    if (!active || debounced.length < minChars) return;
    const controller = new AbortController();
    const sp = new URLSearchParams();
    sp.set("q", debounced);
    sp.set("limit", String(limit));
    search(sp, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.envelope) {
        setItems(res.envelope.rows.map(toItem));
        setErrorCode(null);
        setFetchedKey(debounced);
      } else if (res.errorCode) {
        setErrorCode(res.errorCode);
        setFetchedKey(debounced);
      }
    });
    return () => controller.abort();
  }, [active, debounced, minChars, limit, search, toItem]);

  if (selected) {
    return (
      <div>
        <span className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </span>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[14px] font-black text-slate-800 [overflow-wrap:anywhere]">
              {selected.label}
            </span>
            {selected.sublabel ? (
              <span className="block text-[11.5px] font-semibold text-slate-500 [overflow-wrap:anywhere]">
                {selected.sublabel}
              </span>
            ) : null}
          </span>
          {!disabled ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[36px] shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
            >
              Değiştir
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <input
        id={id}
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:bg-slate-50"
      />
      {active ? (
        <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-3 py-2.5 text-[13px] font-semibold text-slate-400">Aranıyor…</p>
          ) : errorCode ? (
            <p role="alert" className="px-3 py-2.5 text-[13px] font-bold text-rose-600">
              {messageForCode(errorCode)}
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] font-semibold text-slate-400">Sonuç bulunamadı.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(it);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex min-h-[44px] w-full flex-col items-start justify-center px-3 py-1.5 text-left transition hover:bg-emerald-50/60 focus-visible:bg-emerald-50 focus-visible:outline-none"
                  >
                    <span className="text-[13.5px] font-black text-slate-800 [overflow-wrap:anywhere]">
                      {it.label}
                    </span>
                    {it.sublabel ? (
                      <span className="text-[11.5px] font-semibold text-slate-400 [overflow-wrap:anywhere]">
                        {it.sublabel}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : trimmed.length > 0 && trimmed.length < minChars ? (
        <p className="mt-1 text-[11.5px] font-semibold text-slate-400">
          Aramak için en az {minChars} karakter girin.
        </p>
      ) : null}
    </div>
  );
}
