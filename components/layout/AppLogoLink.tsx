"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_ON: string[] = ["/", "/register"];

export default function AppLogoLink() {
  const pathname = usePathname();

  if (HIDE_ON.includes(pathname ?? "/")) return null;

  return (
    <div className="w-full border-b border-slate-100 bg-white/95 backdrop-blur-sm">
      <Link
        href="/"
        className="group mx-auto flex max-w-screen-2xl items-center gap-2.5 px-4 py-2 transition-colors hover:bg-slate-50/80 sm:px-6"
        aria-label="Yaşam Sistemi — Ana Sayfaya Dön"
      >
        {/* Gradient icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-sm text-white shadow-sm shadow-violet-300/30 transition-shadow group-hover:shadow-violet-300/50">
          ✨
        </div>

        {/* Brand text */}
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-black tracking-wide text-slate-900 group-hover:text-violet-900 transition-colors">
            YAŞAM SİSTEMİ
          </span>
          <span className="hidden text-xs font-medium text-slate-400 sm:inline group-hover:text-slate-500 transition-colors">
            Bütüncül Yaşam Analizi Platformu
          </span>
        </div>
      </Link>
    </div>
  );
}
