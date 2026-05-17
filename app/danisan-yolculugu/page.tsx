import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Clock3,
  ContactRound,
  PieChart,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react";

const PLACEHOLDER = "—";

const summaryStatCards: {
  label: string;
  value: string;
  Icon: LucideIcon;
  cardBg: string;
  border: string;
  iconBox: string;
}[] = [
  {
    label: "Toplam Danışan",
    value: PLACEHOLDER,
    Icon: UsersRound,
    cardBg: "bg-gradient-to-br from-violet-50 to-indigo-50",
    border: "border-violet-200/70",
    iconBox: "bg-violet-500 text-white",
  },
  {
    label: "Son Kayıt",
    value: PLACEHOLDER,
    Icon: CalendarDays,
    cardBg: "bg-gradient-to-br from-sky-50 to-blue-50",
    border: "border-sky-200/70",
    iconBox: "bg-sky-500 text-white",
  },
  {
    label: "Bu Ay Yeni Danışan",
    value: PLACEHOLDER,
    Icon: Clock3,
    cardBg: "bg-gradient-to-br from-teal-50 to-emerald-50",
    border: "border-teal-200/70",
    iconBox: "bg-teal-500 text-white",
  },
  {
    label: "Son 3 Ay Ortalaması",
    value: PLACEHOLDER,
    Icon: ChartColumn,
    cardBg: "bg-gradient-to-br from-amber-50 to-orange-50",
    border: "border-amber-200/70",
    iconBox: "bg-orange-500 text-white",
  },
  {
    label: "Bu Ay Randevu",
    value: PLACEHOLDER,
    Icon: Activity,
    cardBg: "bg-gradient-to-br from-pink-50 to-rose-50",
    border: "border-pink-200/70",
    iconBox: "bg-pink-500 text-white",
  },
  {
    label: "En Yakın Randevu",
    value: PLACEHOLDER,
    Icon: CalendarClock,
    cardBg: "bg-gradient-to-br from-cyan-50 to-sky-50",
    border: "border-cyan-200/70",
    iconBox: "bg-cyan-500 text-white",
  },
  {
    label: "Bu Hafta",
    value: PLACEHOLDER,
    Icon: CalendarRange,
    cardBg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    border: "border-yellow-200/70",
    iconBox: "bg-yellow-500 text-white",
  },
  {
    label: "Bu Ay",
    value: PLACEHOLDER,
    Icon: CalendarCheck,
    cardBg: "bg-gradient-to-br from-rose-50 to-pink-50",
    border: "border-rose-200/70",
    iconBox: "bg-rose-500 text-white",
  },
  {
    label: "Bu Yıl Toplam",
    value: PLACEHOLDER,
    Icon: PieChart,
    cardBg: "bg-gradient-to-br from-purple-50 to-violet-50",
    border: "border-purple-200/70",
    iconBox: "bg-purple-500 text-white",
  },
  {
    label: "Bu Yıl Danışan",
    value: PLACEHOLDER,
    Icon: TrendingUp,
    cardBg: "bg-gradient-to-br from-green-50 to-emerald-50",
    border: "border-green-200/70",
    iconBox: "bg-green-500 text-white",
  },
];

const journeyFolders: {
  title: string;
  desc: string;
  href: string;
  badge: string;
  cardGradient: string;
  border: string;
  iconBox: string;
  decorColor: string;
  Icon: LucideIcon;
  DecorIcon: LucideIcon;
}[] = [
  {
    title: "Danışanlar",
    desc: "Danışan kayıtları, detaylar ve analiz işlemleri.",
    href: "/dashboard/clients",
    badge: "Kayıt & Detay",
    cardGradient: "bg-gradient-to-br from-violet-50 via-white to-indigo-50",
    border: "border-violet-200/70",
    iconBox: "bg-gradient-to-br from-violet-500 to-indigo-500 text-white",
    decorColor: "text-violet-500",
    Icon: UsersRound,
    DecorIcon: ContactRound,
  },
  {
    title: "Danışan Takip & Ajanda",
    desc: "Randevular, seans planlama ve günlük takip.",
    href: "/dashboard/ajanda",
    badge: "Takip & Plan",
    cardGradient: "bg-gradient-to-br from-cyan-50 via-white to-teal-50",
    border: "border-cyan-200/70",
    iconBox: "bg-gradient-to-br from-cyan-500 to-teal-500 text-white",
    decorColor: "text-teal-500",
    Icon: CalendarDays,
    DecorIcon: CalendarRange,
  },
];

const hoverLift =
  "transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03]";

function StatWaveDecor() {
  return (
    <svg
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-7 w-full opacity-[0.18]"
      viewBox="0 0 200 28"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden
    >
      <path
        d="M0 18 C 40 8, 80 24, 120 14 C 160 6, 180 12, 200 10 L 200 28 L 0 28 Z"
        fill="currentColor"
        className="text-slate-400"
      />
    </svg>
  );
}

function SummaryStatCard({
  label,
  value,
  Icon,
  cardBg,
  border,
  iconBox,
}: (typeof summaryStatCards)[number]) {
  return (
    <div
      className={`relative flex min-h-[118px] flex-col overflow-hidden rounded-[24px] border p-5 shadow-[0_15px_40px_rgba(15,23,42,0.08)] duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_25px_60px_rgba(79,70,229,0.16)] ${border} ${cardBg}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md ${iconBox}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
      </div>
      <p className="mt-4 text-3xl font-black tabular-nums leading-none text-slate-900">
        {value}
      </p>
      <p className="relative z-10 mt-2 text-xs text-slate-500">{label}</p>
      <StatWaveDecor />
    </div>
  );
}

export default function DanisanYolculuguPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f7f2ff_45%,#fff3fb_100%)] px-6 py-8 text-slate-900 antialiased lg:px-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.12),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.09),transparent_30%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-[240px] bottom-[-200px] h-[780px] w-[780px] rounded-full bg-blue-400/18 blur-[190px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-[220px] top-[-140px] h-[680px] w-[680px] rounded-full bg-pink-300/14 blur-[190px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[36%] top-[22%] h-[560px] w-[560px] rounded-full bg-violet-300/12 blur-[175px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-10 top-24 h-24 w-24 rounded-full bg-white/35 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-28 top-40 h-14 w-14 rounded-full bg-white/30 backdrop-blur-sm"
        aria-hidden
      />

      <svg
        className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.08]"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M0 72 C 280 28, 520 88, 760 48 C 1020 8, 1240 68, 1440 42 L 1440 100 L 0 100 Z"
          fill="url(#journey-bottom-glow)"
        />
        <defs>
          <linearGradient id="journey-bottom-glow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(99,102,241,0)" />
            <stop offset="45%" stopColor="rgba(129,140,248,0.35)" />
            <stop offset="100%" stopColor="rgba(217,70,239,0)" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 mx-auto max-w-[1680px]">
        <Link
          href="/"
          className={`inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-5 py-3 text-base font-bold text-slate-800 shadow-md hover:bg-white/90 hover:shadow-lg ${hoverLift}`}
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(420px,480px)] lg:items-start">
          <div className="min-w-0 space-y-8">
            <header
              className={`relative overflow-hidden rounded-[40px] border border-white/80 bg-white/70 px-8 py-10 shadow-[0_30px_90px_rgba(99,102,241,0.10)] backdrop-blur-xl sm:px-10 sm:py-12 ${hoverLift}`}
            >
              <CalendarCheck
                className="pointer-events-none absolute right-6 top-1/2 h-44 w-44 -translate-y-1/2 text-indigo-400 opacity-10"
                strokeWidth={1.25}
                aria-hidden
              />
              <div className="relative z-10 max-w-3xl">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/85">
                  Yaşam Sistemi
                </p>
                <h1 className="mt-3 text-6xl font-black tracking-tight text-slate-900">
                  Danışan Yolculuğu
                </h1>
                <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600 lg:text-xl">
                  Danışan sürecinizi iki ana klasörde yönetin: kayıtlar ve detaylar ile
                  randevu ve günlük takip.
                </p>
              </div>
            </header>

            <section>
              <h2 className="text-2xl font-black text-slate-900">Hızlı İşlemler</h2>
              <p className="mt-2 text-base text-slate-600">
                Danışan yönetimi için ana klasörlere hızlıca erişin.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
                {journeyFolders.map((folder) => {
                  const { Icon, DecorIcon } = folder;
                  return (
                    <Link
                      key={folder.title}
                      href={folder.href}
                      className={`group relative flex min-h-[320px] flex-col overflow-hidden rounded-[36px] border p-10 shadow-[0_25px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-[0_35px_90px_rgba(79,70,229,0.18)] ${folder.border} ${folder.cardGradient}`}
                    >
                      <DecorIcon
                        className={`pointer-events-none absolute -bottom-2 -right-2 h-44 w-44 ${folder.decorColor} opacity-10`}
                        strokeWidth={1.25}
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg ${folder.iconBox}`}
                          >
                            <Icon className="h-8 w-8" strokeWidth={2} />
                          </div>
                          <span className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-bold text-slate-700">
                            {folder.badge}
                          </span>
                        </div>
                        <h3 className="mt-8 text-3xl font-black text-slate-900">
                          {folder.title}
                        </h3>
                        <p className="mt-4 flex-1 text-base leading-relaxed text-slate-600 lg:text-lg">
                          {folder.desc}
                        </p>
                        <span className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-6 py-3 text-sm font-black text-violet-800 shadow-md transition-all group-hover:scale-105">
                          Klasöre git
                          <span aria-hidden>→</span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-8">
            <div
              className={`rounded-[36px] border border-white/70 bg-white/70 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl ${hoverLift}`}
            >
              <h2 className="text-3xl font-black text-slate-900">Genel Özet</h2>
              <p className="mt-2 text-sm text-slate-600">
                Danışan ve randevu süreçlerinizin anonim genel görünümü.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                {summaryStatCards.map((stat) => (
                  <SummaryStatCard key={stat.label} {...stat} />
                ))}
              </div>

              <div
                className={`mt-8 rounded-3xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-md">
                    <ShieldCheck className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Gizlilik Önceliğimiz</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      Tüm verileriniz güvenli ve gizlidir. Kişisel bilgiler bu ekranda
                      gösterilmez.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
