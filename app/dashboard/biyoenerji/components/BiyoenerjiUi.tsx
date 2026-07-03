"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export type BiyoenerjiTone = "violet" | "cyan" | "fuchsia" | "amber" | "emerald" | "orange";

const searchToneRing: Record<BiyoenerjiTone, string> = {
  violet:
    "ring-violet-100/40 focus:border-violet-200/70 focus:ring-violet-100/35 hover:ring-violet-200/40",
  cyan: "ring-cyan-100/40 focus:border-cyan-200/70 focus:ring-cyan-100/35",
  fuchsia:
    "ring-fuchsia-100/40 focus:border-fuchsia-200/70 focus:ring-fuchsia-100/35",
  amber: "ring-amber-100/40 focus:border-amber-200/70 focus:ring-amber-100/35",
  emerald:
    "ring-emerald-100/40 focus:border-emerald-200/70 focus:ring-emerald-100/35",
  orange: "ring-orange-100/40 focus:border-orange-200/70 focus:ring-orange-100/35",
};

/** Premium arama satırı — pastel, yumuşak gölge, hafif cam */
export function searchInputClass(tone: BiyoenerjiTone) {
  const borderFocus =
    tone === "cyan"
      ? "border-slate-200 focus:border-cyan-300 focus:ring-cyan-200/40"
      : "border-slate-200 focus:border-violet-300 focus:ring-violet-200/40";
  return `h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:ring-2 lg:h-9 ${borderFocus}`;
}

const badgeTone: Record<BiyoenerjiTone, string> = {
  violet:
    "border-violet-200/45 bg-gradient-to-r from-violet-50/70 to-white/55 ring-violet-100/35 focus-within:ring-violet-200/40",
  cyan: "border-cyan-200/45 bg-gradient-to-r from-cyan-50/70 to-white/55 ring-cyan-100/35 focus-within:ring-cyan-200/40",
  fuchsia:
    "border-fuchsia-200/45 bg-gradient-to-r from-fuchsia-50/70 to-white/55 ring-fuchsia-100/35 focus-within:ring-fuchsia-200/40",
  amber:
    "border-amber-200/45 bg-gradient-to-r from-amber-50/70 to-white/55 ring-amber-100/35 focus-within:ring-amber-200/40",
  emerald:
    "border-emerald-200/45 bg-gradient-to-r from-emerald-50/70 to-white/55 ring-emerald-100/35 focus-within:ring-emerald-200/40",
  orange:
    "border-orange-200/45 bg-gradient-to-r from-orange-50/70 to-white/55 ring-orange-100/35 focus-within:ring-orange-200/40",
};

/** Kategori / tip alanı için rozet benzeri kapsül */
export function badgeFieldWrapClass(tone: BiyoenerjiTone) {
  return `flex min-h-[2.85rem] items-center rounded-full border px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 transition duration-200 ${badgeTone[tone]}`;
}

export function ModuleStats({
  total,
  midLabel,
  midCount,
  lastDate,
  tone: _tone,
  loading = false,
}: {
  total: number;
  midLabel: string;
  midCount: number;
  lastDate: string;
  tone: BiyoenerjiTone;
  /** K-2: sayım henüz gelmediyse 0 yerine "…" göster. */
  loading?: boolean;
}) {
  const items = [
    { k: "Toplam kayıt", v: loading ? "…" : String(total) },
    { k: midLabel, v: loading ? "…" : String(midCount) },
    { k: "Son kayıt", v: lastDate },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div
          key={it.k}
          className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{it.k}</p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
            {it.v}
          </p>
        </div>
      ))}
    </div>
  );
}

export function CrudEmptyState({
  Icon,
  title,
  subtitle,
  tone,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  tone: BiyoenerjiTone;
}) {
  const ring = {
    violet: "border-violet-200/50 bg-violet-50/25",
    cyan: "border-cyan-200/50 bg-cyan-50/25",
    fuchsia: "border-fuchsia-200/50 bg-fuchsia-50/20",
    amber: "border-amber-200/50 bg-amber-50/25",
    emerald: "border-emerald-200/50 bg-emerald-50/25",
    orange: "border-orange-200/50 bg-orange-50/25",
  }[tone];
  return (
    <div
      className={`flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-200 bg-white/65 px-5 py-8 text-center ${ring}`}
    >
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-white/90">
        <Icon className="h-6 w-6 text-slate-400" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-base font-black text-slate-950">{title}</p>
      <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">{subtitle}</p>
    </div>
  );
}

type AutoTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
> & {
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
};

export function AutoTextarea({
  value,
  onChange,
  minRows = 3,
  className = "",
  ...rest
}: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const line = 22;
    const minH = minRows * line + 16;
    el.style.height = `${Math.max(el.scrollHeight, minH)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`overflow-hidden ${className}`}
      {...rest}
    />
  );
}

/** Sağ form cam paneli — hafif blur */
export const formGlassPanelClass =
  "flex min-h-[240px] min-w-0 flex-1 flex-col rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white/85 to-cyan-50/60 p-4 shadow-[0_0_20px_rgba(34,211,238,0.08)]";

/** Liste kolonu */
export const listColumnClass =
  "flex min-h-[240px] w-full min-w-0 flex-col rounded-2xl border border-violet-200/50 bg-gradient-to-br from-white/85 to-violet-50/60 p-4 shadow-[0_0_20px_rgba(139,92,246,0.08)] lg:flex-none lg:w-[min(100%,380px)] xl:w-[min(100%,420px)]";

/** Ana bölüm kartı */
export const sectionShellClass =
  "rounded-2xl border border-cyan-200/40 bg-white/78 p-4 shadow-[0_0_30px_rgba(34,211,238,0.09)] backdrop-blur-xl sm:p-5";

export const newRecordBtnClass =
  "inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:min-h-0";

/** Tek kaynaklı arama input'u — mor odak, modül geneli (referans tasarım diliyle hizalı) */
export const bioSearchInputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40 lg:h-9";

/** Tek kaynaklı kategori/seçim alanı — mor odak */
export const bioSelectClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40 lg:h-9";

/** Tek kaynaklı "Kaydet" (başarı) butonu */
export const bioSaveBtnClass =
  "rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 disabled:opacity-55";
