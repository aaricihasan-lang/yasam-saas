"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AromaterapiBreadcrumb } from "@/app/aromaterapi/_components/AromaterapiBreadcrumb";
import { AromaterapiModuleNav } from "@/app/aromaterapi/_components/AromaterapiModuleNav";
import { AROMATERAPI_ACCENT } from "@/lib/aromaterapi/aromaterapiAccent";
import { findAromaterapiModuleByPath } from "@/lib/aromaterapi/aromaterapiModules";

export type AromaterapiSectionShellProps = {
  /** Üstte küçük büyük-harf etiket; verilmezse aktif bölüm adı kullanılır. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Hero sağında soluk dev dekor ikon (emoji). */
  icon?: ReactNode;
  /** Hero sağ üst aksiyon/istatistik alanı. */
  actions?: ReactNode;
  /** Breadcrumb'ta aktif bölümden sonra gösterilecek yaprak (ör. "Detay"). */
  breadcrumbLeaf?: string;
  /** Birincil navigasyon şeridi gösterilsin mi? (Ana Ekran'da kartlar nav'dır.) */
  showNav?: boolean;
  /** Hero üstünde tam-genişlik alan (ör. demo banner). */
  banner?: ReactNode;
  /** İçerik genişliği (varsayılan max-w-[1600px] — data-management çalışma yüzeyi). */
  maxWidthClass?: string;
  /** Hero ile içerik arası boşluk override. */
  contentClassName?: string;
  children: ReactNode;
};

/**
 * Aromaterapi V2 ortak sayfa kabuğu: krem/amber pastel zemin + yumuşak blob'lar,
 * breadcrumb, birincil navigasyon, cam hero başlığı ve içerik container'ı.
 *
 * Salt sunumdur: veri fetch veya iş mantığı YOKTUR. Admin ve uzman aynı kabuğu
 * kullanır (fark yalnız tenant verisindedir). Doğaltaş kabuğunun yapısı örnek
 * alınmıştır; Doğaltaş dosyaları import EDİLMEZ (modül bağımsızlığı).
 */
export function AromaterapiSectionShell({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  breadcrumbLeaf,
  showNav = true,
  banner,
  maxWidthClass = "max-w-[1600px]",
  contentClassName = "mt-4",
  children,
}: AromaterapiSectionShellProps) {
  const pathname = usePathname() ?? "";
  const current = findAromaterapiModuleByPath(pathname);
  const accent = AROMATERAPI_ACCENT[current?.accent ?? "amber"];
  const eyebrowText = eyebrow ?? current?.label ?? "Aromaterapi";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fffaf3_0%,#fef6ee_46%,#f6faf8_100%)] text-slate-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-amber-200/18 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-emerald-200/14 blur-3xl"
      />

      <div
        className={`relative z-10 mx-auto w-full ${maxWidthClass} px-4 py-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12`}
      >
        <AromaterapiBreadcrumb leaf={breadcrumbLeaf} />

        {banner ? <div className="mb-3">{banner}</div> : null}

        {/* Hero başlık kartı */}
        <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-5 shadow-[0_10px_34px_-16px_rgba(15,23,42,0.20)] ring-1 ring-white/90 backdrop-blur-md sm:px-7 sm:py-6">
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
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </header>

        {showNav ? <AromaterapiModuleNav className="mt-3" /> : null}

        <div className={contentClassName}>{children}</div>
      </div>
    </main>
  );
}
