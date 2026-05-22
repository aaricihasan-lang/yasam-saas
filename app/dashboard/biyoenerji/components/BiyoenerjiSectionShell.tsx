"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";

type BiyoenerjiSectionShellProps = {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
};

export default function BiyoenerjiSectionShell({
  title,
  subtitle,
  badge,
  children,
}: BiyoenerjiSectionShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] rounded-full bg-violet-400/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-[380px] w-[380px] rounded-full bg-cyan-400/12 blur-3xl" />

      <div className="relative z-10 flex min-h-screen w-full flex-col px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
        <header className="mb-5 shrink-0 rounded-[28px] border border-violet-200/60 bg-white/80 p-5 shadow-lg ring-1 ring-white/90 backdrop-blur-md sm:rounded-[34px] sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Link
                href={BIOENERJI_FOLDER_BASE}
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-900 shadow-sm transition hover:bg-violet-50 sm:px-5 sm:py-3"
              >
                <span aria-hidden>←</span>
                Biyoenerji Ana Klasörüne Dön
              </Link>
              <Link
                href="/enerji-beden"
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-cyan-200/80 bg-white px-4 py-2.5 text-sm font-black text-cyan-950 shadow-sm transition hover:bg-cyan-50 sm:px-5 sm:py-3"
              >
                <span aria-hidden>←</span>
                Enerji & Beden&apos;e Dön
              </Link>
            </div>

            <div>
              <p className="mb-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1 text-[10px] font-black tracking-[0.2em] text-violet-800 sm:text-xs">
                {badge}
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl xl:text-5xl">
                {title}
              </h1>
              <p className="mt-2 text-base font-medium text-slate-600 sm:text-lg">{subtitle}</p>
            </div>
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 pb-2">{children}</div>
      </div>
    </main>
  );
}
