"use client";

import Link from "next/link";

export type NumerolojiListeSatir = {
  id: string;
  full_name: string;
  birth_date: string;
  created_at: string;
};

export function NumerolojiListeKarti({ row }: { row: NumerolojiListeSatir }) {
  return (
    <li>
      <Link
        href={`/numeroloji/liste/${row.id}`}
        className="block rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm ring-1 ring-violet-100/40 no-underline transition hover:border-violet-300 hover:shadow-md"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">{row.full_name}</h2>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Detay →</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Doğum: {row.birth_date}</p>
        <p className="mt-1 text-xs text-slate-500">
          Kayıt:{" "}
          {new Date(row.created_at).toLocaleString("tr-TR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </Link>
    </li>
  );
}
