"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

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
      ? "border-cyan-200 focus:border-cyan-500 focus:ring-cyan-300/30"
      : "border-violet-200 focus:border-violet-500 focus:ring-violet-300/30";
  return `h-14 w-full rounded-2xl border-2 bg-white/90 px-5 text-base font-semibold text-slate-800 shadow-inner outline-none transition focus:ring-4 ${borderFocus}`;
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
}: {
  total: number;
  midLabel: string;
  midCount: number;
  lastDate: string;
  tone: BiyoenerjiTone;
}) {
  const items = [
    { k: "Toplam kayıt", v: String(total) },
    { k: midLabel, v: String(midCount) },
    { k: "Son kayıt", v: lastDate },
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {items.map((it) => (
        <div
          key={it.k}
          className="rounded-2xl border-2 border-cyan-200 bg-white/85 p-5 shadow-md"
        >
          <p className="text-sm font-bold text-slate-500">{it.k}</p>
          <p className="mt-1 truncate text-3xl font-black tabular-nums tracking-tight text-violet-700">
            {it.v}
          </p>
        </div>
      ))}
    </div>
  );
}

export function CrudEmptyState({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: string;
  title: string;
  subtitle: string;
  tone: BiyoenerjiTone;
}) {
  const ring = {
    violet: "border-violet-200/50 bg-violet-50/25 ring-violet-100/40",
    cyan: "border-cyan-200/50 bg-cyan-50/25 ring-cyan-100/40",
    fuchsia: "border-fuchsia-200/50 bg-fuchsia-50/20 ring-fuchsia-100/40",
    amber: "border-amber-200/50 bg-amber-50/25 ring-amber-100/40",
    emerald: "border-emerald-200/50 bg-emerald-50/25 ring-emerald-100/40",
    orange: "border-orange-200/50 bg-orange-50/25 ring-orange-100/40",
  }[tone];
  return (
    <div
      className={`flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border-[3px] border-dashed border-violet-200 bg-white/65 px-5 py-10 text-center ${ring}`}
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-white/90">
        {icon}
      </div>
      <p className="text-2xl font-black text-slate-950">{title}</p>
      <p className="mt-2 max-w-sm text-base font-medium text-slate-500">{subtitle}</p>
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
  "flex min-h-[520px] min-w-0 flex-1 flex-col rounded-[30px] border-[3px] border-cyan-300/40 bg-gradient-to-br from-white/85 to-cyan-50/60 p-6 shadow-[0_0_35px_rgba(34,211,238,0.12)]";

/** Liste kolonu */
export const listColumnClass =
  "flex min-h-[520px] w-full min-w-0 flex-col rounded-[30px] border-[3px] border-violet-300/40 bg-gradient-to-br from-white/85 to-violet-50/60 p-6 shadow-[0_0_35px_rgba(139,92,246,0.12)] lg:flex-none lg:w-[min(100%,420px)] xl:w-[min(100%,460px)]";

/** Ana bölüm kartı */
export const sectionShellClass =
  "rounded-[34px] border-[3px] border-cyan-300/45 bg-white/78 p-8 shadow-[0_0_50px_rgba(34,211,238,0.14)] backdrop-blur-xl";

export const newRecordBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 px-6 py-4 font-black text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] transition-all duration-300 hover:-translate-y-1";
