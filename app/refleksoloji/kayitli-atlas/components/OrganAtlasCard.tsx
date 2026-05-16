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
    <article className="flex flex-col rounded-[28px] border border-white/90 bg-white/85 p-6 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/70 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">{summary.name}</h2>
        <span className="shrink-0 rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-900">
          {summary.regionCount} bölge
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-base font-medium text-slate-600">
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

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-xl border border-violet-300/80 bg-violet-100 px-4 py-2.5 text-sm font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          Görüntüle
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-xl border border-fuchsia-300/80 bg-fuchsia-50 px-4 py-2.5 text-sm font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 sm:w-auto"
        >
          Sil
        </button>
      </div>
    </article>
  );
}
