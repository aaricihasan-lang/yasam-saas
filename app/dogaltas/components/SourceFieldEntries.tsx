"use client";

import type { ReactNode } from "react";
import {
  SEARCH_MATCH_BADGE_COMPACT_CLASS,
  renderHighlightedText,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";
import {
  sourceDisplayName,
  type SourceChakraEntry,
  type SourceFieldEntry,
} from "@/lib/dogaltas/stoneSources";

/**
 * Doğaltaş — bir bilgi alanında KAYNAK BAŞINA içerik blokları (manuel test Madde 14).
 *
 * Aynı alan (ör. Fiziksel Etkiler) için her kaynağın metni kendi adının altında AYRI gösterilir;
 * metinler birleştirilmez, kaynak adı içeriğe görsel olarak bağlıdır. Yalnız taşta birden çok kaynak
 * varken kullanılır (tek kaynakta eski görünüm korunur).
 */

function SourceName({ name }: { name: string | null }) {
  return (
    <p
      data-testid="source-field-entry-name"
      data-no-search-highlight
      className={`flex min-w-0 items-center gap-1 text-[10.5px] font-black uppercase tracking-[0.08em] text-cyan-800 ${name ? "" : "italic"}`}
    >
      <span aria-hidden>📖</span>
      <span className="min-w-0 break-words">{sourceDisplayName(name)}</span>
    </p>
  );
}

const entryClass =
  "block w-full min-w-0 rounded-lg border border-slate-200 border-l-4 border-l-cyan-400 bg-white/90 px-2.5 py-2 text-left shadow-sm";

/** Salt-okunur kaynak blokları. `onOpen` verilirse her blok tıklanabilir (okuyucu). */
export function SourceEntriesList({
  entries,
  highlightQuery = "",
  clamp = true,
  emptyText,
  onOpen,
  textClassName = "text-sm leading-6 text-slate-700",
  prefix,
}: {
  entries: readonly SourceFieldEntry[];
  highlightQuery?: string;
  /** Eşleşmeyen uzun metin 4 satıra kısaltılır (eşleşen blok TAM gösterilir — WT8). */
  clamp?: boolean;
  emptyText?: string;
  onOpen?: (entry: SourceFieldEntry) => void;
  textClassName?: string;
  prefix?: ReactNode;
}) {
  const q = highlightQuery.trim();
  if (entries.length === 0) {
    return emptyText ? <p className="mt-2 text-sm italic text-slate-400">{emptyText}</p> : null;
  }
  return (
    <div data-testid="source-field-entries" className="mt-2 space-y-2">
      {entries.map((e) => {
        const hit = Boolean(q) && textMatchesQuery(e.text, q);
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <SourceName name={e.name} />
              {hit ? <span className={SEARCH_MATCH_BADGE_COMPACT_CLASS}>🔍</span> : null}
            </div>
            <p className={`mt-1 whitespace-pre-wrap ${clamp && !hit ? "line-clamp-4" : ""} ${textClassName}`}>
              {prefix}
              {q ? renderHighlightedText(e.text.trim(), q) : e.text.trim()}
            </p>
          </>
        );
        return onOpen ? (
          <button
            key={e.sourceId}
            type="button"
            data-testid="source-field-entry"
            data-source-id={e.sourceId}
            onClick={() => onOpen(e)}
            className={`${entryClass} transition hover:border-emerald-300 hover:bg-white`}
          >
            {body}
          </button>
        ) : (
          <div key={e.sourceId} data-testid="source-field-entry" data-source-id={e.sourceId} className={entryClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Düzenleme modunda kaynak satırları: HER kaynak (boş olan dahil) ayrı satır; tıklayınca YALNIZ o
 * kaynağın bu alanı düzenlenir — diğer kaynakların içeriği değişmez.
 */
export function SourceEditRows({
  sources,
  preview,
  onEdit,
  editLabel,
  addLabel,
  emptyLabel,
}: {
  sources: readonly { id: string; name: string | null }[];
  /** Kaynağın bu alandaki kısa önizlemesi ("" = boş). */
  preview: (sourceId: string) => string;
  onEdit: (sourceId: string) => void;
  editLabel: string;
  addLabel: string;
  emptyLabel: string;
}) {
  return (
    <div data-testid="source-edit-rows" className="mt-2 space-y-1.5">
      {sources.map((s) => {
        const p = preview(s.id);
        return (
          <button
            key={s.id}
            type="button"
            data-testid="source-edit-row"
            data-source-id={s.id}
            onClick={() => onEdit(s.id)}
            className={`${entryClass} flex items-center justify-between gap-2 transition hover:border-emerald-300 hover:bg-white`}
          >
            <span className="min-w-0 flex-1">
              <SourceName name={s.name} />
              <span className={`mt-0.5 block truncate text-xs ${p ? "text-slate-500" : "italic text-slate-400"}`}>
                {p || emptyLabel}
              </span>
            </span>
            <span className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-700 shadow-sm">
              {p ? editLabel : addLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Çakraların kaynak başına gösterimi (salt-okunur). */
export function SourceChakraList({
  entries,
  renderChip,
}: {
  entries: readonly SourceChakraEntry[];
  renderChip: (chakra: string) => ReactNode;
}) {
  if (entries.length === 0) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div data-testid="source-field-entries" className="mt-1 space-y-1.5">
      {entries.map((e) => (
        <div key={e.sourceId} data-testid="source-field-entry" data-source-id={e.sourceId} className={entryClass}>
          <SourceName name={e.name} />
          <div className="mt-1 flex flex-wrap gap-1.5">{e.chakras.map((c) => <span key={c}>{renderChip(c)}</span>)}</div>
        </div>
      ))}
    </div>
  );
}
