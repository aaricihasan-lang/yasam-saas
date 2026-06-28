"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";

type BiyoenerjiSectionShellProps = {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
  headerVariant?: "default" | "premium" | "detail";
};

export default function BiyoenerjiSectionShell({
  title,
  subtitle,
  badge,
  children,
  headerVariant = "default",
}: BiyoenerjiSectionShellProps) {
  const premium = headerVariant === "premium";
  const detail = headerVariant === "detail";

  if (detail) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950">
        <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-violet-400/12 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-5 sm:py-3.5 xl:px-8 2xl:px-12">
          <div className="min-h-0 min-w-0 flex-1 pb-2">{children}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-violet-400/12 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-5 sm:py-4 xl:px-8 2xl:px-12">
        <header
          className={`mb-4 shrink-0 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-md sm:rounded-3xl sm:px-5 sm:py-3.5 ${
            premium
              ? "border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white/90 to-cyan-50/90 ring-1 ring-white/95"
              : "border-violet-200/50 bg-white/85 ring-1 ring-white/90"
          }`}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={BIOENERJI_FOLDER_BASE}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white min-h-[40px] px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 lg:min-h-0 hover:text-violet-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Biyoenerji
              </Link>
              <Link
                href="/enerji-beden"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white min-h-[40px] px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 lg:min-h-0 hover:text-cyan-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Enerji &amp; Beden
              </Link>
            </div>

            <div>
              <p className="mb-1.5 inline-flex rounded-full border border-violet-200 bg-violet-50/90 px-3 py-0.5 text-[10px] font-black tracking-[0.18em] text-violet-800">
                {badge}
              </p>
              <h1
                className={`font-black tracking-tight text-slate-950 ${
                  premium
                    ? "text-3xl sm:text-4xl xl:text-[2.5rem]"
                    : "text-xl sm:text-2xl xl:text-3xl"
                }`}
              >
                {title}
              </h1>
              <p
                className={`mt-1 font-medium text-slate-500 ${
                  premium ? "max-w-2xl text-sm sm:text-base" : "text-xs sm:text-sm"
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
