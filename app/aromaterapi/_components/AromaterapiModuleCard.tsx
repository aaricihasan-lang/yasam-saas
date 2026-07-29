"use client";

import Link from "next/link";
import { AROMATERAPI_ACCENT } from "@/lib/aromaterapi/aromaterapiAccent";
import type { AromaterapiModule } from "@/lib/aromaterapi/aromaterapiModules";

export type AromaterapiModuleCardProps = {
  module: AromaterapiModule;
  /** İsteğe bağlı sağ üst rozet metni (ör. yağ sayısı). */
  badge?: string;
};

/**
 * Ana Ekran bölüm kartı — registry girdisinden üretilir (hard-code YOK).
 * "Yakında" bölümleri de gerçek route'a gider; sahte veri göstermez.
 */
export function AromaterapiModuleCard({ module, badge }: AromaterapiModuleCardProps) {
  const accent = AROMATERAPI_ACCENT[module.accent];
  const preparing = module.status === "preparing";

  return (
    <Link
      href={module.href}
      className={`group relative flex min-h-[196px] flex-col overflow-hidden rounded-[22px] border p-5 text-left shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ${accent.cardBorder} ${accent.cardGradient} ${accent.cardHoverBorder}`}
    >
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl shadow-sm ring-1 ${accent.iconBox}`}
            aria-hidden
          >
            {module.icon}
          </span>
          <div className="flex items-center gap-1.5">
            {badge ? (
              <span
                className={`rounded-full border bg-white/85 px-2.5 py-0.5 text-[10px] font-black shadow-sm ${accent.chip}`}
              >
                {badge}
              </span>
            ) : null}
            {preparing ? (
              <span className="rounded-full border border-slate-200 bg-white/85 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400 shadow-sm">
                Yakında
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 min-w-0 flex-1">
          <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">
            {module.label}
          </h2>
          <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
            {module.description}
          </p>

          {module.facets && module.facets.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {module.facets.map((facet) => (
                <span
                  key={facet.href}
                  className={`rounded-full border bg-white/80 px-2.5 py-0.5 text-[10px] font-bold ${accent.chip}`}
                >
                  {facet.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <span
          className={`mt-4 block w-full rounded-xl bg-gradient-to-r py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105 ${accent.cta}`}
        >
          {module.label} →
        </span>
      </div>
    </Link>
  );
}
