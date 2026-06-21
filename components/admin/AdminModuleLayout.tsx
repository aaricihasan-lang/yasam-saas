"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Home, Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

export const ADMIN_DEMO_VALUE = "Veri bağlantısı hazırlanıyor";

const navBtn =
  "inline-flex h-10 sm:h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 sm:px-5 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-1";

const demoCardThemes = [
  {
    iconWrap: "from-indigo-500 to-blue-600",
    cardBg: "from-blue-50/95 via-white to-sky-50/90",
    border: "border-blue-200/80",
    valueText: "text-indigo-950",
  },
  {
    iconWrap: "from-violet-500 to-purple-600",
    cardBg: "from-violet-50/95 via-white to-fuchsia-50/90",
    border: "border-violet-200/80",
    valueText: "text-violet-950",
  },
  {
    iconWrap: "from-emerald-500 to-teal-600",
    cardBg: "from-emerald-50/95 via-white to-teal-50/90",
    border: "border-emerald-200/80",
    valueText: "text-emerald-950",
  },
  {
    iconWrap: "from-amber-500 to-orange-500",
    cardBg: "from-amber-50/95 via-white to-orange-50/90",
    border: "border-amber-200/80",
    valueText: "text-amber-950",
  },
  {
    iconWrap: "from-rose-500 to-red-600",
    cardBg: "from-rose-50/95 via-white to-red-50/90",
    border: "border-rose-200/80",
    valueText: "text-rose-950",
  },
  {
    iconWrap: "from-cyan-500 to-teal-500",
    cardBg: "from-cyan-50/95 via-white to-teal-50/90",
    border: "border-cyan-200/80",
    valueText: "text-cyan-950",
  },
] as const;

export type AdminDemoCard = {
  title: string;
  value?: string;
};

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
  demoSectionTitle?: string;
  demoSectionDesc?: string;
  demoCards: AdminDemoCard[];
  footerNote?: string;
  preparingNote?: string;
  children?: ReactNode;
};

function DemoMetricCard({
  title,
  value,
  index,
}: {
  title: string;
  value: string;
  index: number;
}) {
  const theme = demoCardThemes[index % demoCardThemes.length];

  return (
    <article
      className={`flex min-h-[120px] flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${theme.cardBg} ${theme.border}`}
    >
      <span className="w-fit rounded-full border border-white/90 bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-slate-500 shadow-sm">
        Demo
      </span>
      <h3 className="mt-3 text-base font-bold text-slate-900">{title}</h3>
      <p className={`mt-2 flex-1 text-sm font-semibold leading-relaxed ${theme.valueText}`}>
        {value}
      </p>
    </article>
  );
}

export function AdminModuleLayout({
  title,
  description,
  headerLabel = "Admin · Modül",
  Icon,
  theme,
  demoSectionTitle = "Önizleme metrikleri",
  demoSectionDesc = "Yakında gerçek Supabase verileri bağlanacak.",
  demoCards,
  footerNote,
  preparingNote = "Yakında gerçek Supabase verileri bu modüle bağlanacak. Aşağıdaki kartlar şimdilik demo değer gösterir.",
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
          <Link
            href="/"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 text-base font-bold text-slate-800 no-underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <nav className="mb-6 grid gap-2 sm:grid-cols-2 sm:gap-3" aria-label="Üst navigasyon">
          <Link
            href="/admin"
            className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 hover:border-violet-400 no-underline`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            Admin Paneline Dön
          </Link>
          <Link
            href="/"
            className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 no-underline`}
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            Ana Panele Dön
          </Link>
        </nav>

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

        <section aria-label={demoSectionTitle} className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{demoSectionTitle}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden />
              Hazırlanıyor
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{demoSectionDesc}</p>
          <div
            className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
              demoCards.length > 8 ? "2xl:grid-cols-5" : ""
            }`}
          >
            {demoCards.map((card, index) => (
              <DemoMetricCard
                key={card.title}
                title={card.title}
                value={card.value ?? ADMIN_DEMO_VALUE}
                index={index}
              />
            ))}
          </div>
        </section>

        {footerNote ? (
          <footer className="mt-8 border-t border-slate-200/60 pt-6">
            <p className="text-xs font-medium text-slate-400">{footerNote}</p>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
