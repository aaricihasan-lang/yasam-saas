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
  ListFilter,
  PieChart,
  ShieldCheck,
  TrendingUp,
  UserPlus,
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
    title: "Danışan Kayıt",
    desc: "Yeni danışan ekle, kişisel bilgileri ve görüşme tarihini kaydet.",
    href: "/danisan-yolculugu/kayit",
    badge: "Yeni Kayıt",
    cardGradient: "bg-gradient-to-br from-emerald-100 via-white to-teal-100",
    border: "border-emerald-300/70",
    iconBox: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
    decorColor: "text-emerald-500",
    Icon: UserPlus,
    DecorIcon: ContactRound,
  },
  {
    title: "Danışan Listesi",
    desc: "Kayıtlı danışanları görüntüle, ara, düzenle ve detaylara eriş.",
    href: "/danisan-yolculugu/liste",
    badge: "Liste & Detay",
    cardGradient: "bg-gradient-to-br from-violet-100 via-white to-indigo-100",
    border: "border-violet-300/70",
    iconBox: "bg-gradient-to-br from-violet-500 to-indigo-500 text-white",
    decorColor: "text-violet-500",
    Icon: UsersRound,
    DecorIcon: ListFilter,
  },
  {
    title: "Danışan Takip",
    desc: "Randevular, seans planlama, günlük takip ve danışan süreç yönetimi.",
    href: "/danisan-yolculugu/takip",
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
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.10),transparent_30%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-4 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -bottom-24 -left-24 h-[480px] w-[480px] rounded-full bg-blue-400/14 blur-[160px]" />
        <div className="absolute -right-24 -top-16 h-[420px] w-[420px] rounded-full bg-pink-300/12 blur-[150px]" />
        <div className="absolute bottom-1/3 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-violet-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr] lg:items-start">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-5">
            {/* Hero Header */}
            <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-6 py-5 shadow-lg sm:px-8">
              <CalendarCheck
                className="pointer-events-none absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-indigo-400 opacity-10"
                strokeWidth={1.25}
                aria-hidden
              />
              <div className="relative z-10">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700/85">
                  Yaşam Sistemi
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Danışan Yolculuğu
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-snug text-slate-600">
                  Danışan sürecinizi üç ana klasörde yönetin: yeni kayıt, danışan listesi ve takip &amp; ajanda.
                </p>
              </div>
            </header>

            {/* Quick Actions */}
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Hızlı İşlemler</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Danışan yönetimi için üç ana klasöre hızlıca erişin.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {journeyFolders.map((folder) => {
                  const { Icon, DecorIcon } = folder;
                  return (
                    <Link
                      key={folder.title}
                      href={folder.href}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${folder.border} ${folder.cardGradient}`}
                    >
                      <DecorIcon
                        className={`pointer-events-none absolute -bottom-3 -right-3 h-28 w-28 ${folder.decorColor} opacity-10`}
                        strokeWidth={1.25}
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md ${folder.iconBox}`}
                          >
                            <Icon className="h-5 w-5" strokeWidth={2} />
                          </div>
                          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                            {folder.badge}
                          </span>
                        </div>
                        <h3 className="mt-3.5 text-xl font-black text-slate-900">
                          {folder.title}
                        </h3>
                        <p className="mt-1.5 text-[13px] leading-snug text-slate-600">
                          {folder.desc}
                        </p>
                        <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-slate-900/80 px-4 py-2 text-xs font-bold text-white shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:bg-slate-900">
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
            <div className="rounded-2xl border border-white/80 bg-white/90 p-6 shadow-lg">
              <div>
                <h2 className="text-2xl font-black text-slate-950">Genel Özet</h2>
                <p className="mt-1 text-sm font-medium leading-snug text-slate-600">
                  Danışan ve randevu süreçlerinizin anonim genel görünümü.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {summaryStatCards.map((stat) => (
                  <SummaryStatCard key={stat.label} {...stat} />
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm">
                  <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">Gizlilik Önceliğimiz</p>
                  <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">
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
