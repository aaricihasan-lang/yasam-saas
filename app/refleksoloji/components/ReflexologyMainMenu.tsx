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
  wide: true,
};

function ReflexologyMainMenu() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute right-[-10%] top-[12%] h-[32rem] w-[32rem] rounded-full bg-fuchsia-200/25 blur-3xl" />
        <div className="absolute bottom-[-8%] left-[25%] h-80 w-80 rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <Link
          href="/"
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-2xl border border-violet-200/90 bg-white/85 px-5 py-3 text-sm font-black text-violet-900 shadow-[0_8px_28px_-10px_rgba(109,40,217,0.25)] ring-1 ring-violet-100/70 backdrop-blur-sm transition hover:border-violet-300 hover:bg-white hover:shadow-[0_12px_32px_-10px_rgba(109,40,217,0.3)] sm:mb-8"
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <section className="mx-auto w-full max-w-3xl flex-1 rounded-[36px] border border-white/80 bg-white/55 px-6 py-10 shadow-[0_32px_80px_-28px_rgba(91,33,182,0.28)] ring-1 ring-violet-100/60 backdrop-blur-xl sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <header className="text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.38em] text-violet-700/85">Yaşam Sistemi</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem]">
              Refleksoloji
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
              Ayak refleksoloji atlası, protokoller ve klinik çalışma alanı
            </p>
          </header>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 sm:gap-6">
            {PRIMARY_MODULES.map((card) => (
              <ReflexologyModuleCard key={card.href} {...card} />
            ))}
          </div>

          <div className="mt-5 sm:mt-6">
            <ReflexologyModuleCard {...NOTES_MODULE} />
          </div>
        </section>
      </div>
    </main>
  );
}

export { ReflexologyMainMenu };
export default ReflexologyMainMenu;
