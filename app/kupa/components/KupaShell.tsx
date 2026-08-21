"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * KUPA & HACAMAT — ortak sayfa kabuğu. Yaşam Sistemi koyu tasarım diliyle uyumlu
 * (bg-[#081028], amber/kızıl modül aksanı). Yeni bir design system üretilmez.
 */
export function KupaShell({
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#081028] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <Link href="/dashboard" className="text-inherit no-underline transition hover:text-slate-200">
            Panel
          </Link>
          <span aria-hidden>›</span>
          {breadcrumb?.length ? (
            <>
              <Link href="/kupa" className="text-inherit no-underline transition hover:text-slate-200">
                Kupa &amp; Hacamat
              </Link>
              {breadcrumb.map((b) => (
                <span key={b.label} className="flex items-center gap-1.5">
                  <span aria-hidden>›</span>
                  {b.href ? (
                    <Link href={b.href} className="text-inherit no-underline transition hover:text-slate-200">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-slate-300">{b.label}</span>
                  )}
                </span>
              ))}
            </>
          ) : (
            <span className="text-slate-300">Kupa &amp; Hacamat</span>
          )}
        </nav>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-amber-200 to-orange-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
              {title}
            </h1>
            {subtitle ? <p className="mt-1 text-xs text-slate-400 md:text-sm">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        {children}
      </div>
    </div>
  );
}

/** Ortak amber birincil buton stili. */
export const kupaBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-50";
export const kupaBtnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]";
export const kupaBtnDanger =
  "inline-flex items-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/15 px-2.5 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/25";

export const kupaInput =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-amber-400/40 focus:bg-white/[0.06]";
export const kupaCard =
  "rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm";
