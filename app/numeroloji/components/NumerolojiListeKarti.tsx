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
        className="group relative block overflow-hidden rounded-[22px] border border-white/75 bg-white/55 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/45 no-underline backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-violet-300/70 hover:bg-white/75 hover:shadow-[0_18px_40px_-12px_rgba(91,33,182,0.18)]"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/[0.06] via-transparent to-sky-500/[0.05] opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black tracking-tight text-slate-900">{adSoyad}</h2>
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600/90 group-hover:text-violet-800">
            Detay →
          </span>
        </div>
        <p className="relative mt-2 text-sm font-medium text-slate-600">Doğum tarihi: {row.birth_date}</p>
        {summary ? (
          <p className="relative mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{summary}</p>
        ) : null}
        <p className="relative mt-1.5 text-xs font-medium text-slate-500">
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
