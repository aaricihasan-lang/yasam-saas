"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Database,
  FileJson,
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
import { supabase } from "@/lib/supabase";

const navBtn =
  "inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border-2 px-4 sm:px-5 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

/** Veri Paylaşımı — admin kütüphane aktarım merkezi (sabit route) */
const VERI_PAYLASIMI_HREF = "/admin/veri-paylasimi";

function AdminTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-6 rounded-2xl border border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-2 shadow-md backdrop-blur-xl sm:p-3"
      aria-label="Admin üst navigasyon"
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-3">
        <p className="flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border border-violet-200/60 bg-white/60 px-4 py-2 text-center text-sm font-bold text-violet-950 lg:min-w-[240px]">
          <Shield className="h-4 w-4 shrink-0 text-violet-500" strokeWidth={2} aria-hidden />
          Admin Yönetim Merkezi
        </p>

        <button
          type="button"
          onClick={onLogout}
          className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100 lg:justify-self-end`}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
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
      className={`relative z-40 flex h-full min-h-[140px] w-full cursor-pointer flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-md no-underline transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 ${theme.cardBg} ${theme.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${theme.iconWrap}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </div>
        {badge ? (
          <span className="pointer-events-none rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{description}</p>
    </Link>
  );
}


type AdminMetrics = {
  total: number | null;
  active: number | null;
  pending: number | null;
  systemOk: boolean;
};

const statTones = {
  slate:   { card: "bg-white/70 border-slate-200/70",       num: "text-slate-900",   lbl: "text-slate-500"   },
  emerald: { card: "bg-emerald-50/80 border-emerald-200/60", num: "text-emerald-800", lbl: "text-emerald-600" },
  amber:   { card: "bg-amber-50/80 border-amber-200/60",     num: "text-amber-800",   lbl: "text-amber-600"   },
  rose:    { card: "bg-rose-50/80 border-rose-200/60",       num: "text-rose-800",    lbl: "text-rose-600"    },
} as const;

function StatCell({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: keyof typeof statTones;
}) {
  const t = statTones[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${t.card}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${t.lbl}`}>{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${t.num}`}>{value}</p>
    </div>
  );
}

function AdminStatBar({
  metrics,
  loading,
}: {
  metrics: AdminMetrics | null;
  loading: boolean;
}) {
  const fmt = (v: number | null | undefined) =>
    loading ? "…" : v != null ? String(v) : "—";

  const pendingTone: keyof typeof statTones =
    !loading && metrics?.pending != null && metrics.pending > 0 ? "amber" : "slate";
  const sysTone: keyof typeof statTones =
    metrics === null ? "slate" : metrics.systemOk ? "emerald" : "rose";
  const sysVal = loading
    ? "…"
    : metrics === null
      ? "—"
      : metrics.systemOk
        ? "Aktif"
        : "Kontrol";

  return (
    <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCell label="Toplam Üye"    value={fmt(metrics?.total)}   tone="slate"       />
      <StatCell label="Aktif"         value={fmt(metrics?.active)}  tone="emerald"     />
      <StatCell label="Onay Bekleyen" value={fmt(metrics?.pending)} tone={pendingTone} />
      <StatCell label="Sistem Durumu" value={sysVal}                tone={sysTone}     />
    </div>
  );
}

function AdminToolCardInactive({ item }: { item: AdminCard }) {
  const { Icon, theme } = item;
  return (
    <div
      className={`relative z-10 flex h-full min-h-[140px] cursor-not-allowed flex-col rounded-2xl border bg-gradient-to-br p-5 opacity-40 shadow-sm ${theme.cardBg} ${theme.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${theme.iconWrap}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </div>
        {item.badge ? (
          <span className="pointer-events-none rounded-full border border-white/80 bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
            {item.badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-bold text-slate-900">{item.title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
    </div>
  );
}

export default function AdminPage() {
  useBfcacheRefresh();
  const router = useRouter();
  const [user, setUser] = useState<YasamUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const [totalRes, activeRes, pendingRes] = await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("active", true)
          .eq("approval_status", "approved"),
        supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("approval_status", "pending"),
      ]);
      setAdminMetrics({
        total: totalRes.error ? null : (totalRes.count ?? 0),
        active: activeRes.error ? null : (activeRes.count ?? 0),
        pending: pendingRes.error ? null : (pendingRes.count ?? 0),
        systemOk: !totalRes.error,
      });
    } catch {
      setAdminMetrics({ total: null, active: null, pending: null, systemOk: false });
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    setUser(readYasamUser());
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && isAdminUser(user)) {
      void fetchMetrics();
    }
  }, [checked, user, fetchMetrics]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  const allowed = isAdminUser(user);

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] px-6 py-10 text-slate-900">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-rose-200/30 blur-[120px]" />
        <div className="relative mx-auto max-w-lg rounded-2xl border border-rose-200/80 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-3 text-base font-medium text-slate-600">
            Bu sayfaya erişim yetkiniz yok.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[480px] w-[480px] rounded-full bg-rose-200/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-cyan-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <AdminTopNav onLogout={handleLogout} />

        <header className="relative z-10 mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-violet-900 to-slate-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Shield className="h-6 w-6 text-white/90" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
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

        <AdminStatBar metrics={adminMetrics} loading={metricsLoading} />

        <section className="relative z-20">
          <h2 className="text-base font-bold text-slate-900 lg:text-lg">Yönetim araçları</h2>
          <p className="mt-1 text-xs text-slate-500">
            Bu alan yalnızca admin rolü ile görünür. Uzman panelinde listelenmez.
          </p>

          <div className="relative z-30 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
