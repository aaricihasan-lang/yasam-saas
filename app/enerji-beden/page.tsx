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
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#eef4ff] via-[#f6f1ff] to-[#e8fff8] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-[500px] w-[500px] rounded-full bg-purple-300/20 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-[600px] w-[600px] rounded-full bg-cyan-300/20 blur-[140px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 translate-y-1/3 rounded-full bg-emerald-200/20 blur-[120px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex h-full min-h-[calc(100vh-90px)] w-[98vw] max-w-none flex-col overflow-hidden px-6 py-5">
        <Link
          href="/"
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-white/80 bg-white/75 px-6 py-3 text-base font-semibold text-slate-800 shadow-lg backdrop-blur transition-all duration-200 hover:scale-[1.05] hover:border-violet-200 hover:bg-white/90"
        >
          <span className="text-xl leading-none" aria-hidden>
            ←
          </span>
          Ana Sayfaya Dön
        </Link>

        <header className="shrink-0 py-6 text-center">
          <p className="text-sm font-bold uppercase tracking-[8px] text-purple-600">
            YAŞAM SİSTEMİ
          </p>
          <h1 className="mt-4 bg-gradient-to-r from-purple-700 via-indigo-600 to-cyan-600 bg-clip-text text-7xl font-black tracking-tight text-transparent">
            Enerji & Beden
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları
          </p>
          <div
            className="mx-auto mt-6 h-[3px] w-[420px] max-w-full rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent blur-[1px]"
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
