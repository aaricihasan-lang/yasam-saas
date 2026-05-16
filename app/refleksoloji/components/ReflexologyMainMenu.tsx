import Link from "next/link";

type HubModule = {
  href: string;
  title: string;
  icon: string;
  lines: readonly string[];
  gradient: string;
  ring: string;
  hoverRing: string;
};

const MENU_MODULES: HubModule[] = [
  {
    href: "/refleksoloji/bolge-haritasi",
    title: "Bölge Haritası",
    icon: "🗺️",
    lines: [
      "Organ seç → bölge ekle → JSON'a kaydet.",
      "Kayıtlı atlası görüntüle ve düzenle.",
    ],
    gradient: "from-violet-400/35 via-indigo-300/30 to-sky-200/40",
    ring: "ring-violet-300/50",
    hoverRing: "group-hover:ring-violet-400/80",
  },
  {
    href: "/refleksoloji/kayitli-atlas",
    title: "Kayıtlı Atlas",
    icon: "🧠",
    lines: ["Kaydedilmiş organ bölgelerini listele, görüntüle ve düzenle."],
    gradient: "from-fuchsia-400/30 via-violet-300/28 to-pink-200/38",
    ring: "ring-fuchsia-300/45",
    hoverRing: "group-hover:ring-fuchsia-400/75",
  },
  {
    href: "/refleksoloji/protokol-haritasi",
    title: "Protokol Haritası",
    icon: "📋",
    lines: [
      "Hedef soruna göre protokol yaz.",
      "İlgili organları seç → haritada otomatik göster.",
    ],
    gradient: "from-amber-300/35 via-violet-300/25 to-orange-200/35",
    ring: "ring-amber-300/45",
    hoverRing: "group-hover:ring-amber-400/70",
  },
  {
    href: "/refleksoloji/kayitli-protokoller",
    title: "Kayıtlı Protokoller",
    icon: "📚",
    lines: ["Kayıtlı protokolleri listele ve görüntüle."],
    gradient: "from-emerald-300/32 via-cyan-200/28 to-teal-200/36",
    ring: "ring-emerald-300/45",
    hoverRing: "group-hover:ring-emerald-400/70",
  },
  {
    href: "/refleksoloji/notlar",
    title: "Notlar",
    icon: "📝",
    lines: ["Klinik seans notları ve ek bilgi alanı."],
    gradient: "from-rose-400/32 via-violet-300/26 to-pink-200/38",
    ring: "ring-rose-300/45",
    hoverRing: "group-hover:ring-rose-400/75",
  },
];

function ReflexologyHubCard({ module }: { module: HubModule }) {
  return (
    <Link
      href={module.href}
      className={`group relative flex h-[260px] max-h-[260px] flex-col items-center justify-between overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-5 text-center shadow-[0_14px_40px_-16px_rgba(91,33,182,0.28)] ring-1 backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/85 hover:shadow-[0_22px_50px_-14px_rgba(91,33,182,0.38)] active:translate-y-0 ${module.ring} ${module.hoverRing}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${module.gradient} opacity-95 transition-opacity duration-300 group-hover:opacity-100`}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/30 blur-2xl transition-all duration-300 group-hover:bg-white/40"
        aria-hidden
      />

      <span
        className="relative mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/90 bg-white/90 text-[1.65rem] shadow-[0_8px_24px_-10px_rgba(109,40,217,0.25)] ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-105 sm:h-[3.25rem] sm:w-[3.25rem] sm:text-[1.85rem]"
        aria-hidden
      >
        {module.icon}
      </span>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-1">
        <h2 className="text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
          {module.title}
        </h2>
        <div className="mt-2 w-full space-y-1">
          {module.lines.map((line) => (
            <p key={line} className="text-sm font-medium leading-snug text-slate-600/95 sm:text-[0.95rem]">
              {line}
            </p>
          ))}
        </div>
      </div>

      <span className="relative inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-white/90 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-violet-800 shadow-sm transition-all duration-300 group-hover:border-violet-300 group-hover:bg-white group-hover:text-violet-950 group-hover:shadow-md sm:text-[11px]">
        Modüle Git
        <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}

function ReflexologyMainMenu() {
  return (
    <main className="relative h-screen overflow-hidden text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 70% at 12% 8%, rgba(196,181,253,0.55), transparent 58%), radial-gradient(ellipse 70% 55% at 88% 12%, rgba(147,197,253,0.42), transparent 52%), radial-gradient(ellipse 75% 60% at 72% 92%, rgba(249,168,212,0.4), transparent 55%), radial-gradient(ellipse 50% 45% at 42% 55%, rgba(233,213,255,0.35), transparent 50%), linear-gradient(168deg, #f3ebff 0%, #ebe8ff 22%, #faf5ff 48%, #f0f4ff 78%, #fdf4ff 100%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-20 top-[6%] h-72 w-72 rounded-full bg-violet-400/25 blur-3xl" />
        <div className="absolute right-[-6%] top-[4%] h-80 w-80 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="absolute bottom-[-6%] left-[30%] h-64 w-64 rounded-full bg-fuchsia-300/22 blur-3xl" />
        <div className="absolute left-[48%] top-[38%] h-48 w-48 -translate-x-1/2 rounded-full bg-indigo-300/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1460px] flex-col px-4 py-2 sm:px-5 lg:px-6 lg:py-3">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <header className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-violet-700/90 sm:text-[11px]">
              Yaşam Sistemi
            </p>
            <h1 className="mt-0.5 bg-gradient-to-r from-violet-950 via-indigo-900 to-violet-800 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl lg:text-5xl">
              Refleksoloji
            </h1>
            <p className="mt-1.5 max-w-3xl text-base font-medium leading-snug text-slate-600/95 sm:text-lg">
              Ayak refleksoloji atlası, protokoller ve klinik çalışma alanı
            </p>
            <p className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-full border border-violet-200/70 bg-white/55 px-3 py-1.5 text-[10px] font-bold leading-snug text-violet-900/90 shadow-sm ring-1 ring-white/60 backdrop-blur-sm sm:text-[11px]">
              Ayak Refleksolojisi • Atlas • Protokol • Klinik Notlar
            </p>
          </header>

          <Link
            href="/"
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200/90 bg-white/80 px-3.5 py-2 text-xs font-black text-violet-900 shadow-md ring-1 ring-white/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:px-4 sm:text-sm"
          >
            <span aria-hidden>←</span>
            Ana Sayfaya Dön
          </Link>
        </div>

        <section
          className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white/40 shadow-[0_20px_56px_-22px_rgba(91,33,182,0.3)] ring-1 ring-white/50 backdrop-blur-xl lg:mt-2.5"
          style={{ height: "calc(100vh - 108px)" }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:overflow-hidden lg:p-5">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4 lg:overflow-hidden">
              {MENU_MODULES.map((module) => (
                <div key={module.href} className="min-h-0">
                  <ReflexologyHubCard module={module} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export { ReflexologyMainMenu };
export default ReflexologyMainMenu;
