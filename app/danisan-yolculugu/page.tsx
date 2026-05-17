import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ContactRound,
  Shield,
  UsersRound,
} from "lucide-react";

const PLACEHOLDER = "—";

const clientSummaryStats = [
  { label: "Toplam Danışan", value: PLACEHOLDER },
  { label: "Son Kayıt Tarihi", value: PLACEHOLDER },
  { label: "Bu Ay Yeni Danışan", value: PLACEHOLDER },
  { label: "Son 3 Ay Ortalaması", value: PLACEHOLDER },
  { label: "Bu Yıl Toplam", value: PLACEHOLDER },
] as const;

const appointmentSummaryStats = [
  { label: "Bu Ay Randevu", value: PLACEHOLDER },
  { label: "En Yakın Randevu Tarihi", value: PLACEHOLDER },
  { label: "Bu Hafta", value: PLACEHOLDER },
  { label: "Bu Ay", value: PLACEHOLDER },
  { label: "Bu Yıl Toplam", value: PLACEHOLDER },
] as const;

const journeyFolders: {
  title: string;
  desc: string;
  href: string;
  badge: string;
  cardGradient: string;
  iconWrap: string;
  iconColor: string;
  decorColor: string;
  Icon: LucideIcon;
  DecorIcon: LucideIcon;
}[] = [
  {
    title: "Danışanlar",
    desc: "Danışan kayıtları, detaylar ve analiz işlemleri.",
    href: "/dashboard/clients",
    badge: "Kayıt & Detay",
    cardGradient:
      "bg-gradient-to-br from-violet-50/90 via-white/70 to-indigo-50/90",
    iconWrap: "bg-violet-100",
    iconColor: "text-violet-600",
    decorColor: "text-violet-500",
    Icon: UsersRound,
    DecorIcon: ContactRound,
  },
  {
    title: "Danışan Takip & Ajanda",
    desc: "Randevular, seans planlama ve günlük takip.",
    href: "/dashboard/ajanda",
    badge: "Takip & Plan",
    cardGradient: "bg-gradient-to-br from-cyan-50/90 via-white/70 to-teal-50/90",
    iconWrap: "bg-cyan-100",
    iconColor: "text-teal-600",
    decorColor: "text-teal-500",
    Icon: CalendarDays,
    DecorIcon: CalendarRange,
  },
];

function StatBlock({
  title,
  items,
}: {
  title: string;
  items: readonly { label: string; value: string }[];
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h3>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/50 px-4 py-3.5"
          >
            <span className="text-sm font-semibold text-slate-600">{item.label}</span>
            <span className="shrink-0 text-sm font-black tabular-nums text-slate-900">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DanisanYolculuguPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#eef5ff_0%,#f7f4ff_48%,#fff4fb_100%)] px-6 py-8 text-slate-900 antialiased lg:px-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(244,114,182,0.10),transparent_30%),radial-gradient(circle_at_72%_88%,rgba(56,189,248,0.10),transparent_34%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-[240px] bottom-[-200px] h-[780px] w-[780px] rounded-full bg-blue-400/18 blur-[190px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-[220px] top-[-140px] h-[680px] w-[680px] rounded-full bg-fuchsia-300/14 blur-[190px]"
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
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M0 420 C 200 360, 400 480, 600 400 C 800 320, 1000 440, 1200 380 C 1320 340, 1380 360, 1440 350"
          stroke="rgb(99,102,241)"
          strokeWidth="1.5"
        />
        <path
          d="M0 620 C 280 560, 520 680, 760 600 C 980 530, 1180 650, 1440 580"
          stroke="rgb(217,70,239)"
          strokeWidth="1.25"
        />
      </svg>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(99,102,241,0.45) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />

      <svg
        className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.10]"
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
            <stop offset="45%" stopColor="rgba(129,140,248,0.4)" />
            <stop offset="100%" stopColor="rgba(217,70,239,0)" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 mx-auto max-w-[1680px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-5 py-3 text-base font-bold text-slate-800 shadow-md transition-all hover:-translate-y-1 hover:bg-white/90 hover:shadow-lg"
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="min-w-0 space-y-8">
            <header className="relative overflow-hidden rounded-[36px] border border-white/80 bg-white/55 px-8 py-10 shadow-[0_30px_90px_rgba(79,70,229,0.14)] ring-1 ring-white/60 backdrop-blur-xl sm:px-10 sm:py-12">
              <CalendarCheck
                className="pointer-events-none absolute right-6 top-1/2 h-44 w-44 -translate-y-1/2 text-indigo-400 opacity-10"
                strokeWidth={1.25}
                aria-hidden
              />
              <div className="relative z-10 max-w-3xl">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/85">
                  Yaşam Sistemi
                </p>
                <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-900 lg:text-6xl">
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
                      className={`group relative flex min-h-[300px] flex-col overflow-hidden rounded-[36px] border border-white/80 p-10 shadow-[0_28px_75px_rgba(15,23,42,0.10)] ring-1 ring-white/60 backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-[0_35px_95px_rgba(79,70,229,0.18)] ${folder.cardGradient}`}
                    >
                      <DecorIcon
                        className={`pointer-events-none absolute -bottom-2 -right-2 h-40 w-40 ${folder.decorColor} opacity-[0.05]`}
                        strokeWidth={1.25}
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${folder.iconWrap}`}
                          >
                            <Icon
                              className={`h-8 w-8 ${folder.iconColor}`}
                              strokeWidth={2}
                            />
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
            <div className="rounded-[36px] border border-white/80 bg-white/60 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.12)] ring-1 ring-white/60 backdrop-blur-xl">
              <h2 className="text-2xl font-black text-slate-900">Genel Özet</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Danışan ve randevu süreçlerinizin anonim genel durumu.
              </p>

              <div className="mt-8 space-y-8">
                <StatBlock title="Danışan Özeti" items={clientSummaryStats} />
                <StatBlock title="Randevu Özeti" items={appointmentSummaryStats} />
              </div>

              <div className="mt-8 rounded-2xl border border-violet-100/80 bg-gradient-to-br from-violet-50/80 to-indigo-50/60 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                    <Shield className="h-5 w-5 text-violet-600" strokeWidth={2} />
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
