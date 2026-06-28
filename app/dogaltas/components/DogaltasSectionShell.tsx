"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DogaltasBreadcrumb } from "@/app/dogaltas/components/DogaltasBreadcrumb";
import { DOGALTAS_ACCENT } from "@/lib/dogaltas/dogaltasAccent";
import {
  DOGALTAS_HOME,
  findDogaltasModuleByPath,
} from "@/lib/dogaltas/dogaltasModules";

export type DogaltasSectionShellProps = {
  /** Üstte küçük büyük-harf etiket; verilmezse aktif modül başlığı kullanılır. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Hero sağında soluk dekor + (opsiyonel) rozet ikonu (emoji). */
  icon?: ReactNode;
  /** Hero sağ üst aksiyon alanı (butonlar). */
  actions?: ReactNode;
  /** İçerik genişliği (varsayılan max-w-[1400px]). */
  maxWidthClass?: string;
  /** Hero ile içerik arası boşluk override. */
  contentClassName?: string;
  children: ReactNode;
};

/**
 * Doğaltaş'a özel V3 sayfa kabuğu: amber/emerald gradient zemin + blur blob'lar,
 * breadcrumb (Ana Sayfa › Doğaltaş › …), geri-dön çipi ve cam hero başlığı.
 * Biyoenerji'nin SectionShell kalıbının Doğaltaş kimlikli karşılığıdır
 * (Biyoenerji dosyalarına dokunulmaz).
 */
export function DogaltasSectionShell({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  maxWidthClass = "max-w-[1400px]",
  contentClassName = "mt-4",
  children,
}: DogaltasSectionShellProps) {
  const pathname = usePathname() ?? "";
  const current = findDogaltasModuleByPath(pathname);
  const accent = DOGALTAS_ACCENT[current?.accent ?? "emerald"];
  const eyebrowText = eyebrow ?? current?.title ?? DOGALTAS_HOME.title;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)] text-slate-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-amber-300/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-10 h-[440px] w-[440px] rounded-full bg-emerald-300/15 blur-3xl"
      />

      <div
        className={`relative z-10 mx-auto w-full ${maxWidthClass} px-3 py-3 sm:px-5 sm:py-4 xl:px-8 2xl:px-10`}
      >
        <DogaltasBreadcrumb />

        {/* Hero başlık kartı */}
        <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-5 shadow-[0_10px_34px_-14px_rgba(15,23,42,0.22)] ring-1 ring-white/90 backdrop-blur-md sm:px-7 sm:py-6">
          {icon ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none text-[120px] leading-none opacity-[0.06]"
            >
              {icon}
            </div>
          ) : null}

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div
                className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${accent.eyebrow}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
                {eyebrowText}
              </div>

              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {title}
              </h1>

              {subtitle ? (
                <p className="mt-1.5 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </header>

        <div className={contentClassName}>{children}</div>
      </div>
    </main>
  );
}
