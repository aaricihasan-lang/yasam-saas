"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AROMATERAPI_NAV_MODULES,
  findAromaterapiModuleByPath,
} from "@/lib/aromaterapi/aromaterapiModules";
import { AROMATERAPI_ACCENT } from "@/lib/aromaterapi/aromaterapiAccent";

export type AromaterapiModuleNavProps = {
  className?: string;
};

/**
 * Aromaterapi birincil navigasyonu — yedi bölümü tek registry'den üretir.
 *
 * Masaüstünde yatay pill şeridi; taşarsa yatay kaydırılabilir. Aktif bölüm
 * accent + `aria-current="page"` ile net görünür. Klavye erişilebilir,
 * focus-visible halkalı, min 44px dokunma hedefi. Salt sunum; veri/iş mantığı
 * içermez. Admin/uzman ayrımı YAPMAZ — herkes aynı yedi bölümü görür.
 */
export function AromaterapiModuleNav({ className = "" }: AromaterapiModuleNavProps) {
  const pathname = usePathname() ?? "";
  const activeId = findAromaterapiModuleByPath(pathname)?.id;

  return (
    <nav
      aria-label="Aromaterapi bölümleri"
      className={`overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <ul className="flex min-w-max items-center gap-1.5">
        {AROMATERAPI_NAV_MODULES.map((module) => {
          const active = module.id === activeId;
          const accent = AROMATERAPI_ACCENT[module.accent];
          return (
            <li key={module.id} className="shrink-0">
              <Link
                href={module.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 sm:text-[13px] ${
                  active
                    ? accent.navActive
                    : "border border-slate-200/70 bg-white/80 text-slate-600 hover:-translate-y-0.5 hover:border-amber-200 hover:text-amber-800"
                }`}
              >
                <span aria-hidden className="text-sm leading-none">
                  {module.icon}
                </span>
                <span className="whitespace-nowrap">{module.label}</span>
                {module.status === "preparing" ? (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wide ${
                      active
                        ? "bg-white/25 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    Yakında
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
