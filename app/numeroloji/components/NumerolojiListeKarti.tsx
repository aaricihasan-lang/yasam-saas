"use client";

import Link from "next/link";
import { extractMotorFromAnalysisJson } from "../utils/analysisJson";
import { nrDisplay } from "../utils/numerolojiPlainMetin";

export type NumerolojiListeSatir = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at: string;
  analysis_data?: unknown;
};

function NrChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-xs font-black text-violet-700">{value}</span>
    </span>
  );
}

export function NumerolojiListeKarti({
  row,
  isSelected,
  onToggleSelect,
}: {
  row: NumerolojiListeSatir;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const adSoyad = `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim();
  const motor = extractMotorFromAnalysisJson(row.analysis_data);

  const pin = motor?.pinKodu;
  const pinStr = pin
    ? [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5].join(" · ")
    : null;

  return (
    <li className="relative">
      {onToggleSelect !== undefined && (
        <label
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-5 w-5 cursor-pointer items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="h-3.5 w-3.5 rounded border-violet-300 accent-violet-600"
          />
        </label>
      )}
      <Link
        href={`/numeroloji/liste/${row.id}`}
        className={`group relative block overflow-hidden rounded-[14px] border bg-white/80 px-4 py-2.5 no-underline backdrop-blur-xl transition-all duration-200 hover:bg-white/95 hover:shadow-[0_4px_16px_rgba(139,92,246,0.10)] ${
          isSelected
            ? "border-violet-400 ring-2 ring-violet-300/50"
            : "border-violet-200/70 hover:border-violet-300"
        } ${onToggleSelect !== undefined ? "pr-10" : ""}`}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/[0.03] via-transparent to-fuchsia-500/[0.03] opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />

        <div className="relative flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-black leading-tight text-slate-900">{adSoyad}</h2>
          <span className="inline-flex shrink-0 items-center rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-white shadow-[0_2px_6px_rgba(139,92,246,0.18)]">
            DETAY
          </span>
        </div>

        <div className="relative mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-[11px] font-medium text-slate-400">
          <span>Doğum: {row.birth_date}</span>
          <span>
            {new Date(row.created_at).toLocaleString("tr-TR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>

        {motor ? (
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-violet-100 pt-1.5">
            <NrChip label="Ana" value={nrDisplay(motor.anaKulvar)} />
            <NrChip label="Yan" value={nrDisplay(motor.yanKulvar)} />
            <NrChip label="İfade" value={nrDisplay(motor.ifadeSayisi)} />
            <NrChip label="Hayat Yolu" value={nrDisplay(motor.hayatYolu)} />
            {pinStr ? (
              <span className="ml-auto text-[10px] font-medium text-slate-400">
                PIN{" "}
                <span className="font-black text-slate-600">{pinStr}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </Link>
    </li>
  );
}
