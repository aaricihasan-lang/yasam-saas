"use client";

import Link from "next/link";
import { useId } from "react";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import {
  MetaChip,
  ReadFilterSelect,
  ReadSearchBar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchSourceList } from "@/lib/aromaterapi/sourceData";
import type { SourceListItem } from "@/lib/aromaterapi/readTypes";
import { SOURCE_STATUS_TR, SOURCE_TYPE_TR, tr } from "@/lib/aromaterapi/readLabels";

/** Kaynaklar — gerçek tenant-scoped kaynak listesi (arama + filtre + sayfalama). */

const SOURCE_FILTER_KEYS = ["source_type", "status", "year"] as const;

const SOURCE_TYPE_OPTIONS = Object.entries(SOURCE_TYPE_TR).map(([value, label]) => ({
  value,
  label,
}));
const SOURCE_STATUS_OPTIONS = Object.entries(SOURCE_STATUS_TR).map(([value, label]) => ({
  value,
  label,
}));

export function KaynaklarView() {
  const s = useAromaterapiListQuery<SourceListItem>({
    fetcher: fetchSourceList,
    filterKeys: SOURCE_FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;

  return (
    <ReadListScreen<SourceListItem>
      loading={s.loading}
      errorCode={s.errorCode}
      rows={s.rows}
      total={s.total}
      page={s.page}
      limit={s.limit}
      hasActiveQuery={hasActive}
      onPage={s.goToPage}
      onRetry={s.retry}
      emptyTitle="Henüz kaynak yok"
      emptyMessage="Bu tenant kütüphanesinde kaynak künyesi bulunmuyor."
      gridClassName="grid grid-cols-1 gap-3 lg:grid-cols-2"
      search={
        <ReadSearchBar
          value={s.qInput}
          onChange={s.setQInput}
          placeholder="Başlık, yazar, DOI, ISBN ara…"
        />
      }
      filters={
        <>
          <ReadFilterSelect
            label="Kaynak türü"
            value={s.filters.source_type ?? ""}
            options={SOURCE_TYPE_OPTIONS}
            onChange={(v) => s.setFilter("source_type", v)}
          />
          <ReadFilterSelect
            label="Durum"
            value={s.filters.status ?? ""}
            options={SOURCE_STATUS_OPTIONS}
            onChange={(v) => s.setFilter("status", v)}
          />
          <YearFilter value={s.filters.year ?? ""} onChange={(v) => s.setFilter("year", v)} />
          <ReadFilterSelect
            label="Sırala"
            value={s.sort}
            allLabel="Başlığa göre (A–Z)"
            options={[
              { value: "year", label: "Yayın yılı (yeni)" },
              { value: "updated", label: "Son güncelleme" },
            ]}
            onChange={s.setSort}
          />
        </>
      }
      renderItem={(row) => <SourceRow key={row.id} row={row} />}
    />
  );
}

function YearFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        Yıl
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1400}
        max={2100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="örn. 2019"
        className="min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-bold text-slate-700 shadow-sm outline-none transition focus-visible:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-300/50"
      />
    </div>
  );
}

function SourceRow({ row }: { row: SourceListItem }) {
  const meta = [row.authors, row.organization, row.publication_year ? String(row.publication_year) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/aromaterapi/kaynaklar/${row.id}`}
      className="group flex h-full flex-col rounded-2xl border border-violet-100/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
    >
      <h3 className="text-[15px] font-black leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-violet-800">
        {row.title}
      </h3>
      {meta ? (
        <p className="mt-1 text-[12px] font-semibold text-slate-500 [overflow-wrap:anywhere]">{meta}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        <MetaChip tone="violet">{tr.label(SOURCE_TYPE_TR, row.source_type)}</MetaChip>
        <MetaChip tone="slate">{row.passage_count.toLocaleString("tr-TR")} pasaj</MetaChip>
        <MetaChip tone="amber">{tr.label(SOURCE_STATUS_TR, row.status)}</MetaChip>
      </div>
    </Link>
  );
}
