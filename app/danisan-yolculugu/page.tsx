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
    cardBg: "bg-gradient-to-br from-violet-100 via-white to-indigo-100",
    border: "border-violet-300/70",
    iconBox: "bg-violet-500 text-white",
  },
  {
    label: "Son Kayıt",
    value: PLACEHOLDER,
    Icon: CalendarDays,
    cardBg: "bg-gradient-to-br from-sky-100 via-white to-blue-100",
    border: "border-sky-300/70",
    iconBox: "bg-sky-500 text-white",
  },
  {
    label: "Bu Ay Yeni",
    value: PLACEHOLDER,
    Icon: Clock3,
    cardBg: "bg-gradient-to-br from-teal-100 via-white to-emerald-100",
    border: "border-teal-300/70",
    iconBox: "bg-teal-500 text-white",
  },
  {
    label: "Son 3 Ay Ort.",
    value: PLACEHOLDER,
    Icon: ChartColumn,
    cardBg: "bg-gradient-to-br from-amber-100 via-white to-orange-100",
    border: "border-amber-300/70",
    iconBox: "bg-orange-500 text-white",
  },
  {
    label: "Bu Ay Randevu",
    value: PLACEHOLDER,
    Icon: Activity,
    cardBg: "bg-gradient-to-br from-pink-100 via-white to-rose-100",
    border: "border-pink-300/70",
    iconBox: "bg-pink-500 text-white",
  },
  {
    label: "En Yakın Randevu",
    value: PLACEHOLDER,
    Icon: CalendarClock,
    cardBg: "bg-gradient-to-br from-cyan-100 via-white to-sky-100",
    border: "border-cyan-300/70",
    iconBox: "bg-cyan-500 text-white",
  },
  {
    label: "Bu Hafta",
    value: PLACEHOLDER,
    Icon: CalendarRange,
    cardBg: "bg-gradient-to-br from-yellow-100 via-white to-amber-100",
    border: "border-yellow-300/70",
    iconBox: "bg-yellow-500 text-white",
  },
  {
    label: "Bu Ay",
    value: PLACEHOLDER,
    Icon: CalendarCheck,
    cardBg: "bg-gradient-to-br from-rose-100 via-white to-pink-100",
    border: "border-rose-300/70",
    iconBox: "bg-rose-500 text-white",
  },
  {
    label: "Bu Yıl Toplam",
    value: PLACEHOLDER,
    Icon: PieChart,
    cardBg: "bg-gradient-to-br from-purple-100 via-white to-violet-100",
    border: "border-purple-300/70",
    iconBox: "bg-purple-500 text-white",
  },
  {
    label: "Bu Yıl Danışan",
    value: PLACEHOLDER,
    Icon: TrendingUp,
    cardBg: "bg-gradient-to-br from-green-100 via-white to-emerald-100",
    border: "border-green-300/70",
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
    cardGradient: "bg-gradient-to-br from-violet-100 via-white to-indigo-100",
    border: "border-violet-300/70",
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
    cardGradient: "bg-gradient-to-br from-cyan-100 via-white to-teal-100",
    border: "border-cyan-300/70",
    iconBox: "bg-gradient-to-br from-cyan-500 to-teal-500 text-white",
    decorColor: "text-teal-500",
    Icon: CalendarDays,
    DecorIcon: CalendarRange,
  },
];

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
      className={`group relative z-0 flex flex-col justify-between gap-3 rounded-xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${border} ${cardBg}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all duration-200 group-hover:scale-105 ${iconBox}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </div>
      <div>
        <p className="text-2xl font-black tabular-nums leading-none tracking-tight text-slate-950">
          {value}
        </p>
        <p
          className="mt-1 truncate text-[10.5px] font-semibold leading-tight text-slate-600"
          title={label}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

export default function DanisanYolculuguPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f7f2ff_45%,#fff3fb_100%)] px-5 py-4 text-slate-900 antialiased sm:px-8 lg:px-10 xl:px-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.12),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.09),transparent_30%)]" />
        <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="absolute -right-24 -top-16 h-72 w-72 rounded-full bg-pink-300/12 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr] lg:items-start">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            {/* Hero Header */}
            <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-4 shadow-lg sm:px-6">
              <CalendarCheck
                className="pointer-events-none absolute right-4 top-1/2 h-20 w-20 -translate-y-1/2 text-indigo-400 opacity-10"
                strokeWidth={1.25}
                aria-hidden
              />
              <div className="relative z-10 max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700/85">
                  Yaşam Sistemi
                </p>
                <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Danışan Yolculuğu
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs font-medium leading-snug text-slate-600">
                  Danışan sürecinizi iki ana klasörde yönetin: kayıtlar ve detaylar ile
                  randevu ve günlük takip.
                </p>
              </div>
            </header>

            {/* Quick Actions */}
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Hızlı İşlemler</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Danışan yönetimi için ana klasörlere hızlıca erişin.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {journeyFolders.map((folder) => {
                  const { Icon, DecorIcon } = folder;
                  return (
                    <Link
                      key={folder.title}
                      href={folder.href}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${folder.border} ${folder.cardGradient}`}
                    >
                      <DecorIcon
                        className={`pointer-events-none absolute -bottom-2 -right-2 h-24 w-24 ${folder.decorColor} opacity-10`}
                        strokeWidth={1.25}
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-md ${folder.iconBox}`}
                          >
                            <Icon className="h-5 w-5" strokeWidth={2} />
                          </div>
                          <span className="rounded-full border border-white/80 bg-white/70 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                            {folder.badge}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-black text-slate-900 sm:text-xl">
                          {folder.title}
                        </h3>
                        <p className="mt-1 text-xs leading-snug text-slate-600">
                          {folder.desc}
                        </p>
                        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-slate-900/80 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:bg-slate-900">
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

          {/* RIGHT COLUMN */}
          <aside>
            <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg">
              <div>
                <h2 className="text-xl font-black text-slate-950">Genel Özet</h2>
                <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">
                  Danışan ve randevu süreçlerinizin anonim genel görünümü.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {summaryStatCards.map((stat) => (
                  <SummaryStatCard key={stat.label} {...stat} />
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm">
                  <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-950">Gizlilik Önceliğimiz</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-600">
                    Kişisel bilgiler bu ekranda gösterilmez.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
