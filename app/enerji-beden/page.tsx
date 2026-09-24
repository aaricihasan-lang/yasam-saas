import { EnergyFoldersClient, type EnergyFolder } from "./EnergyFoldersClient";

const energyFolders: readonly EnergyFolder[] = [
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
    title: "Kupa & Hacamat Terapisi",
    desc: "Vücut nokta atlası, amaç rehberi, kupa teknikleri ve güvenlik sistemi",
    href: "/kupa",
    icon: "🫙",
    badge: "Kupa",
    gradient: "from-rose-200 to-amber-100",
    border: "border-rose-200/70",
    accent: "text-rose-900",
    button: "bg-rose-900/90 text-white hover:bg-rose-950",
  },
];

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
            Beden üzerinde çalışan uygulama ve terapi araçları
          </p>
          <div
            className="mx-auto mt-4 h-1 w-full max-w-sm rounded-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent"
            aria-hidden
          />
        </header>

        <EnergyFoldersClient folders={energyFolders} />
      </div>
    </main>
  );
}
