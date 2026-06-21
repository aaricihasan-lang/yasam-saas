"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useEffect, useState } from "react";
import { Activity, Shield } from "lucide-react";
import { ADMIN_DEMO_VALUE } from "@/components/admin/AdminModuleLayout";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

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


export default function SistemSagligiPage() {
  useBfcacheRefresh();
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
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(16,185,129,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg ring-1 ring-white/25"
            >
              <Activity className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Sistem Sağlığı
              </h1>
              <p className="mt-1 text-sm font-medium text-white/70">
                Bağlantı, kullanım, performans ve güvenlik özeti
              </p>
            </div>
          </div>
        </header>

        <section aria-label="Sistem metrikleri">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Sistem metrikleri</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden />
              Hazırlanıyor
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Platform genelinde kullanım ve durum göstergeleri
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {demoCards.map((card, index) => {
              const theme = demoCardThemes[index % demoCardThemes.length];
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="block h-full no-underline"
                >
                  <article
                    className={`flex h-full min-h-[120px] cursor-pointer flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-md transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg ${theme.cardBg} ${theme.border}`}
                  >
                    <span className="w-fit rounded-full border border-white/90 bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-slate-500 shadow-sm">
                      Demo
                    </span>
                    <h3 className="mt-3 text-base font-bold text-slate-900">{card.title}</h3>
                    <p className={`mt-2 flex-1 text-sm font-semibold leading-relaxed ${theme.valueText}`}>
                      {ADMIN_DEMO_VALUE}
                    </p>
                    <p className="mt-3 text-xs font-semibold text-slate-500">Detayları gör →</p>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200/60 pt-6">
          <p className="text-xs font-medium text-slate-400">
            Sistem Sağlığı · admin modül önizlemesi
          </p>
        </footer>
      </div>
    </main>
  );
}
