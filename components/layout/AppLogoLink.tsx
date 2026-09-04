"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

const HIDE_ON: string[] = ["/", "/register"];

export default function AppLogoLink() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const visible = !HIDE_ON.includes(pathname ?? "/");

  useEffect(() => {
    // Belt-and-suspenders: sets --logo-h via JS in case the inline <style> tag
    // is deferred or deduplicated by the browser/React.
    const root = document.documentElement;
    if (visible) {
      root.style.setProperty("--logo-h", "44px");
    } else {
      root.style.removeProperty("--logo-h");
    }
    return () => { root.style.removeProperty("--logo-h"); };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/*
        <style> tag: sets --logo-h from SSR so globals.css overrides
        (min-h-screen, h-screen) take effect before JS hydration — no layout flash.
      */}
      <style>{":root { --logo-h: 44px; }"}</style>

      {/* In-flow spacer — pushes page content below the fixed bar */}
      <div className="h-[44px] w-full shrink-0" aria-hidden />

      {/* Fixed bar — floats above content, zero document-flow cost */}
      <div className="fixed left-0 right-0 top-0 z-50 w-full border-b border-slate-100 bg-white/95 backdrop-blur-sm">
        <Link
          href="/"
          className="group mx-auto flex h-[44px] max-w-screen-2xl items-center gap-2.5 px-4 transition-colors hover:bg-slate-50/80 sm:px-6"
          aria-label={t("homeAria")}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-sm text-white shadow-sm shadow-violet-300/30 transition-shadow group-hover:shadow-violet-300/50">
            ✨
          </div>
          <span className="text-sm font-black tracking-wide text-slate-900 transition-colors group-hover:text-violet-900">
            YAŞAM SİSTEMİ
          </span>
          <span className="hidden text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-500 sm:inline">
            {t("tagline")}
          </span>
        </Link>
      </div>
    </>
  );
}
