import Link from "next/link";
import { ArrowLeft, Activity } from "lucide-react";
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
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-300/60 hover:bg-slate-50 hover:text-violet-700 lg:min-h-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Enerji &amp; Beden
          </Link>
        </div>

        <header className="relative mb-5 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-4 shadow-lg sm:px-7 sm:py-5">
          <Activity
            className="pointer-events-none absolute right-5 top-1/2 h-20 w-20 -translate-y-1/2 text-violet-400 opacity-10"
            strokeWidth={1.25}
            aria-hidden
          />
          <div className="relative z-10">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700/85">
              Enerji &amp; Beden
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Biyoenerji
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-snug text-slate-600">
              Çalışma klasörünü seçin — veriler yalnızca ilgili alana girince yüklenir.
            </p>
          </div>
        </header>

        <BiyoenerjiFolderCards />
      </div>
    </main>
  );
}
