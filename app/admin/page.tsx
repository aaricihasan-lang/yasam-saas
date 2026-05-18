"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  Database,
  FileJson,
  Package,
  Settings,
  Shield,
  Upload,
  Users,
  AlertTriangle,
  CloudUpload,
} from "lucide-react";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  type YasamUser,
} from "@/lib/auth/yasamUser";

const navBtn =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-5 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[56px] sm:w-auto sm:px-7 sm:text-base";

function AdminTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
      aria-label="Admin üst navigasyon"
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4">
        <Link
          href="/"
          className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline lg:justify-self-start`}
        >
          <span className="text-xl" aria-hidden>
            🏠
          </span>
          Ana Panele Dön
        </Link>

        <p className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-violet-200/60 bg-white/60 px-4 py-2 text-center text-base font-black text-violet-950 sm:text-lg lg:min-w-[280px]">
          <span className="text-xl" aria-hidden>
            👑
          </span>
          Admin Yönetim Merkezi
        </p>

        <button
          type="button"
          onClick={onLogout}
          className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100 lg:justify-self-end`}
        >
          <span className="text-xl" aria-hidden>
            🚪
          </span>
          Çıkış Yap
        </button>
      </div>
    </nav>
  );
}

type AdminCard = {
  title: string;
  desc: string;
  badge?: string;
  href?: string;
  Icon: LucideIcon;
  theme: {
    iconWrap: string;
    cardBg: string;
    border: string;
  };
};

const adminCards: AdminCard[] = [
  {
    title: "Kullanıcı / Üye Yönetimi",
    desc: "Üye hesapları, roller ve erişim kontrolü.",
    href: "/admin/users",
    Icon: Users,
    theme: {
      iconWrap: "from-indigo-500 to-blue-600",
      cardBg: "from-blue-100/90 via-sky-50/95 to-white",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Toplu Veri Aktarımı",
    desc: "JSON ve toplu veri içe aktarma merkezi.",
    badge: "Yakında",
    Icon: Upload,
    theme: {
      iconWrap: "from-violet-500 to-purple-600",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Doğaltaş JSON Import",
    desc: "Taş veritabanı toplu JSON aktarımı (yalnızca admin).",
    badge: "Yakında",
    Icon: FileJson,
    theme: {
      iconWrap: "from-cyan-500 to-teal-500",
      cardBg: "from-cyan-100/90 via-teal-50/95 to-white",
      border: "border-teal-200/70",
    },
  },
  {
    title: "Ürün & Stok Sistem Araçları",
    desc: "Merkezi stok, satış ve envanter yönetim araçları.",
    badge: "Yakında",
    Icon: Package,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-100/90 via-orange-50/95 to-white",
      border: "border-amber-200/70",
    },
  },
  {
    title: "Sistem Sağlığı",
    desc: "Bağlantı, performans ve servis durumu özeti.",
    badge: "Yakında",
    Icon: Activity,
    theme: {
      iconWrap: "from-emerald-500 to-green-600",
      cardBg: "from-emerald-100/90 via-green-50/95 to-white",
      border: "border-emerald-200/70",
    },
  },
  {
    title: "Kullanım Takibi",
    desc: "Modül kullanımı ve oturum istatistikleri.",
    badge: "Yakında",
    Icon: Database,
    theme: {
      iconWrap: "from-fuchsia-500 to-pink-600",
      cardBg: "from-fuchsia-100/90 via-pink-50/95 to-white",
      border: "border-fuchsia-200/70",
    },
  },
  {
    title: "Yedekleme Merkezi",
    desc: "Veri yedekleme ve geri yükleme işlemleri.",
    badge: "Yakında",
    Icon: CloudUpload,
    theme: {
      iconWrap: "from-sky-500 to-cyan-600",
      cardBg: "from-sky-100/90 via-cyan-50/95 to-white",
      border: "border-sky-200/70",
    },
  },
  {
    title: "Hata Kayıtları",
    desc: "Sistem hataları ve kritik olay günlükleri.",
    badge: "Yakında",
    Icon: AlertTriangle,
    theme: {
      iconWrap: "from-rose-500 to-red-600",
      cardBg: "from-rose-100/90 via-red-50/95 to-white",
      border: "border-rose-200/70",
    },
  },
  {
    title: "Genel Ayarlar",
    desc: "Platform geneli yapılandırma ve tercihler.",
    badge: "Yakında",
    Icon: Settings,
    theme: {
      iconWrap: "from-slate-600 to-slate-800",
      cardBg: "from-slate-100/90 via-slate-50/95 to-white",
      border: "border-slate-200/70",
    },
  },
];

function AdminToolCard({ item }: { item: AdminCard }) {
  const { Icon, theme } = item;
  const isReady = Boolean(item.href);

  const card = (
    <div
        className={`group relative flex min-h-[168px] flex-col rounded-[28px] border bg-gradient-to-br p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] transition-all duration-300 ${theme.cardBg} ${theme.border} ${
          isReady ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl" : "cursor-default"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.iconWrap}`}
          >
            <Icon className="h-7 w-7" strokeWidth={2.25} />
          </div>
          {item.badge ? (
            <span className="rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
              {item.badge}
            </span>
          ) : null}
        </div>
        <h3 className="mt-4 text-xl font-black text-slate-900">{item.title}</h3>
        <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-700">{item.desc}</p>
      </div>
  );

  if (isReady) {
    return (
      <Link href={item.href!} className="block no-underline">
        {card}
      </Link>
    );
  }

  return card;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<YasamUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setUser(readYasamUser());
    setChecked(true);
  }, []);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  const allowed = isAdminUser(user);

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)] text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12 text-slate-900">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-rose-200/30 blur-[120px]" />
        <div className="relative mx-auto max-w-lg rounded-[32px] border border-rose-200/80 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-3 text-base font-medium text-slate-600">
            Bu sayfaya erişim yetkiniz yok.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 text-sm font-black text-slate-800 no-underline transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[480px] w-[480px] rounded-full bg-rose-200/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-cyan-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-14">
        <AdminTopNav onLogout={handleLogout} />

        <header className="relative mb-10 overflow-hidden rounded-[32px] border border-white/50 bg-gradient-to-r from-slate-900 via-violet-900 to-rose-800 px-8 py-10 text-white shadow-[0_28px_80px_rgba(88,28,135,0.25)] sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(251,207,232,0.15),transparent_50%)]" />
          <div className="relative flex flex-wrap items-start gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Shield className="h-8 w-8 text-rose-100" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/90">
                Sistem Sahibi
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.6rem]">
                Admin Yönetim Merkezi
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium text-white/85 sm:text-lg">
                Sistem sahibi araçları, toplu veri aktarımı, kullanıcı ve sistem yönetimi
              </p>
              {user?.name || user?.email ? (
                <p className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-bold text-white/90">
                  {user.name || user.email}
                  <span className="mx-2 text-white/40">·</span>
                  <span className="text-rose-200">admin</span>
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <section>
          <h2 className="text-lg font-black text-slate-900 lg:text-xl">Yönetim araçları</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bu alan yalnızca admin rolü ile görünür. Uzman panelinde listelenmez.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {adminCards.map((item) => (
              <AdminToolCard key={item.title} item={item} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
