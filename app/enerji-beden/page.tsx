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
        className="pointer-events-none absolute left-[-150px] top-[-120px] h-[650px] w-[650px] rounded-full bg-purple-600/25 blur-[140px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-180px] top-0 h-[700px] w-[700px] rounded-full bg-cyan-500/20 blur-[160px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-250px] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[180px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex h-full min-h-[calc(100vh-90px)] w-[98vw] max-w-none flex-col overflow-hidden px-6 py-5">
        <Link
          href="/"
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-base font-semibold text-white shadow-lg backdrop-blur transition-all duration-200 hover:scale-[1.05] hover:border-cyan-300/40 hover:bg-white/15"
        >
          <span className="text-xl leading-none" aria-hidden>
            ←
          </span>
          Ana Sayfaya Dön
        </Link>

        <header className="shrink-0 py-6 text-center">
          <p className="text-sm font-bold uppercase tracking-[8px] text-cyan-300/90">
            YAŞAM SİSTEMİ
          </p>
          <h1 className="mt-4 bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-blue-400 bg-clip-text text-7xl font-black tracking-tight text-transparent drop-shadow-[0_0_28px_rgba(56,189,248,0.35)]">
            Enerji & Beden
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları
          </p>
          <div
            className="mx-auto mt-6 h-[4px] w-[500px] max-w-full rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_30px_rgba(56,189,248,0.8)]"
            aria-hidden
          />
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-8 pb-2 lg:grid-cols-3">
          {energyFolders.map((folder) => (
            <Link
              key={folder.title}
              href={folder.href}
              className={`group flex h-[520px] max-h-full flex-col overflow-hidden rounded-3xl border bg-gradient-to-br shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)] ${folder.gradient} ${folder.border}`}
            >
              <div className="flex flex-1 flex-col items-center justify-center px-8 pt-10 text-center">
                <span
                  className="flex h-32 w-32 items-center justify-center rounded-[28px] bg-white/55 text-7xl shadow-inner backdrop-blur-sm"
                  aria-hidden
                >
                  {folder.icon}
                </span>
                <span
                  className={`mt-6 rounded-full bg-white/60 px-4 py-1 text-xs font-bold backdrop-blur ${folder.accent}`}
                >
                  {folder.badge}
                </span>
                <h2 className={`mt-5 text-3xl font-bold ${folder.accent}`}>{folder.title}</h2>
                <p className="mt-4 max-w-xs text-base leading-relaxed text-slate-700/90">
                  {folder.desc}
                </p>
              </div>

              <div className="shrink-0 p-8 pt-0">
                <span
                  className={`block w-full rounded-2xl py-4 text-center text-base font-bold shadow-md transition ${folder.button}`}
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
