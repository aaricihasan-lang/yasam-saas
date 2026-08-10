"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, LoadingBlock, Pill, PreviewBadge } from "./ui";
import { usePreview } from "./preview";
import type { ApiResult, EvidenceDTO, ListEnvelope } from "../yebsShowcaseApi";

/** Uzun pasaj için taşmayan, genişletilebilir metin (production verisi değişmez). */
export function ExpandableText({ text, max = 320 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > max;
  const shown = open || !long ? text : `${text.slice(0, max).trimEnd()}…`;
  return (
    <span className="break-words">
      {shown}
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-1 whitespace-nowrap text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          {open ? "Daha az" : "Devamını göster"}
        </button>
      ) : null}
    </span>
  );
}

function EvidenceRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 py-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="break-words text-sm text-slate-800">{value}</span>
    </div>
  );
}

/** Claim/Relation kanıt kartları (read-only). rejected zaten server'da elenir. */
export function EvidenceList({ items }: { items: EvidenceDTO[] }) {
  const { withPreview } = usePreview();
  if (items.length === 0) {
    return <EmptyState title="Bu bilgiye bağlı kaynak henüz eklenmemiş." />;
  }
  return (
    <div className="space-y-3">
      {items.map((e) => (
        <div
          key={e.id}
          className={`rounded-2xl border bg-white/80 p-4 ${
            e.isContradiction ? "border-rose-200/80" : "border-slate-200/70"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link href={withPreview(`/yebs/sources/${e.sourceId}`)} className="text-sm font-bold text-emerald-700 no-underline hover:text-emerald-800">
              {e.sourceTitle}
            </Link>
            <Pill tone={e.isContradiction ? "rose" : "slate"}>{e.sourceRoleLabel}</Pill>
            {e.isContradiction ? <Pill tone="rose">Çelişki</Pill> : null}
            {e.evidenceLayerLabel ? <Pill tone="violet">{e.evidenceLayerLabel}</Pill> : null}
          </div>
          <EvidenceRow label="Locator" value={e.locatorText} />
          <EvidenceRow
            label="Özgün pasaj"
            value={
              e.sourceOriginalExcerpt ? (
                <span>
                  <ExpandableText text={e.sourceOriginalExcerpt} />
                  {e.originalLanguageTag ? <span className="ml-1 text-xs text-slate-400">({e.originalLanguageTag})</span> : null}
                </span>
              ) : null
            }
          />
          <EvidenceRow
            label="Transliterasyon"
            value={
              e.transliteration ? (
                <span>
                  <ExpandableText text={e.transliteration} />
                  {e.transliterationScheme ? <span className="ml-1 text-xs text-slate-400">({e.transliterationScheme})</span> : null}
                </span>
              ) : null
            }
          />
          <EvidenceRow
            label="Sadık çeviri"
            value={
              e.faithfulTranslation ? (
                <span>
                  <ExpandableText text={e.faithfulTranslation} />
                  {e.translationLanguageTag ? <span className="ml-1 text-xs text-slate-400">({e.translationLanguageTag})</span> : null}
                </span>
              ) : null
            }
          />
          <EvidenceRow label="Gerekçe" value={e.rationale ? <ExpandableText text={e.rationale} /> : null} />
        </div>
      ))}
    </div>
  );
}

/** Bir üst kayda bağlı listeyi (detay sekmesi) mount'ta yükleyip kart olarak basar. */
export function ScopedList<T extends { id: string }>({
  load,
  renderCard,
  emptyTitle,
}: {
  load: (signal: AbortSignal) => Promise<ApiResult<ListEnvelope<T>>>;
  renderCard: (row: T) => ReactNode;
  emptyTitle: string;
}) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) setRows(res.data.rows);
      else setError(res.error);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorState message={error} />;
  if (rows === null) return <LoadingBlock />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.id}>{renderCard(r)}</div>
      ))}
    </div>
  );
}

/** Ortak küçük kart parçaları (liste/sekme paylaşımlı). */
export function PreviewInline({ preview }: { preview: boolean }) {
  return preview ? <PreviewBadge /> : null;
}
