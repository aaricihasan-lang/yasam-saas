import Link from "next/link";
import BiyoenerjiFolderCards from "./components/BiyoenerjiFolderCards";

export default function BiyoenerjiFolderPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950 antialiased">
      <div
        className="pointer-events-none absolute left-[-60px] top-[-60px] h-72 w-72 rounded-full bg-violet-400/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-40px] top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-3 py-4 sm:px-5 xl:px-8 2xl:px-12">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            href="/enerji-beden"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-300/60 hover:bg-slate-50 hover:text-violet-700 lg:min-h-0"
          >
            <span aria-hidden>←</span>
            Enerji &amp; Beden
          </Link>
        </div>

        <header className="mb-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-violet-600/80">
            ENERJİ &amp; BEDEN
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 bg-clip-text text-xl font-black tracking-tight text-transparent sm:text-2xl xl:text-3xl">
            Biyoenerji
          </h1>
          <p className="mx-auto mt-1 max-w-lg text-[11px] font-medium text-slate-500 sm:text-xs">
            Çalışma klasörünü seçin — veriler yalnızca ilgili alana girince yüklenir
          </p>
          <div
            className="mx-auto mt-2.5 h-px w-full max-w-[200px] rounded-full bg-gradient-to-r from-transparent via-violet-400/60 to-transparent"
            aria-hidden
          />
        </header>

        <BiyoenerjiFolderCards />
      </div>
    </main>
  );
}
