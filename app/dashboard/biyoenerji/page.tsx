import Link from "next/link";
import BiyoenerjiFolderCards from "./components/BiyoenerjiFolderCards";

export default function BiyoenerjiFolderPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071226] text-slate-100 antialiased">
      <div
        className="pointer-events-none absolute left-[-60px] top-[-60px] h-72 w-72 rounded-full bg-purple-600/18 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-40px] top-0 h-64 w-64 rounded-full bg-cyan-500/14 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
        <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/enerji-beden"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:border-cyan-300/40 hover:bg-white/15 sm:px-5 sm:py-3"
          >
            <span aria-hidden>←</span>
            Enerji & Beden&apos;e Dön
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 sm:px-5 sm:py-3"
          >
            Ana Sayfa
          </Link>
        </div>

        <header className="mb-8 text-center sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300/90 sm:text-sm">
            ENERJİ & BEDEN
          </p>
          <h1 className="mt-3 bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-violet-300 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl xl:text-6xl">
            Biyoenerji
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-slate-400 sm:text-lg">
            Çalışma klasörünü seçin — veriler yalnızca ilgili alana girince yüklenir
          </p>
          <div
            className="mx-auto mt-5 h-1 w-full max-w-md rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"
            aria-hidden
          />
        </header>

        <BiyoenerjiFolderCards />
      </div>
    </main>
  );
}
