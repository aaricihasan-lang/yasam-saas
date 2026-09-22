"use client";

import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/** Türkiye kalıcı UTC+03:00 → yerel takvim tarihini yarı-açık UTC ISO sınırına çevirir. */
export const TR_OFFSET = "+03:00";

export type PeriodPreset = "7" | "30" | "90" | "custom";
export type Period = {
  preset: PeriodPreset;
  from: string | null; // ISO (dahil)
  to: string | null;   // ISO (hariç — yarı-açık)
  days: number | null; // overview activeSinceDays
  invalid: boolean;    // custom ters/geçersiz
};

export function presetPeriod(preset: "7" | "30" | "90", nowMs: number): Period {
  const days = Number(preset);
  return { preset, from: new Date(nowMs - days * 86400000).toISOString(), to: null, days, invalid: false };
}

/** Custom yerel takvim tarihleri (YYYY-MM-DD) → yarı-açık [from, to+1gün) UTC. */
export function customPeriod(fromDate: string, toDate: string): Period {
  const valid = !!fromDate && !!toDate;
  if (!valid) return { preset: "custom", from: null, to: null, days: null, invalid: true };
  const fromIso = new Date(`${fromDate}T00:00:00${TR_OFFSET}`);
  // to HARİÇ: bitiş gününün ertesi 00:00 (yarı-açık aralık).
  const toNext = new Date(`${toDate}T00:00:00${TR_OFFSET}`);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  const invalid = Number.isNaN(fromIso.getTime()) || Number.isNaN(toNext.getTime()) || fromIso.getTime() >= toNext.getTime();
  return {
    preset: "custom",
    from: invalid ? null : fromIso.toISOString(),
    to: invalid ? null : toNext.toISOString(),
    days: null,
    invalid,
  };
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Kullanım Takibi sekmeleri" className="flex flex-wrap gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => {
        const sel = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={sel}
            type="button"
            onClick={() => onChange(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 ${
              sel ? "border-fuchsia-500 text-fuchsia-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function PeriodControl({ period, customFrom, customTo, onPreset, onCustom }: {
  period: Period;
  customFrom: string;
  customTo: string;
  onPreset: (p: "7" | "30" | "90") => void;
  onCustom: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Dönem">
        {(["7", "30", "90"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPreset(p)}
            aria-pressed={period.preset === p}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${period.preset === p ? "bg-fuchsia-100 text-fuchsia-800" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {p}g
          </button>
        ))}
        <span className="mx-1 self-center text-slate-300" aria-hidden>|</span>
        <label className="flex items-center gap-1 px-1 text-xs text-slate-500">
          <span className="sr-only">Başlangıç</span>
          <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => onCustom(e.target.value, customTo)} className="rounded border border-slate-200 px-1.5 py-1 text-xs" />
          <span aria-hidden>–</span>
          <span className="sr-only">Bitiş</span>
          <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => onCustom(customFrom, e.target.value)} className="rounded border border-slate-200 px-1.5 py-1 text-xs" />
        </label>
      </div>
      {period.invalid ? (
        <span className="text-xs font-semibold text-rose-600" role="alert">Geçersiz aralık: başlangıç &lt; bitiş olmalı.</span>
      ) : null}
    </div>
  );
}

export function SectionCard({ title, subtitle, right, children, className = "" }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-sm font-bold text-slate-800">{title}</h3> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, tone = "slate" }: {
  label: string; value: ReactNode; hint?: string; tone?: "violet" | "emerald" | "amber" | "slate" | "rose" | "cyan";
}) {
  const tones: Record<string, string> = {
    violet: "from-violet-50 to-white text-violet-950 border-violet-200",
    emerald: "from-emerald-50 to-white text-emerald-950 border-emerald-200",
    amber: "from-amber-50 to-white text-amber-950 border-amber-200",
    slate: "from-slate-50 to-white text-slate-900 border-slate-200",
    rose: "from-rose-50 to-white text-rose-950 border-rose-200",
    cyan: "from-cyan-50 to-white text-cyan-950 border-cyan-200",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs font-medium leading-snug opacity-70">{hint}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-slate-500" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-fuchsia-600" aria-hidden /> {label}
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-500">
      <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
      <p className="font-semibold text-slate-600">{title}</p>
      {hint ? <p className="max-w-md text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 py-8 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-rose-500" aria-hidden />
      <p className="font-semibold text-rose-800">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">
          <RefreshCw className="h-4 w-4" aria-hidden /> Tekrar dene
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-between gap-2 text-sm" aria-label="Sayfalama">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40">Önceki</button>
      <span className="text-slate-500">Sayfa {page} / {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40">Sonraki</button>
    </nav>
  );
}

export function StatusPill({ active, approvalStatus, isArchived }: { active: boolean; approvalStatus: string; isArchived: boolean }) {
  const s = approvalStatus.trim().toLowerCase();
  let label = "Aktif", cls = "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (s === "pending") { label = "Onay bekliyor"; cls = "bg-amber-100 text-amber-800 ring-amber-200"; }
  else if (s === "rejected") { label = "Reddedildi"; cls = "bg-rose-100 text-rose-800 ring-rose-200"; }
  else if (isArchived) { label = "Arşiv"; cls = "bg-slate-200 text-slate-700 ring-slate-300"; }
  else if (!active) { label = "Pasif"; cls = "bg-slate-100 text-slate-600 ring-slate-200"; }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${cls}`}>{label}</span>;
}
