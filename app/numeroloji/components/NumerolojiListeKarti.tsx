"use client";

import Link from "next/link";
import { extractSummaryFromAnalysisData } from "../utils/analysisJson";

export type NumerolojiListeSatir = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at: string;
  analysis_data?: unknown;
};

export function NumerolojiListeKarti({ row }: { row: NumerolojiListeSatir }) {
  const adSoyad = `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim();
  const summary = extractSummaryFromAnalysisData(row.analysis_data);

  return (
    <li>
      <Link
        href={`/numeroloji/liste/${row.id}`}
        className="group relative block min-h-[7.5rem] overflow-hidden rounded-[28px] border border-white/75 bg-white/55 p-6 shadow-[0_14px_44px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/45 no-underline backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-violet-300/70 hover:bg-white/80 hover:shadow-[0_22px_48px_-12px_rgba(91,33,182,0.22)] sm:min-h-[8rem] sm:p-8"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/[0.06] via-transparent to-sky-500/[0.05] opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{adSoyad}</h2>
          <span className="inline-flex shrink-0 items-center rounded-full border border-violet-200/85 bg-violet-50/90 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-violet-800 shadow-sm ring-1 ring-violet-100/70 transition group-hover:border-violet-300 group-hover:bg-violet-100 group-hover:text-violet-950 sm:px-5 sm:py-2.5 sm:text-sm">
            Detay →
          </span>
        </div>
        <p className="relative mt-3 text-base font-semibold text-slate-600 sm:mt-4 sm:text-lg">
          Doğum tarihi: {row.birth_date}
        </p>
        {summary ? (
          <p className="relative mt-3 line-clamp-2 text-sm font-medium leading-relaxed text-slate-600 sm:mt-4 sm:text-base">
            {summary}
          </p>
        ) : null}
        <p className="relative mt-3 text-sm font-medium text-slate-500 sm:mt-4 sm:text-base">
          Oluşturulma:{" "}
          {new Date(row.created_at).toLocaleString("tr-TR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </Link>
    </li>
  );
}
