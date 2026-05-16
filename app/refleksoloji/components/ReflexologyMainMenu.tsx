import Link from "next/link";
import { ReflexologyModuleCard, type ReflexologyModuleCardProps } from "./ReflexologyModuleCard";

const PRIMARY_MODULES: ReflexologyModuleCardProps[] = [
  {
    href: "/refleksoloji/bolge-haritasi",
    title: "Bölge Haritası",
    icon: "🗺️",
    lines: [
      "Organ seç → bölge ekle → JSON'a kaydet.",
      "Kayıtlı atlası görüntüle ve düzenle.",
    ],
    accent: "from-violet-200/70 via-fuchsia-50/50 to-white",
    ring: "ring-violet-200/60",
  },
  {
    href: "/refleksoloji/kayitli-atlas",
    title: "Kayıtlı Atlas",
    icon: "🧠",
    lines: ["Kaydedilmiş organ bölgelerini listele, görüntüle ve düzenle."],
    accent: "from-indigo-200/65 via-violet-50/55 to-white",
    ring: "ring-indigo-200/55",
  },
  {
    href: "/refleksoloji/protokol-haritasi",
    title: "Protokol Haritası",
    icon: "📋",
    lines: [
      "Hedef soruna göre protokol yaz.",
      "İlgili organları seç → haritada otomatik göster.",
    ],
    accent: "from-purple-200/65 via-violet-50/50 to-white",
    ring: "ring-purple-200/55",
  },
  {
    href: "/refleksoloji/kayitli-protokoller",
    title: "Kayıtlı Protokoller",
    icon: "📚",
    lines: ["Kayıtlı protokolleri listele ve görüntüle."],
    accent: "from-fuchsia-200/60 via-rose-50/45 to-white",
    ring: "ring-fuchsia-200/55",
  },
];

const NOTES_MODULE: ReflexologyModuleCardProps = {
  href: "/refleksoloji/notlar",
  title: "Notlar",
  icon: "📝",
  lines: ["Klinik seans notları ve ek bilgi alanı."],
  accent: "from-violet-300/45 via-violet-50/40 to-white",
  ring: "ring-violet-300/50",
};

const MENU_MODULES = [...PRIMARY_MODULES, NOTES_MODULE];

function gridCellClass(index: number): string {
  if (index < 3) return "lg:col-span-2";
  if (index === 3) return "lg:col-span-2 lg:col-start-2";
  return "lg:col-span-2 lg:col-start-4";
}

function ReflexologyMainMenu() {
  return (
    <main className="relative h-screen overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute right-[-10%] top-[12%] h-[32rem] w-[32rem] rounded-full bg-fuchsia-200/25 blur-3xl" />
        <div className="absolute bottom-[-8%] left-[25%] h-80 w-80 rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1180px] flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <header className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-700/85 sm:text-[11px]">
              Yaşam Sistemi
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
              Refleksoloji
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-snug text-slate-600 sm:text-base">
              Ayak refleksoloji atlası, protokoller ve klinik çalışma alanı
            </p>
          </header>

          <Link
            href="/"
            className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200/90 bg-white/85 px-3.5 py-2 text-xs font-black text-violet-900 shadow-md ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white sm:px-4 sm:text-sm"
          >
            <span aria-hidden>←</span>
            Ana Sayfaya Dön
          </Link>
        </div>

        <section
          className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/55 shadow-[0_24px_64px_-24px_rgba(91,33,182,0.26)] ring-1 ring-violet-100/60 backdrop-blur-xl sm:mt-4"
          style={{ height: "calc(100vh - 120px)" }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:overflow-hidden lg:p-6">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-3.5 lg:grid-cols-6 lg:grid-rows-2 lg:gap-4 lg:overflow-hidden">
              {MENU_MODULES.map((card, index) => (
                <div key={card.href} className={`min-h-0 ${gridCellClass(index)}`}>
                  <ReflexologyModuleCard {...card} compact />
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
