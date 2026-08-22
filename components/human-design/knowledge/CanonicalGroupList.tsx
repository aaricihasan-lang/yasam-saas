"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Trash2, X } from "lucide-react";
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";
import { KIND_LABELS, KIND_ORDER } from "./knowledgeConstants";
import { KnowledgeError, KnowledgeLoading } from "./KnowledgeStates";

export type GroupListItem = {
  canonical_key: string;
  name_tr: string;
  name_original?: string | null;
  /** Admin toplu işlem için entity id (bulk-delete entity_ids). */
  id?: string;
  badge?: { label: string; tone: "draft" | "published" | "neutral" };
};

type Props = {
  activeKind: HdEntityKind;
  onKind: (k: HdEntityKind) => void;
  items: GroupListItem[];
  loading: boolean;
  error: string | null;
  /** canonical_key → detay linki. */
  hrefFor: (canonicalKey: string) => string;
  emptyLabel?: string;
  /** Admin: satır seçimi + toplu içerik silme kontrollerini gösterir. */
  selectable?: boolean;
  /** Admin: seçili entity id'lerle toplu içerik silme (parent onay + API yürütür). */
  onBulkDelete?: (selectedIds: string[]) => void;
  bulkBusy?: boolean;
};

/** Türkçe-güvenli arama normalizasyonu (İ/ı dahil). */
function norm(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/i̇/g, "i").trim();
}

const BADGE_TONE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-600",
};

/**
 * Paylaşılan canonical grup listesi (Tip/Otorite/Kapı/Kanal sekmeleri + arama).
 * Sunum TEK; veri KAYNAĞI (uzman published API veya admin adminHdApi) rol-bilinçli
 * olarak DIŞARIDAN sağlanır. `selectable` ile admin toplu içerik yönetimi (checkbox +
 * Görünenleri Seç + Seçili İçerikleri Sil) additif olarak açılır; uzman görünümü değişmez.
 */
export function CanonicalGroupList({
  activeKind, onKind, items, loading, error, hrefFor, emptyLabel,
  selectable = false, onBulkDelete, bulkBusy = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return items;
    return items.filter((r) => norm(r.name_tr).includes(q) || norm(r.canonical_key).includes(q));
  }, [items, query]);

  // Tür veya arama değişince seçim temizlenir (öngörülebilir davranış).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelected(new Set()); }, [activeKind, query]);

  const selectableIds = useMemo(() => filtered.filter((r) => r.id), [filtered]);
  const selectedInView = useMemo(() => selectableIds.filter((r) => selected.has(r.id!)).length, [selectableIds, selected]);
  const allInViewSelected = selectableIds.length > 0 && selectedInView === selectableIds.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedInView > 0 && !allInViewSelected;
  }, [selectedInView, allInViewSelected]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAllFiltered = () => setSelected(() => (allInViewSelected ? new Set() : new Set(selectableIds.map((r) => r.id!))));
  const clearSelection = () => setSelected(new Set());

  const showSelection = selectable && onBulkDelete;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KIND_ORDER.map((k) => (
          <button key={k} type="button" onClick={() => onKind(k)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
              activeKind === k
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)]"
                : "border border-indigo-200 bg-white/90 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50"
            }`}>
            {KIND_LABELS[k]}
          </button>
        ))}
        <span className="ml-auto text-xs font-semibold text-slate-400">
          {filtered.length} kayıt{query ? " (filtreli)" : ""}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-200/90 bg-white px-3 shadow-sm">
        <Search className="h-4 w-4 text-slate-400" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara (ad veya kanonik anahtar)…" className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        {query && <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600" aria-label="Aramayı temizle"><X className="h-4 w-4" /></button>}
      </div>

      {showSelection && !loading && !error && selectableIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
            <input ref={selectAllRef} type="checkbox" checked={allInViewSelected} onChange={selectAllFiltered}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400" aria-label="Görünenleri seç" />
            Görünenleri Seç
          </label>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-semibold text-slate-500">{selected.size} seçili</span>
          {selected.size > 0 && (
            <>
              <button type="button" onClick={clearSelection} className="text-xs font-bold text-slate-500 hover:text-slate-700">Temizle</button>
              <button type="button" disabled={bulkBusy} onClick={() => onBulkDelete!([...selected])}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Seçili İçerikleri Sil
              </button>
            </>
          )}
        </div>
      )}

      {error ? (
        <KnowledgeError message={error} />
      ) : loading ? (
        <KnowledgeLoading />
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((r) => {
            const isSel = r.id ? selected.has(r.id) : false;
            return (
              <li key={r.canonical_key}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${isSel ? "border-violet-300 bg-violet-50/50" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
                {showSelection && r.id && (
                  <input type="checkbox" checked={isSel} onChange={() => toggle(r.id!)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-400" aria-label={`${r.name_tr} seç`} />
                )}
                <Link href={hrefFor(r.canonical_key)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{r.name_tr}</span>
                    {r.name_original && <span className="block truncate text-[11px] text-slate-400">{r.name_original}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE_TONE[r.badge.tone]}`}>{r.badge.label}</span>}
                    <span className="font-mono text-[11px] text-slate-400">{r.canonical_key}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-10 text-center text-xs text-slate-500">
              {items.length === 0 ? (emptyLabel ?? "Henüz yayınlanmış içerik yok.") : "Aramaya uyan kayıt yok."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
