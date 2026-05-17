import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CalendarRange,
  ContactRound,
  UsersRound,
} from "lucide-react";

const journeyFolders: {
  title: string;
  desc: string;
  href: string;
  badge: string;
  cardGradient: string;
  iconWrap: string;
  iconColor: string;
  Icon: LucideIcon;
  DecorIcon: LucideIcon;
}[] = [
  {
    title: "Danışanlar",
    desc: "Danışan kayıtları, detaylar ve analiz işlemleri.",
    href: "/dashboard/clients",
    badge: "Kayıt & Detay",
    cardGradient: "from-[#f8f4ff] to-[#eef2ff]",
    iconWrap: "bg-violet-100",
    iconColor: "text-violet-600",
    Icon: UsersRound,
    DecorIcon: ContactRound,
  },
  {
    title: "Danışan Takip & Ajanda",
    desc: "Randevular, seans planlama ve günlük takip.",
    href: "/dashboard/ajanda",
    badge: "Takip & Plan",
    cardGradient: "from-[#eefcfb] to-[#f0f7ff]",
    iconWrap: "bg-cyan-100",
    iconColor: "text-cyan-600",
    Icon: CalendarDays,
    DecorIcon: CalendarRange,
  },
];

export default function DanisanYolculuguPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#eef5ff_0%,#f7f4ff_50%,#fff7fb_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-[220px] bottom-[-180px] h-[720px] w-[720px] rounded-full bg-blue-300/12 blur-[170px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-[200px] top-[-120px] h-[620px] w-[620px] rounded-full bg-pink-200/10 blur-[170px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[38%] top-[28%] h-[520px] w-[520px] rounded-full bg-violet-200/8 blur-[160px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-[96vw] max-w-none px-4 py-6 md:px-6 xl:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/60 px-4 py-2.5 text-base font-bold text-slate-800 shadow-sm backdrop-blur-md transition hover:border-violet-200/80 hover:bg-white/80"
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <header className="relative mt-6 overflow-hidden rounded-[36px] border border-white/70 bg-white/55 p-6 shadow-[0_20px_70px_rgba(99,102,241,0.08)] backdrop-blur-xl md:p-8">
          <CalendarDays
            className="pointer-events-none absolute -right-4 top-1/2 h-[min(300px,42vw)] w-[min(300px,42vw)] -translate-y-1/2 text-indigo-400 opacity-[0.06]"
            strokeWidth={1.25}
            aria-hidden
          />
          <div className="relative z-10">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-700/80">
              Yaşam Sistemi
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Danışan Yolculuğu
            </h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-600">
              Danışan sürecinizi iki ana klasörde yönetin: kayıtlar ve detaylar ile randevu
              ve günlük takip.
            </p>
          </div>
        </header>

        <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
          {journeyFolders.map((folder) => {
            const { Icon, DecorIcon } = folder;
            return (
              <Link
                key={folder.title}
                href={folder.href}
                className={`group relative flex min-h-[280px] flex-col overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br ${folder.cardGradient} p-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-[0_30px_80px_rgba(79,70,229,0.15)]`}
              >
                <DecorIcon
                  className={`pointer-events-none absolute -bottom-4 -right-2 h-36 w-36 ${folder.iconColor} opacity-[0.05]`}
                  strokeWidth={1.25}
                  aria-hidden
                />
                <div className="relative z-10 flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${folder.iconWrap}`}
                    >
                      <Icon className={`h-7 w-7 ${folder.iconColor}`} strokeWidth={2} />
                    </div>
                    <span className="rounded-full border border-white/60 bg-white/50 px-3 py-1 text-xs font-bold text-slate-700 backdrop-blur-sm">
                      {folder.badge}
                    </span>
                  </div>
                  <h2 className="mt-6 text-2xl font-bold text-slate-900">{folder.title}</h2>
                  <p className="mt-3 flex-1 text-base leading-relaxed text-slate-600">
                    {folder.desc}
                  </p>
                  <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/70 px-5 py-3 text-sm font-bold text-violet-700 shadow-sm transition duration-300 group-hover:scale-105">
                    Klasöre git
                    <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
