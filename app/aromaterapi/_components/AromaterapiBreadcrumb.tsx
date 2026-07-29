"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import {
  AROMATERAPI_HOME,
  findAromaterapiModuleByPath,
} from "@/lib/aromaterapi/aromaterapiModules";

export type AromaterapiBreadcrumbProps = {
  /** Sarmalayıcı sınıf override'ı (varsayılan: mb-3). */
  className?: string;
  /**
   * Aktif bölümden sonra gösterilecek ek yaprak (ör. "Detay"). Detay
   * sayfalarında "Ana Sayfa › Aromaterapi › Yağlar › Detay" üretir.
   */
  leaf?: string;
};

/**
 * Aromaterapi breadcrumb (Ana Sayfa › Aromaterapi › Bölüm [› Yaprak]) +
 * "Aromaterapi Ana" geri çipi. Ana Ekran'da geri çipi gizlenir (kendine
 * dönmemek için). Doğaltaş breadcrumb kalıbının Aromaterapi kimlikli
 * karşılığıdır; Doğaltaş dosyalarına dokunulmaz.
 */
export function AromaterapiBreadcrumb({
  className = "mb-3",
  leaf,
}: AromaterapiBreadcrumbProps) {
  const pathname = usePathname() ?? "";
  const current = findAromaterapiModuleByPath(pathname);
  const isHome = current?.id === AROMATERAPI_HOME.id;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <nav
        aria-label="Sayfa konumu"
        className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-slate-500"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/70 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Ana Sayfa</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
        <Link
          href={AROMATERAPI_HOME.href}
          className="rounded-lg px-1.5 py-1 transition hover:bg-white/70 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
          aria-current={isHome && !leaf ? "page" : undefined}
        >
          {AROMATERAPI_HOME.title}
        </Link>
        {current && !isHome ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            {leaf ? (
              <Link
                href={current.href}
                className="truncate rounded-lg px-1.5 py-1 transition hover:bg-white/70 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
              >
                {current.label}
              </Link>
            ) : (
              <span className="truncate text-slate-900" aria-current="page">
                {current.label}
              </span>
            )}
          </>
        ) : null}
        {leaf ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            <span className="truncate text-slate-900" aria-current="page">
              {leaf}
            </span>
          </>
        ) : null}
      </nav>

      {!isHome ? (
        <Link
          href={AROMATERAPI_HOME.href}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-200/70 bg-white/80 px-3 py-2 text-[12px] font-black text-amber-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Aromaterapi Ana
        </Link>
      ) : null}
    </div>
  );
}
