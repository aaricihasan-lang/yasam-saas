"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

const navBtn =
  "inline-flex h-10 sm:h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 sm:px-5 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-1";

export type AdminModuleTheme = {
  headerGradient: string;
  headerLabelClass: string;
  iconWrap: string;
};

export type AdminModuleLayoutProps = {
  title: string;
  description: string;
  headerLabel?: string;
  Icon: LucideIcon;
  theme: AdminModuleTheme;
  footerNote?: string;
  children?: ReactNode;
};

/**
 * Admin modül kabuğu (yetki kapısı + başlık + içerik + dipnot).
 * Sahte/demo metrik kartı bölümü kaldırıldı: bu kabuk yalnız gerçek içerik (children) gösterir.
 */
export function AdminModuleLayout({
  title,
  description,
  headerLabel = "Admin · Modül",
  Icon,
  theme,
  footerNote,
  children,
}: AdminModuleLayoutProps) {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen w-full bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] px-6 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header
          className={`relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)] sm:px-8 sm:py-7 ${theme.headerGradient}`}
        >
          <div className="relative flex flex-wrap items-center gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/25 ${theme.iconWrap}`}
            >
              <Icon className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-bold uppercase tracking-widest ${theme.headerLabelClass}`}>
                {headerLabel}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
              <p className="mt-1 text-sm font-medium text-white/70">{description}</p>
            </div>
          </div>
        </header>

        {children}

        {footerNote ? (
          <footer className="mt-8 border-t border-slate-200/60 pt-6">
            <p className="text-xs font-medium text-slate-400">{footerNote}</p>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
