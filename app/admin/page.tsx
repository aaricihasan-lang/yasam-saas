"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  Database,
  FileJson,
  Home,
  LogOut,
  Package,
  Settings,
  Shield,
  ShieldCheck,
  Upload,
  Users,
  AlertTriangle,
  CloudUpload,
  RefreshCw,
} from "lucide-react";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  type YasamUser,
} from "@/lib/auth/yasamUser";

const navBtn =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-5 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[56px] sm:w-auto sm:px-7 sm:text-base";

/** Veri Paylaşımı — admin kütüphane aktarım merkezi (sabit route) */
const VERI_PAYLASIMI_HREF = "/admin/veri-paylasimi";

function AdminTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
      aria-label="Admin üst navigasyon"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4">
        <Link
          href="/"
          className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline lg:justify-self-start`}
        >
          <Home className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          Ana Panele Dön
        </Link>

        <p className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-violet-200/60 bg-white/60 px-4 py-2 text-center text-base font-black text-violet-950 sm:text-lg lg:min-w-[280px]">
          <Shield className="h-5 w-5 shrink-0 text-violet-500" strokeWidth={2} aria-hidden />
          Admin Yönetim Merkezi
        </p>

        <button
          type="button"
          onClick={onLogout}
          className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100 lg:justify-self-end`}
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
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
      iconWrap: "from-blue-600 to-blue-700",
      cardBg: "from-blue-50/90 via-white to-slate-50/80",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Tenant Güvenlik Kontrolü",
    desc: "Modül tablolarında tenant_id ayrımı ve kayıt özeti.",
    href: "/admin/tenant-kontrol",
    Icon: ShieldCheck,
    theme: {
      iconWrap: "from-emerald-600 to-emerald-700",
      cardBg: "from-emerald-50/90 via-white to-slate-50/80",
      border: "border-emerald-200/70",
    },
  },
  {
    title: "Toplu Veri Aktarımı",
    desc: "JSON ve toplu veri içe aktarma merkezi.",
    href: "/admin/toplu-veri",
    Icon: Upload,
    theme: {
      iconWrap: "from-violet-600 to-violet-700",
      cardBg: "from-violet-50/90 via-white to-slate-50/80",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Veri Paylaşımı",
    desc: "Kütüphane verilerini seçili üyeye aktar.",
    href: VERI_PAYLASIMI_HREF,
    Icon: RefreshCw,
    theme: {
      iconWrap: "from-violet-500 to-blue-600",
      cardBg: "from-violet-50/90 via-white to-blue-50/70",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Doğaltaş JSON Import",
    desc: "Taş veritabanı toplu JSON aktarımı (yalnızca admin).",
    href: "/admin/dogaltas-import",
    Icon: FileJson,
    theme: {
      iconWrap: "from-blue-500 to-blue-700",
      cardBg: "from-blue-50/90 via-white to-slate-50/80",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Ürün & Stok Sistem Araçları",
    desc: "Merkezi stok, satış ve envanter yönetim araçları.",
    href: "/admin/stok-merkezi",
    Icon: Package,
    theme: {
      iconWrap: "from-slate-600 to-slate-700",
      cardBg: "from-slate-50/90 via-white to-slate-100/70",
      border: "border-slate-200/70",
    },
  },
  {
    title: "Sistem Sağlığı",
    desc: "Bağlantı, performans ve servis durumu özeti.",
    href: "/admin/sistem-sagligi",
    Icon: Activity,
    theme: {
      iconWrap: "from-emerald-500 to-emerald-700",
      cardBg: "from-emerald-50/90 via-white to-slate-50/80",
      border: "border-emerald-200/70",
    },
  },
  {
    title: "Kullanım Takibi",
    desc: "Modül kullanımı ve oturum istatistikleri.",
    href: "/admin/kullanim-takibi",
    Icon: Database,
    theme: {
      iconWrap: "from-violet-600 to-violet-800",
      cardBg: "from-violet-50/90 via-white to-slate-50/80",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Yedekleme Merkezi",
    desc: "Veri yedekleme ve geri yükleme işlemleri.",
    href: "/admin/yedekleme",
    Icon: CloudUpload,
    theme: {
      iconWrap: "from-blue-500 to-blue-600",
      cardBg: "from-blue-50/90 via-white to-slate-50/80",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Hata Kayıtları",
    desc: "Sistem hataları ve kritik olay günlükleri.",
    href: "/admin/hata-kayitlari",
    Icon: AlertTriangle,
    theme: {
      iconWrap: "from-slate-500 to-slate-700",
      cardBg: "from-slate-50/90 via-white to-slate-100/70",
      border: "border-slate-200/70",
    },
  },
  {
    title: "Genel Ayarlar",
    desc: "Platform geneli yapılandırma ve tercihler.",
    badge: "Yakında",
    Icon: Settings,
    theme: {
      iconWrap: "from-slate-600 to-slate-800",
      cardBg: "from-slate-50/90 via-white to-slate-100/70",
      border: "border-slate-200/70",
    },
  },
];

type AdminToolCardProps = {
  title: string;
  description: string;
  href: string;
  badge?: string;
  Icon: LucideIcon;
  theme: AdminCard["theme"];
};

function AdminToolCard({
  title,
  description,
  href,
  badge,
  Icon,
  theme,
}: AdminToolCardProps) {
  return (
    <Link
      href={href}
      aria-label={`${title} — ${description}`}
      className={`relative z-40 flex h-full min-h-[168px] w-full cursor-pointer flex-col rounded-[28px] border bg-gradient-to-br p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] no-underline transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 ${theme.cardBg} ${theme.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.iconWrap}`}
        >
          <Icon className="h-7 w-7" strokeWidth={2.25} aria-hidden />
        </div>
        {badge ? (
          <span className="pointer-events-none rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-4 text-xl font-black text-slate-900">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-700">{description}</p>
    </Link>
  );
}


function AdminToolCardInactive({ item }: { item: AdminCard }) {
  const { Icon, theme } = item;
  return (
    <div
      className={`relative z-10 flex h-full min-h-[168px] cursor-default flex-col rounded-[28px] border bg-gradient-to-br p-6 opacity-95 shadow-[0_20px_50px_rgba(15,23,42,0.08)] ${theme.cardBg} ${theme.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.iconWrap}`}
        >
          <Icon className="h-7 w-7" strokeWidth={2.25} aria-hidden />
        </div>
        {item.badge ? (
          <span className="pointer-events-none rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
            {item.badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-4 text-xl font-black text-slate-900">{item.title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-700">{item.desc}</p>
    </div>
  );
}

export default function AdminPage() {
  useBfcacheRefresh();
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

        <header className="relative z-10 mb-8 overflow-hidden rounded-[28px] border border-white/50 bg-gradient-to-r from-slate-900 via-violet-900 to-slate-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.20)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Shield className="h-6 w-6 text-white/90" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">
                  Admin Yönetim Merkezi
                </h1>
                {user?.name || user?.email ? (
                  <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
                    {user.name || user.email}
                    <span className="mx-1.5 text-white/40">·</span>
                    <span className="text-violet-300">admin</span>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-white/70">
                Sistem sahibi araçları, toplu veri aktarımı, kullanıcı ve sistem yönetimi
              </p>
            </div>
          </div>
        </header>

        <section className="relative z-20">
          <h2 className="text-lg font-black text-slate-900 lg:text-xl">Yönetim araçları</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bu alan yalnızca admin rolü ile görünür. Uzman panelinde listelenmez.
          </p>

          <div className="relative z-30 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {adminCards.map((item) => {
              const href = item.href?.trim();

              if (href) {
                return (
                  <div key={`${item.title}-${href}`} className="h-full">
                    <AdminToolCard
                      title={item.title}
                      description={item.desc}
                      href={href}
                      badge={item.badge}
                      Icon={item.Icon}
                      theme={item.theme}
                    />
                  </div>
                );
              }

              return <AdminToolCardInactive key={item.title} item={item} />;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
