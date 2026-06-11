import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardList,
  FolderArchive,
  Layers,
  Video,
} from "lucide-react";

const subModules = [
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi. Tüm dosyalarınızı tek merkezde saklayın.",
    href: "/dashboard/kisisel-arsiv",
    Icon: FolderArchive,
    badge: "Arşiv",
    iconGradient: "from-orange-500 to-amber-500",
    cardGradient: "from-orange-100/90 via-amber-50/95 to-white",
    border: "border-orange-200/70",
  },
  {
    title: "Belge Çeviri Merkezi",
    desc: "PDF ve Word belgelerini dönüştür, çevir ve yönet. Yapay zekâ destekli belge işleme.",
    href: "/belge-ceviri",
    Icon: BookOpen,
    badge: "Belge",
    iconGradient: "from-sky-500 to-cyan-600",
    cardGradient: "from-sky-100/90 via-cyan-50/95 to-white",
    border: "border-sky-200/70",
  },
  {
    title: "Video → Türkçe Word/PDF",
    desc: "Videolardan Türkçe transkript, çeviri ve eğitim dokümanı üretme merkezi.",
    href: "/video-ceviri",
    Icon: Video,
    badge: "Video",
    iconGradient: "from-rose-500 to-pink-600",
    cardGradient: "from-rose-100/90 via-pink-50/95 to-white",
    border: "border-rose-200/70",
  },
  {
    title: "Ders Notu Merkezi",
    desc: "Ham transkripti temizle, ders notuna dönüştür. Human Design uyumlu AI çıktısı.",
    href: "/ders-notu",
    Icon: ClipboardList,
    badge: "Notlar",
    iconGradient: "from-teal-600 to-emerald-700",
    cardGradient: "from-teal-50/90 via-emerald-50/95 to-white",
    border: "border-teal-200/70",
  },
] as const;

export default function DigitalContentPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-[15%] h-80 w-80 rounded-full bg-indigo-300/12 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-16 lg:px-8 xl:px-10">
        {/* Geri */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Ana Panel
        </Link>

        {/* Başlık */}
        <div className="mt-5 mb-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-md">
              <Layers className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                Yaşam Sistemi
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Dijital İçerik Merkezi
              </h1>
            </div>
          </div>
          <p className="mt-2.5 max-w-lg text-sm font-medium text-slate-600 sm:text-base">
            Belgeler, videolar, ders notları ve kişisel arşiv yönetimi
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-indigo-200/80 via-sky-200/60 to-transparent" />
        </div>

        {/* Modül kartları */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
          {subModules.map((mod) => {
            const { Icon } = mod;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={`group flex flex-col rounded-[18px] border bg-gradient-to-br p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.cardGradient} ${mod.border}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-all duration-200 group-hover:scale-105 ${mod.iconGradient}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <span className="rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">
                    {mod.badge}
                  </span>
                </div>

                <h2 className="mt-2 text-sm font-black text-slate-900 sm:text-base">
                  {mod.title}
                </h2>
                <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">
                  {mod.desc}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/80">
                    Aktif
                  </span>
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105"
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
