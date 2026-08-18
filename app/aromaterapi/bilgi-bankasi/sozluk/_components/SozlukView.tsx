"use client";

import { useState } from "react";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import { useReadListSelection } from "@/app/aromaterapi/_components/read/useReadListSelection";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MetaChip,
  ReadFilterSelect,
  ReadSearchBar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchGlossaryList } from "@/lib/aromaterapi/glossaryData";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";
import { GLOSSARY_STATUS_TR, tr } from "@/lib/aromaterapi/readLabels";

/**
 * Sözlük — gerçek tenant-scoped terim listesi (arama + durum filtresi + sayfalama).
 * NOT: şemada dil kolonu yok → dil filtresi uygulanmaz (TR/EN ayrı kolonlar).
 */

const FILTER_KEYS = ["status"] as const;

export function SozlukView() {
  const s = useAromaterapiListQuery<GlossaryTermListItem>({
    fetcher: fetchGlossaryList,
    filterKeys: FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const { showToast } = useToast();
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/glossary/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });

  return (
    <ReadListScreen<GlossaryTermListItem>
      selection={selection}
      loading={s.loading}
      errorCode={s.errorCode}
      rows={s.rows}
      total={s.total}
      page={s.page}
      limit={s.limit}
      hasActiveQuery={hasActive}
      onPage={s.goToPage}
      onRetry={s.retry}
      emptyTitle="Henüz sözlük terimi yok"
      emptyMessage="Bu tenant kütüphanesinde tanımlı terim bulunmuyor."
      gridClassName="grid grid-cols-1 gap-3 lg:grid-cols-2"
      search={
        <ReadSearchBar value={s.qInput} onChange={s.setQInput} placeholder="Terim veya tanım ara…" />
      }
      filters={
        <>
          <ReadFilterSelect
            label="Durum"
            value={s.filters.status ?? ""}
            options={Object.entries(GLOSSARY_STATUS_TR).map(([value, label]) => ({ value, label }))}
            onChange={(v) => s.setFilter("status", v)}
          />
          <ReadFilterSelect
            label="Sırala"
            value={s.sort}
            allLabel="Terime göre (A–Z)"
            options={[{ value: "updated", label: "Son güncelleme" }]}
            onChange={s.setSort}
          />
        </>
      }
      renderItem={(row) => <TermCard key={row.id} row={row} />}
    />
  );
}

function TermCard({ row }: { row: GlossaryTermListItem }) {
  const [open, setOpen] = useState(false);
  const hasPro = Boolean(row.professional_definition_tr);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-rose-100/70 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[15px] font-black text-slate-900 [overflow-wrap:anywhere]">
          {row.canonical_term_tr}
        </h3>
        {row.canonical_term_en ? (
          <span className="text-[12px] font-semibold italic text-slate-400">
            {row.canonical_term_en}
          </span>
        ) : null}
        <MetaChip tone="rose">{tr.label(GLOSSARY_STATUS_TR, row.status)}</MetaChip>
      </div>
      <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
        {row.short_definition_tr}
      </p>
      {hasPro ? (
        <div className="mt-auto pt-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-3 text-[12px] font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            {open ? "Profesyonel tanımı gizle" : "Profesyonel tanımı göster"}
          </button>
          {open ? (
            <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-rose-200 pl-3 text-[13px] font-medium leading-relaxed text-slate-600">
              {row.professional_definition_tr}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
