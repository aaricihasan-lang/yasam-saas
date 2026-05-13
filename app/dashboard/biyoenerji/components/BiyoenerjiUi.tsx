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
  return `h-10 w-full rounded-xl border border-white/65 bg-white/78 px-3.5 text-[13px] font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_22px_-10px_rgba(15,23,42,0.06)] backdrop-blur-sm outline-none ring-1 transition duration-200 ease-out hover:bg-white/92 hover:shadow-[0_6px_28px_-10px_rgba(15,23,42,0.08)] ${searchToneRing[tone]}`;
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

const statTone: Record<
  BiyoenerjiTone,
  { card: string; accent: string }
> = {
  violet: {
    card: "border-violet-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(109,40,217,0.08)]",
    accent: "text-violet-700/90",
  },
  cyan: {
    card: "border-cyan-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(8,145,178,0.08)]",
    accent: "text-cyan-800/85",
  },
  fuchsia: {
    card: "border-fuchsia-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(192,38,211,0.07)]",
    accent: "text-fuchsia-800/85",
  },
  amber: {
    card: "border-amber-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(217,119,6,0.07)]",
    accent: "text-amber-900/85",
  },
  emerald: {
    card: "border-emerald-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(5,150,105,0.07)]",
    accent: "text-emerald-800/85",
  },
  orange: {
    card: "border-orange-100/50 bg-white/75 shadow-[0_4px_24px_-8px_rgba(234,88,12,0.07)]",
    accent: "text-orange-900/85",
  },
};

export function ModuleStats({
  total,
  midLabel,
  midCount,
  lastDate,
  tone,
}: {
  total: number;
  midLabel: string;
  midCount: number;
  lastDate: string;
  tone: BiyoenerjiTone;
}) {
  const s = statTone[tone];
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
          className={`rounded-2xl border px-3 py-2.5 backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-px hover:shadow-[0_8px_28px_-10px_rgba(15,23,42,0.09)] ${s.card}`}
        >
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{it.k}</p>
          <p className={`mt-0.5 truncate text-[15px] font-black tabular-nums tracking-tight ${s.accent}`}>
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
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-12 text-center ring-1 transition duration-300 hover:shadow-[0_8px_32px_-12px_rgba(15,23,42,0.06)] ${ring}`}
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-white/90">
        {icon}
      </div>
      <p className="text-[14px] font-black text-slate-800">{title}</p>
      <p className="mt-1.5 max-w-[260px] text-[12px] font-medium leading-relaxed text-slate-500">{subtitle}</p>
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
  "rounded-2xl border border-white/65 bg-white/50 p-5 shadow-[0_8px_36px_-14px_rgba(15,23,42,0.07)] ring-1 ring-white/70 backdrop-blur-md transition-shadow duration-300 sm:p-6";

/** Liste kolonu — yumuşak kart */
export const listColumnClass =
  "flex min-h-[220px] w-full flex-col rounded-2xl border border-white/55 bg-gradient-to-b from-white/92 to-white/55 p-3.5 shadow-[0_4px_28px_-12px_rgba(15,23,42,0.06)] ring-1 ring-white/75 backdrop-blur-sm lg:max-w-[min(100%,380px)] lg:flex-none lg:w-[min(100%,380px)]";

/** Ana bölüm kartı */
export const sectionShellClass =
  "rounded-2xl border border-white/80 bg-white/82 p-4 shadow-[0_6px_32px_-14px_rgba(15,23,42,0.055)] ring-1 ring-white/60 backdrop-blur-sm sm:p-5";
