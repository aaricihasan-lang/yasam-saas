import Link from "next/link";

const energyFolders = [
  {
    title: "Biyoenerji",
    desc: "Aura, çakra, imajinasyon ve enerji çalışmaları",
    href: "/dashboard/biyoenerji",
    icon: "✨",
    badge: "Enerji",
    gradient: "from-purple-200 to-fuchsia-100",
    border: "border-fuchsia-200/70",
    accent: "text-fuchsia-900",
    button: "bg-fuchsia-900/90 text-white hover:bg-fuchsia-950",
  },
  {
    title: "Refleksoloji",
    desc: "Bölge haritası, atlas ve uygulama sistemi",
    href: "/refleksoloji",
    icon: "🦶",
    badge: "Beden",
    gradient: "from-emerald-200 to-cyan-100",
    border: "border-cyan-200/70",
    accent: "text-emerald-900",
    button: "bg-emerald-900/90 text-white hover:bg-emerald-950",
  },
  {
    title: "Aromaterapi",
    desc: "Uçucu yağlar, sabit yağlar ve karışımlar",
    href: "/aromaterapi",
    icon: "🌿",
    badge: "Koku & Yağ",
    gradient: "from-orange-100 to-yellow-50",
    border: "border-orange-200/70",
    accent: "text-orange-900",
    button: "bg-orange-800/90 text-white hover:bg-orange-900",
  },
] as const;

export default function EnerjiBedenPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071226] text-slate-100 antialiased">
      <div
        className="pointer-events-none absolute left-[-80px] top-[-80px] h-80 w-80 rounded-full bg-purple-600/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-60px] top-0 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 flex h-full min-h-[calc(100vh-90px)] w-full flex-col overflow-hidden px-4 py-4 sm:px-6 xl:px-10">
        <header className="shrink-0 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300/90">
            YAŞAM SİSTEMİ
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-blue-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl xl:text-6xl">
            Enerji &amp; Beden
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları
          </p>
          <div
            className="mx-auto mt-4 h-1 w-full max-w-sm rounded-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent"
            aria-hidden
          />
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-5 pb-2 lg:grid-cols-3">
          {energyFolders.map((folder) => (
            <Link
              key={folder.title}
              href={folder.href}
              className={`group flex h-auto flex-col overflow-hidden rounded-2xl border bg-gradient-to-br shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${folder.gradient} ${folder.border}`}
            >
              <div className="flex flex-1 flex-col items-center justify-center px-5 pt-6 text-center">
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/60 text-4xl shadow-sm"
                  aria-hidden
                >
                  {folder.icon}
                </span>
                <span
                  className={`mt-4 rounded-full bg-white/60 px-3 py-0.5 text-xs font-bold backdrop-blur ${folder.accent}`}
                >
                  {folder.badge}
                </span>
                <h2 className={`mt-3 text-2xl font-bold ${folder.accent}`}>{folder.title}</h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-700/90">
                  {folder.desc}
                </p>
              </div>

              <div className="shrink-0 p-5 pt-4">
                <span
                  className={`block w-full rounded-xl py-2.5 text-center text-sm font-bold shadow-md transition ${folder.button}`}
                >
                  Klasöre Git →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
