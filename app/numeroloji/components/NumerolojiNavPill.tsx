"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Üst gezinme — cam hap görünümü */
export function NumerolojiNavPill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3.5 py-1.5 text-[11px] font-bold text-violet-800 shadow-sm ring-1 ring-violet-200/40 backdrop-blur-md transition hover:border-violet-300/90 hover:bg-white/90 hover:text-violet-950 hover:shadow-md no-underline"
    >
      {children}
    </Link>
  );
}
