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
    <main
      className="h-screen overflow-hidden text-slate-900 antialiased"
      style={{
        background:
          "linear-gradient(135deg,#f7fbff 0%,#f5f1ff 45%,#f5fff8 100%)",
      }}
    >
      <div className="mx-auto flex h-full min-h-[calc(100vh-90px)] w-[98vw] max-w-none flex-col overflow-hidden px-6 py-5">
        <Link
          href="/"
          className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm backdrop-blur transition hover:border-violet-300 hover:bg-white"
        >
          <span aria-hidden>←</span>
          Ana Sayfaya Dön
        </Link>

        <header className="shrink-0 py-6 text-center">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-700/90">
            Yaşam Sistemi
          </p>
          <h1 className="mt-3 text-6xl font-bold tracking-tight text-slate-900">
            Enerji & Beden
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-slate-600">
            Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları
          </p>
          <div
            className="mx-auto mt-5 h-px w-full max-w-xl bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
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
