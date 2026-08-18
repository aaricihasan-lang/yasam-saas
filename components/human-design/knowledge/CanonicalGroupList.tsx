"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";
import { KIND_LABELS, KIND_ORDER } from "./knowledgeConstants";
import { KnowledgeError, KnowledgeLoading } from "./KnowledgeStates";

export type GroupListItem = {
  canonical_key: string;
  name_tr: string;
  name_original?: string | null;
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
 * Sunum tek; veri KAYNAĞI (uzman published API veya admin adminHdApi) rol-bilinçli
 * olarak DIŞARIDAN sağlanır. Bu bileşen yalnız gösterir.
 */
export function CanonicalGroupList({ activeKind, onKind, items, loading, error, hrefFor, emptyLabel }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return items;
    return items.filter((r) => norm(r.name_tr).includes(q) || norm(r.canonical_key).includes(q));
  }, [items, query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
              activeKind === k
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)]"
                : "border border-indigo-200 bg-white/90 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-200/90 bg-white px-3 shadow-sm">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara (ad veya kanonik anahtar)…"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {error ? (
        <KnowledgeError message={error} />
      ) : loading ? (
        <KnowledgeLoading />
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((r) => (
            <li key={r.canonical_key}>
              <Link
                href={hrefFor(r.canonical_key)}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800">{r.name_tr}</span>
                  {r.name_original && (
                    <span className="block truncate text-[11px] text-slate-400">{r.name_original}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.badge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE_TONE[r.badge.tone]}`}>
                      {r.badge.label}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-slate-400">{r.canonical_key}</span>
                </span>
              </Link>
            </li>
          ))}
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
