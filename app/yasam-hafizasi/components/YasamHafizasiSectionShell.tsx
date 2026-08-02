import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { ReactNode } from "react";

/**
 * BF-13 — Yaşam Hafızası premium/pastel sayfa kabuğu (modül-izole; başka modülden
 * import EDİLMEZ). Admin ve uzman AYNI kabuğu kullanır (fark yalnız tenant verisi).
 */
export function YasamHafizasiSectionShell({
  title,
  subtitle,
  icon = "🧠",
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#f5f3ff_0%,#eef2ff_45%,#ecfdf5_100%)]">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-violet-200/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-40 h-72 w-72 rounded-full bg-emerald-200/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-8">
        <nav aria-label="Sayfa yolu" className="mb-3 flex items-center gap-1 text-[12px] text-slate-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-violet-700">
            <Home className="h-3.5 w-3.5" aria-hidden />
            Ana Sayfa
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="font-semibold text-slate-700">Yaşam Hafızası</span>
        </nav>

        <header className="mb-5 overflow-hidden rounded-2xl border border-white/80 bg-white/85 p-5 shadow-lg backdrop-blur-md sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                Yaşam Hafızası
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
              ) : null}
            </div>
            <span aria-hidden className="pointer-events-none hidden select-none text-6xl opacity-[0.08] sm:block">
              {icon}
            </span>
          </div>
          {actions ? <div className="mt-4">{actions}</div> : null}
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
