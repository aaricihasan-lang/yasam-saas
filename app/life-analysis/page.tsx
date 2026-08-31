import Link from "next/link";
import { ArrowRight, Brain, ChartColumn, Compass } from "lucide-react";

const subModules = [
  {
    title: "Numeroloji",
    desc: "Doğum tarihinden kişisel sayıları hesapla, çakra analizini görüntüle, PDF raporu oluştur.",
    href: "/numeroloji",
    Icon: ChartColumn,
    badge: "Aktif",
    badgeStyle: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
    iconGradient: "from-violet-500 to-indigo-600",
    cardGradient: "from-violet-100/90 via-indigo-50/95 to-white",
    border: "border-violet-200/70",
    comingSoon: false,
  },
  {
    title: "Human Design",
    desc: "Bilgi bankasına yüklediğiniz içeriklerle danışanlara kişiye özel Human Design raporları oluşturun.",
    href: "/human-design",
    Icon: Compass,
    badge: "Aktif",
    badgeStyle: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
    iconGradient: "from-purple-600 to-indigo-700",
    cardGradient: "from-purple-50/90 via-indigo-50/95 to-white",
    border: "border-purple-200/70",
    comingSoon: false,
  },
] as const;

export default function LifeAnalysisPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-violet-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-[15%] h-80 w-80 rounded-full bg-purple-300/12 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-16 lg:px-8 xl:px-10">
        {/* Başlık */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-md">
              <Brain className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                Yaşam Sistemi
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Yaşam Analiz Merkezi
              </h1>
            </div>
          </div>
          <p className="mt-2.5 max-w-lg text-sm font-medium text-slate-600 sm:text-base">
            Numeroloji ve Human Design analiz araçları
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-violet-200/80 via-purple-200/60 to-transparent" />
        </div>

        {/* Modül kartları */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
          {subModules.map((mod) => {
            const { Icon } = mod;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={`group flex flex-col rounded-[18px] border bg-gradient-to-br p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.cardGradient} ${mod.border} ${mod.comingSoon ? "opacity-80" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-all duration-200 group-hover:scale-105 ${mod.iconGradient}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${mod.badgeStyle}`}
                  >
                    {mod.badge}
                  </span>
                </div>

                <h2 className="mt-2 text-sm font-black text-slate-900 sm:text-base">
                  {mod.title}
                </h2>
                <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">
                  {mod.desc}
                </p>

                <div className="mt-3 flex items-center justify-end">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105 ${mod.comingSoon ? "opacity-40" : ""}`}
                    aria-hidden
                  >
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
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
