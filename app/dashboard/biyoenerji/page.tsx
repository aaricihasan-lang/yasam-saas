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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-3 py-4 sm:px-5 xl:px-8 2xl:px-12">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            href="/enerji-beden"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-300/40 hover:bg-white/15 lg:min-h-0"
          >
            <span aria-hidden>←</span>
            Enerji &amp; Beden
          </Link>
        </div>

        <header className="mb-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">
            ENERJİ &amp; BEDEN
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-violet-300 bg-clip-text text-xl font-black tracking-tight text-transparent sm:text-2xl xl:text-3xl">
            Biyoenerji
          </h1>
          <p className="mx-auto mt-1 max-w-lg text-[11px] font-medium text-slate-400 sm:text-xs">
            Çalışma klasörünü seçin — veriler yalnızca ilgili alana girince yüklenir
          </p>
          <div
            className="mx-auto mt-2.5 h-px w-full max-w-[200px] rounded-full bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
            aria-hidden
          />
        </header>

        <BiyoenerjiFolderCards />
      </div>
    </main>
  );
}
