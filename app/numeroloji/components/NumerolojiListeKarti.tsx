"use client";

import Link from "next/link";
import { useMemo } from "react";
import { resolveRecordMotor } from "../utils/analysisJson";
import { nrDisplay } from "../utils/numerolojiPlainMetin";

export type NumerolojiListeSatir = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at: string;
  analysis_data?: unknown;
  /** Hafif liste özeti (?fields=summary): KAYITLI snapshot çekirdek değerleri (Model C). */
  snap_ana?: string | null;
  snap_yan?: string | null;
  snap_ifade?: string | null;
  snap_hy?: string | null;
  snap_pin?: Record<string, unknown> | null;
  snap_method?: string | null;
};

type KartDegerleri = { ana: string; yan: string; ifade: string; hy: string; pin: string | null };

function pinKisa(pin: Record<string, unknown> | null | undefined): string | null {
  if (!pin || typeof pin !== "object") return null;
  const v = ["k1", "k2", "k3", "k4", "k5"].map((k) => pin[k]);
  return v.every((x) => x !== undefined && x !== null && x !== "") ? v.join(" · ") : null;
}

const goster = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "—");

/** MODEL C: kart, kaydın KAYDEDİLDİĞİ GÜNKÜ değerlerini gösterir; ad/tarihten yeniden hesaplamaz. */
function kartDegerleri(row: NumerolojiListeSatir): KartDegerleri | null {
  const hasSnap = [row.snap_ana, row.snap_yan, row.snap_ifade, row.snap_hy].some((v) => typeof v === "string" && v.trim());
  if (hasSnap) {
    return { ana: goster(row.snap_ana), yan: goster(row.snap_yan), ifade: goster(row.snap_ifade), hy: goster(row.snap_hy), pin: pinKisa(row.snap_pin) };
  }
  const motor = row.analysis_data !== undefined ? resolveRecordMotor(row).motor : null;
  if (!motor) return null;
  return {
    ana: nrDisplay(motor.anaKulvar),
    yan: nrDisplay(motor.yanKulvar),
    ifade: nrDisplay(motor.ifadeSayisi),
    hy: nrDisplay(motor.hayatYolu),
    pin: pinKisa(motor.pinKodu as unknown as Record<string, unknown>),
  };
}

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
  const vals = useMemo(() => kartDegerleri(row), [row]);
  const pinStr = vals?.pin ?? null;

  return (
    <li className="relative">
      {onToggleSelect !== undefined && (
        <label
          className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="h-5 w-5 rounded border-violet-300 accent-violet-600"
          />
        </label>
      )}
      <Link
        href={`/numeroloji/liste/${row.id}`}
        className={`group relative block overflow-hidden border-b border-violet-100/70 px-[clamp(8px,2.5vw,14px)] py-3 no-underline transition-all duration-200 md:rounded-[14px] md:border md:bg-white/80 md:px-4 md:py-2.5 md:backdrop-blur-xl md:hover:bg-white/95 md:hover:shadow-[0_4px_16px_rgba(139,92,246,0.10)] ${
          isSelected
            ? "bg-violet-50/60 md:border-violet-400 md:ring-2 md:ring-violet-300/50"
            : "md:border-violet-200/70 md:hover:border-violet-300"
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

        {vals ? (
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-violet-100 pt-1.5">
            <NrChip label="Ana" value={vals.ana} />
            <NrChip label="Yan" value={vals.yan} />
            <NrChip label="İfade" value={vals.ifade} />
            <NrChip label="Hayat Yolu" value={vals.hy} />
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
