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
        className="group relative block overflow-hidden rounded-[30px] border-[3px] border-violet-300/45 bg-white/80 p-7 no-underline shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-400 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/[0.06] via-transparent to-fuchsia-500/[0.05] opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-3xl font-black text-slate-950">{adSoyad}</h2>
          <span className="inline-flex shrink-0 items-center rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 py-4 text-base font-black tracking-wide text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] transition-all duration-300 group-hover:-translate-y-1">
            DETAY
          </span>
        </div>
        <p className="relative mt-4 text-lg font-black text-slate-700">
          Doğum tarihi: {row.birth_date}
        </p>
        {summary ? (
          <p className="relative mt-4 text-base font-semibold leading-8 text-slate-600 xl:text-lg">
            {summary}
          </p>
        ) : null}
        <p className="relative mt-4 text-sm font-semibold text-slate-500 xl:text-base">
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
