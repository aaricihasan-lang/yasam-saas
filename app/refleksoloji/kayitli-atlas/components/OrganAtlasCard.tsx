"use client";

import type { OrganSummary } from "../lib/organSummary";

type OrganAtlasCardProps = {
  summary: OrganSummary;
  updatedAt: string | null;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function OrganAtlasCard({
  summary,
  updatedAt,
  onView,
  onEdit,
  onDelete,
}: OrganAtlasCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm ring-1 ring-violet-100/60">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{summary.name}</h2>
        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900">
          {summary.regionCount} bölge
        </span>
      </div>

      <dl className="mt-3 grid gap-1.5 text-sm font-medium text-slate-600">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Görünüm</dt>
          <dd className="font-semibold text-slate-800">{summary.viewLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Ayak</dt>
          <dd className="font-semibold text-slate-800">{summary.footLabel}</dd>
        </div>
        {updatedAt ? (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Son güncelleme</dt>
            <dd className="text-right text-sm font-semibold text-slate-700">
              {new Date(updatedAt).toLocaleString("tr-TR")}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-lg border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          Görüntüle
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-lg border border-fuchsia-300/80 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 sm:w-auto"
        >
          Sil
        </button>
      </div>
    </article>
  );
}
