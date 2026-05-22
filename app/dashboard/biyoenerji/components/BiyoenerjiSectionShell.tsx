"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";

type BiyoenerjiSectionShellProps = {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
  /** Daha geniş başlık ve pastel gradient üst alan */
  headerVariant?: "default" | "premium";
};

export default function BiyoenerjiSectionShell({
  title,
  subtitle,
  badge,
  children,
  headerVariant = "default",
}: BiyoenerjiSectionShellProps) {
  const premium = headerVariant === "premium";
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] rounded-full bg-violet-400/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-[380px] w-[380px] rounded-full bg-cyan-400/12 blur-3xl" />

      <div className="relative z-10 flex min-h-screen w-full flex-col px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
        <header
          className={`mb-6 shrink-0 rounded-[28px] border p-5 shadow-lg ring-1 backdrop-blur-md sm:rounded-[34px] sm:p-7 lg:p-8 ${
            premium
              ? "border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white/90 to-cyan-50/90 shadow-[0_0_48px_rgba(139,92,246,0.14)] ring-white/95"
              : "border-violet-200/60 bg-white/80 ring-white/90"
          }`}
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={BIOENERJI_FOLDER_BASE}
                className={`inline-flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-white font-black text-violet-900 shadow-md transition hover:bg-violet-50 hover:shadow-lg ${
                  premium
                    ? "px-5 py-3.5 text-base sm:px-6 sm:py-4"
                    : "px-4 py-2.5 text-sm sm:px-5 sm:py-3"
                }`}
              >
                <span aria-hidden>←</span>
                Biyoenerji Ana Klasörüne Dön
              </Link>
              <Link
                href="/enerji-beden"
                className={`inline-flex items-center gap-2 rounded-2xl border-2 border-cyan-200/80 bg-white font-black text-cyan-950 shadow-md transition hover:bg-cyan-50 hover:shadow-lg ${
                  premium
                    ? "px-5 py-3.5 text-base sm:px-6 sm:py-4"
                    : "px-4 py-2.5 text-sm sm:px-5 sm:py-3"
                }`}
              >
                <span aria-hidden>←</span>
                Enerji & Beden&apos;e Dön
              </Link>
            </div>

            <div>
              <p
                className={`mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50/90 px-4 py-1.5 font-black tracking-[0.2em] text-violet-800 ${
                  premium ? "text-xs" : "text-[10px] sm:text-xs"
                }`}
              >
                {badge}
              </p>
              <h1
                className={`font-black tracking-tight text-slate-950 ${
                  premium
                    ? "text-4xl sm:text-5xl xl:text-6xl"
                    : "text-3xl sm:text-4xl xl:text-5xl"
                }`}
              >
                {title}
              </h1>
              <p
                className={`mt-3 font-medium text-slate-600 ${
                  premium ? "max-w-3xl text-lg sm:text-xl" : "text-base sm:text-lg"
                }`}
              >
                {subtitle}
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 pb-2">{children}</div>
      </div>
    </main>
  );
}
