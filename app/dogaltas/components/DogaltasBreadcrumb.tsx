"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import {
  DOGALTAS_HOME,
  findDogaltasModuleByPath,
} from "@/lib/dogaltas/dogaltasModules";

export type DogaltasBreadcrumbProps = {
  /** Sarmalayıcı sınıf override'ı (varsayılan: mb-3). */
  className?: string;
};

/**
 * Doğaltaş breadcrumb (Ana Sayfa › Doğaltaş › Sayfa) + "Doğaltaş Paneli" geri
 * çipi. Hem `DogaltasSectionShell` hem de kendi kabuğunu koruyan sayfalar
 * (ör. h-screen iki-panel kütüphane) tarafından kullanılır.
 */
export function DogaltasBreadcrumb({
  className = "mb-3",
}: DogaltasBreadcrumbProps) {
  const pathname = usePathname() ?? "";
  const current = findDogaltasModuleByPath(pathname);
  const t = useTranslations("stones.breadcrumb");
  const tm = useTranslations("stones.modules");

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`}
    >
      <nav
        aria-label={t("aria")}
        className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-slate-500"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/70 hover:text-emerald-700"
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{t("home")}</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
        <Link
          href={DOGALTAS_HOME.href}
          className="rounded-lg px-1.5 py-1 transition hover:bg-white/70 hover:text-emerald-700"
        >
          {tm("home.title")}
        </Link>
        {current ? (
          <>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-slate-300"
              aria-hidden
            />
            <span className="truncate text-slate-900" aria-current="page">
              {tm(`${current.slug}.title`)}
            </span>
          </>
        ) : null}
      </nav>

      <Link
        href={DOGALTAS_HOME.href}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/70 bg-white/80 px-3 py-2 text-[12px] font-black text-emerald-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("panel")}
      </Link>
    </div>
  );
}
