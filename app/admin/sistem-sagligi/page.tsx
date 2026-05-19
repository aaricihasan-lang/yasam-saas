"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Clock,
  Gem,
  Home,
  Shield,
  UserCheck,
  UserMinus,
  Users,
  Sparkles,
} from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";

const DEMO_VALUE = "Veri bağlantısı hazırlanıyor";

const navBtn =
  "inline-flex h-16 w-full items-center justify-center gap-3 rounded-3xl border-2 px-8 text-lg font-bold shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl sm:flex-1";

type HealthMetric = {
  title: string;
  Icon: LucideIcon;
  theme: {
    iconWrap: string;
    cardBg: string;
    border: string;
    valueText: string;
  };
};

const healthMetrics: HealthMetric[] = [
  {
    title: "Toplam Kullanıcı",
    Icon: Users,
    theme: {
      iconWrap: "from-indigo-500 to-blue-600",
      cardBg: "from-blue-50/95 via-white to-sky-50/90",
      border: "border-blue-200/80",
      valueText: "text-indigo-950",
    },
  },
  {
    title: "Aktif Uzman",
    Icon: UserCheck,
    theme: {
      iconWrap: "from-emerald-500 to-teal-600",
      cardBg: "from-emerald-50/95 via-white to-teal-50/90",
      border: "border-emerald-200/80",
      valueText: "text-emerald-950",
    },
  },
  {
    title: "Pasif / Bekleyen Kullanıcı",
    Icon: UserMinus,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-50/95 via-white to-orange-50/90",
      border: "border-amber-200/80",
      valueText: "text-amber-950",
    },
  },
  {
    title: "Toplam Danışan",
    Icon: Users,
    theme: {
      iconWrap: "from-violet-500 to-purple-600",
      cardBg: "from-violet-50/95 via-white to-fuchsia-50/90",
      border: "border-violet-200/80",
      valueText: "text-violet-950",
    },
  },
  {
    title: "Toplam Numeroloji Analizi",
    Icon: Sparkles,
    theme: {
      iconWrap: "from-fuchsia-500 to-pink-600",
      cardBg: "from-fuchsia-50/95 via-white to-pink-50/90",
      border: "border-fuchsia-200/80",
      valueText: "text-fuchsia-950",
    },
  },
  {
    title: "Toplam Doğaltaş Kaydı",
    Icon: Gem,
    theme: {
      iconWrap: "from-cyan-500 to-teal-500",
      cardBg: "from-cyan-50/95 via-white to-teal-50/90",
      border: "border-cyan-200/80",
      valueText: "text-cyan-950",
    },
  },
  {
    title: "Kişisel Arşiv Kayıtları",
    Icon: Archive,
    theme: {
      iconWrap: "from-orange-500 to-amber-500",
      cardBg: "from-orange-50/95 via-white to-amber-50/90",
      border: "border-orange-200/80",
      valueText: "text-orange-950",
    },
  },
  {
    title: "Son Hata Kaydı",
    Icon: AlertTriangle,
    theme: {
      iconWrap: "from-rose-500 to-red-600",
      cardBg: "from-rose-50/95 via-white to-red-50/90",
      border: "border-rose-200/80",
      valueText: "text-rose-950",
    },
  },
  {
    title: "Son Yedek Tarihi",
    Icon: Clock,
    theme: {
      iconWrap: "from-sky-500 to-cyan-600",
      cardBg: "from-sky-50/95 via-white to-cyan-50/90",
      border: "border-sky-200/80",
      valueText: "text-sky-950",
    },
  },
  {
    title: "Sistem Durumu",
    Icon: Activity,
    theme: {
      iconWrap: "from-green-500 to-emerald-600",
      cardBg: "from-green-50/95 via-white to-emerald-50/90",
      border: "border-green-200/80",
      valueText: "text-green-950",
    },
  },
];

function HealthMetricCard({ metric }: { metric: HealthMetric }) {
  const { Icon, theme } = metric;

  return (
    <article
      className={`flex min-h-[200px] flex-col rounded-3xl border-2 bg-gradient-to-br p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl sm:min-h-[220px] sm:p-8 ${theme.cardBg} ${theme.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.iconWrap}`}
        >
          <Icon className="h-7 w-7" strokeWidth={2.25} />
        </div>
        <span className="rounded-full border border-white/90 bg-white/80 px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
          Demo
        </span>
      </div>
      <h3 className="mt-5 text-xl font-black text-slate-900">{metric.title}</h3>
      <p className={`mt-3 flex-1 text-base font-bold leading-relaxed ${theme.valueText}`}>
        {DEMO_VALUE}
      </p>
    </article>
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
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-emerald-200/15 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-8 py-8 xl:px-10 2xl:px-14">
        <nav
          className="mb-10 grid gap-4 sm:grid-cols-2"
          aria-label="Üst navigasyon"
        >
          <Link
            href="/admin"
            className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 hover:border-violet-400 no-underline`}
          >
            <ArrowLeft className="h-7 w-7 shrink-0" strokeWidth={2.25} />
            Admin Paneline Dön
          </Link>
          <Link
            href="/"
            className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 no-underline`}
          >
            <Home className="h-7 w-7 shrink-0" strokeWidth={2.25} />
            Ana Panele Dön
          </Link>
        </nav>

        <header className="mb-10 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-8 py-10 text-white shadow-[0_28px_80px_rgba(16,185,129,0.2)] sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(167,243,208,0.15),transparent_50%)]" />
          <div className="relative flex flex-wrap items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Activity className="h-8 w-8 text-emerald-100" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-3 text-5xl font-black tracking-tight">Sistem Sağlığı</h1>
              <p className="mt-3 max-w-3xl text-lg font-medium text-white/90">
                Bağlantı, kullanım, performans ve güvenlik özeti
              </p>
            </div>
          </div>
        </header>

        <section
          className="mb-8 rounded-3xl border-2 border-amber-200/80 bg-gradient-to-r from-amber-50/95 via-white to-orange-50/90 p-6 shadow-lg backdrop-blur-sm sm:p-8"
          role="note"
        >
          <p className="text-base font-bold text-amber-950">
            Yakında gerçek Supabase verileri bağlanacak.
          </p>
          <p className="mt-2 text-base text-amber-900/90">
            Aşağıdaki kartlar şimdilik demo değer gösterir. Canlı metrikler bir sonraki
            aşamada eklenecek.
          </p>
        </section>

        <section aria-label="Sistem metrikleri">
          <h2 className="text-xl font-black text-slate-900">Özet metrikler</h2>
          <p className="mt-2 text-base text-slate-600">
            Platform genelinde kullanım ve durum göstergeleri
          </p>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {healthMetrics.map((metric) => (
              <HealthMetricCard key={metric.title} metric={metric} />
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-200/80 pt-8">
          <p className="text-sm font-semibold text-slate-500">
            Sistem Sağlığı · salt okunur admin görünümü
          </p>
        </footer>
      </div>
    </main>
  );
}
