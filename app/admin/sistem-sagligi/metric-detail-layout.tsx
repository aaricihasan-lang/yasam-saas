"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

const navLinkClass =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-bold shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg md:h-16 md:w-auto md:px-8 md:text-lg";

export type MetricDetailLayoutProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function MetricDetailLayout({ title, description, children }: MetricDetailLayoutProps) {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 px-8 py-12">
        <div className="mx-auto max-w-lg rounded-[32px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
        <nav
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          aria-label="Detay navigasyonu"
        >
          <Link
            href="/admin"
            className={`${navLinkClass} border-violet-300/80 bg-gradient-to-r from-violet-100 to-indigo-100 text-violet-950 hover:border-violet-400 no-underline`}
          >
            <ArrowLeft className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Admin Paneline Dön
          </Link>
          <Link
            href="/admin/sistem-sagligi"
            className={`${navLinkClass} border-emerald-300/80 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-950 hover:border-emerald-400 no-underline`}
          >
            <Activity className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Sistem Sağlığına Dön
          </Link>
        </nav>

        <header className="relative mb-8 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-[0_28px_80px_rgba(16,185,129,0.18)] sm:px-10 sm:py-10">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-emerald-200/90">
            Sistem Sağlığı · Detay
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-base font-medium text-white/90 sm:text-lg">{description}</p>
        </header>

        <section className="rounded-3xl border-2 border-amber-200/80 bg-gradient-to-r from-amber-50/95 via-white to-orange-50/90 p-6 shadow-xl sm:p-8">
          <p className="text-lg font-black text-amber-950 sm:text-xl">
            Gerçek Supabase verileri sonraki aşamada bağlanacak
          </p>
          <p className="mt-3 text-base font-medium leading-relaxed text-amber-900/90">
            Bu ekran şimdilik önizleme amaçlıdır. Metrik listesi ve filtreler veri bağlantısı
            tamamlandığında burada gösterilecektir.
          </p>
        </section>

        {children}
      </div>
    </main>
  );
}
