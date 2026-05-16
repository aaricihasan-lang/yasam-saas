import Link from "next/link";

const energyFolders = [
  {
    title: "Biyoenerji",
    desc: "Aura, çakra, imajinasyon ve enerji çalışmaları",
    href: "/dashboard/biyoenerji",
    icon: "✨",
    badge: "Enerji",
  },
  {
    title: "Refleksoloji",
    desc: "Bölge haritası, atlas ve uygulama sistemi",
    href: "/refleksoloji",
    icon: "🦶",
    badge: "Beden",
  },
  {
    title: "Aromaterapi",
    desc: "Uçucu yağlar, sabit yağlar ve karışımlar",
    href: "/aromaterapi",
    icon: "🌿",
    badge: "Koku & Yağ",
  },
] as const;

export default function EnerjiBedenPage() {
  return (
    <main
      className="min-h-screen text-slate-900 antialiased"
      style={{
        background:
          "linear-gradient(135deg,#f7fbff 0%,#f5f1ff 45%,#f5fff8 100%)",
      }}
    >
      <div className="mx-auto w-[96vw] max-w-none px-4 py-6 md:px-6 xl:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2.5 text-base font-bold text-slate-800 shadow-sm backdrop-blur transition hover:border-violet-300 hover:bg-white"
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <header className="mt-6 rounded-[22px] border border-slate-200/90 bg-white/85 p-6 shadow-[0_14px_34px_rgba(15,23,42,0.055)] backdrop-blur-md md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-700/90">
            Yaşam Sistemi
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Enerji & Beden
          </h1>
          <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-600">
            Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları
          </p>
        </header>

        <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {energyFolders.map((folder) => (
            <Link
              key={folder.title}
              href={folder.href}
              className="group block min-h-[220px] rounded-3xl border border-white/80 bg-white/75 p-8 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-md transition-all duration-200 hover:scale-[1.03] hover:border-violet-200/90 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-4xl" aria-hidden>
                  {folder.icon}
                </span>
                <span className="rounded-full bg-violet-100/90 px-3 py-1 text-xs font-bold text-violet-800 backdrop-blur">
                  {folder.badge}
                </span>
              </div>
              <h2 className="mt-6 text-2xl font-bold text-slate-900 group-hover:text-violet-900">
                {folder.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">{folder.desc}</p>
              <p className="mt-6 text-sm font-bold text-violet-700">Klasöre git →</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
