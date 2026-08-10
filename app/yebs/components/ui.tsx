"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Yayınlanmamış kayıt rozeti — TEK metin, exact. */
export const PREVIEW_BADGE_TEXT = "Önizleme — Yayınlanmamış";

export function PreviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
      {PREVIEW_BADGE_TEXT}
    </span>
  );
}

export function Pill({ children, tone = "emerald" }: { children: ReactNode; tone?: "emerald" | "violet" | "slate" | "rose" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800 ring-emerald-200/70",
    violet: "bg-violet-100 text-violet-800 ring-violet-200/70",
    slate: "bg-slate-100 text-slate-700 ring-slate-200/70",
    rose: "bg-rose-100 text-rose-800 ring-rose-200/70",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function LoadingBlock({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-slate-200/70 bg-white/70 px-6 py-14 text-sm text-slate-500">
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/60 px-6 py-16 text-center">
      <div className="text-3xl" aria-hidden>
        🌿
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-6 py-10 text-center text-sm text-rose-700">
      {message}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 no-underline hover:text-emerald-800">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/** Liste kartı sarmalayıcı — tıklanabilir, pastel, admin-tablo gibi görünmez. */
export function EntityCard({
  href,
  title,
  subtitle,
  meta,
  preview,
  emoji,
}: {
  href: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  preview?: boolean;
  emoji?: string;
}) {
  return (
    <Link href={href} className="block text-inherit no-underline">
      <div className="group flex h-full flex-col rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {emoji ? <span className="text-xl leading-none" aria-hidden>{emoji}</span> : null}
            <h3 className="min-w-0 break-words text-base font-bold text-slate-900">{title}</h3>
          </div>
        </div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {meta}
          {preview ? <PreviewBadge /> : null}
        </div>
      </div>
    </Link>
  );
}

/** Detay bölüm kartı. */
export function SectionCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 sm:p-5">
      {title ? <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Etiketli tek satır alan (detay). */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="break-words text-sm text-slate-800">{value}</span>
    </div>
  );
}
