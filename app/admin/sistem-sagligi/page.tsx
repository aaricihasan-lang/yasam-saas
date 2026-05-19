"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Home, Shield } from "lucide-react";
import { ADMIN_DEMO_VALUE } from "@/components/admin/AdminModuleLayout";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

const navLinkClass =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-bold shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg md:h-16 md:w-auto md:px-8 md:text-lg";

const demoCardThemes = [
  {
    cardBg: "from-blue-50/95 via-white to-sky-50/90",
    border: "border-blue-200/80",
    valueText: "text-indigo-950",
  },
  {
    cardBg: "from-violet-50/95 via-white to-fuchsia-50/90",
    border: "border-violet-200/80",
    valueText: "text-violet-950",
  },
  {
    cardBg: "from-emerald-50/95 via-white to-teal-50/90",
    border: "border-emerald-200/80",
    valueText: "text-emerald-950",
  },
  {
    cardBg: "from-amber-50/95 via-white to-orange-50/90",
    border: "border-amber-200/80",
    valueText: "text-amber-950",
  },
  {
    cardBg: "from-rose-50/95 via-white to-red-50/90",
    border: "border-rose-200/80",
    valueText: "text-rose-950",
  },
  {
    cardBg: "from-cyan-50/95 via-white to-teal-50/90",
    border: "border-cyan-200/80",
    valueText: "text-cyan-950",
  },
] as const;

const demoCards = [
  { title: "Toplam Kullanıcı", href: "/admin/sistem-sagligi/kullanicilar" },
  { title: "Aktif Uzman", href: "/admin/sistem-sagligi/uzmanlar" },
  { title: "Pasif / Bekleyen Kullanıcı", href: "/admin/sistem-sagligi/bekleyenler" },
  { title: "Toplam Danışan", href: "/admin/sistem-sagligi/danisanlar" },
  { title: "Toplam Numeroloji Analizi", href: "/admin/sistem-sagligi/numeroloji" },
  { title: "Toplam Doğaltaş Kaydı", href: "/admin/sistem-sagligi/dogaltas" },
  { title: "Kişisel Arşiv Kayıtları", href: "/admin/sistem-sagligi/arsiv" },
  { title: "Son Hata Kaydı", href: "/admin/sistem-sagligi/hatalar" },
  { title: "Son Yedek Tarihi", href: "/admin/sistem-sagligi/yedekler" },
  { title: "Sistem Durumu", href: "/admin/sistem-sagligi/durum" },
] as const;

function AdminNavButtons({ className = "" }: { className?: string }) {
  return (
    <nav
      className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center ${className}`}
      aria-label="Sayfa navigasyonu"
    >
      <Link
        href="/admin"
        className={`${navLinkClass} border-violet-300/80 bg-gradient-to-r from-violet-100 to-indigo-100 text-violet-950 hover:border-violet-400 no-underline`}
      >
        <ArrowLeft className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
        Admin Paneline Dön
      </Link>
      <Link
        href="/"
        className={`${navLinkClass} border-emerald-300/80 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-950 hover:border-emerald-400 no-underline`}
      >
        <Home className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
        Ana Panele Dön
      </Link>
    </nav>
  );
}

export default function SistemSagligiPage() {
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
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
        <header className="relative mb-6 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-[0_28px_80px_rgba(16,185,129,0.18)] sm:px-10 sm:py-10">
          <div className="relative flex flex-wrap items-start gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg ring-1 ring-white/25"
            >
              <Activity className="h-8 w-8 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Sistem Sağlığı
              </h1>
              <p className="mt-3 max-w-3xl text-base font-medium text-white/90 sm:text-lg">
                Bağlantı, kullanım, performans ve güvenlik özeti
              </p>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-50 -mx-1 mb-6 border-b border-white/60 bg-gradient-to-r from-slate-50/95 via-indigo-50/95 to-cyan-50/95 px-1 py-4 backdrop-blur-xl sm:-mx-2 sm:px-2 sm:py-5">
          <AdminNavButtons />
        </div>

        <section className="mb-8 rounded-3xl border-2 border-violet-200/80 bg-gradient-to-r from-violet-50/95 via-white to-indigo-50/90 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <p className="text-xl font-black text-violet-950 sm:text-2xl">Bu modül hazırlanıyor</p>
          <p className="mt-3 text-base font-medium leading-relaxed text-violet-900/90">
            Yakında gerçek Supabase verileri bu modüle bağlanacak. Aşağıdaki kartlar şimdilik demo
            değer gösterir.
          </p>
        </section>

        <section aria-label="Sistem metrikleri">
          <h2 className="text-xl font-black text-slate-900">Sistem metrikleri</h2>
          <p className="mt-2 text-base text-slate-600">
            Platform genelinde kullanım ve durum göstergeleri
          </p>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {demoCards.map((card, index) => {
              const theme = demoCardThemes[index % demoCardThemes.length];
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="block h-full no-underline"
                >
                  <article
                    className={`flex h-full min-h-[168px] cursor-pointer flex-col rounded-3xl border-2 bg-gradient-to-br p-6 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl sm:min-h-[180px] sm:p-7 ${theme.cardBg} ${theme.border}`}
                  >
                    <span className="w-fit rounded-full border border-white/90 bg-white/80 px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
                      Demo
                    </span>
                    <h3 className="mt-4 text-lg font-black text-slate-900 sm:text-xl">{card.title}</h3>
                    <p className={`mt-3 flex-1 text-base font-bold leading-relaxed ${theme.valueText}`}>
                      {ADMIN_DEMO_VALUE}
                    </p>
                    <p className="mt-4 text-sm font-bold text-slate-600">Detayları gör →</p>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-200/80 pt-8">
          <p className="text-sm font-semibold text-slate-500">
            Sistem Sağlığı · admin modül önizlemesi
          </p>
        </footer>
      </div>
    </main>
  );
}
