"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import NotificationBell from "@/components/notifications/NotificationBell";
import QuickNavMenuButton from "@/components/layout/quick-nav/QuickNavMenuButton";
import { quickNavPlacement } from "@/components/layout/quick-nav/quickNavConfig";
import { useQuickNavState } from "@/components/layout/quick-nav/quickNavStore";
import quickNavStyles from "@/components/layout/quick-nav/quickNav.module.css";

const HIDE_ON: string[] = ["/", "/register"];

const subscribeNothing = () => () => {};

export default function AppLogoLink() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const visible = !HIDE_ON.includes(pathname ?? "/");
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const { available } = useQuickNavState();
  // Tek sol menü yan sütundayken (masaüstü) menü kartının logosu ana sayfaya döner → küçük marka bağlantısı gizlenir.
  // İlk çizimde menü kabuğuyla aynı varsayım (oturum bilgisi istemcide okunur).
  const sideMenu = quickNavPlacement(pathname ?? "/") === "side" && (!mounted || available);

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
        <div className="mx-auto flex h-[44px] max-w-screen-2xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* Sol küme: merkezi Hızlı Erişim Menüsü düğmesi (yalnız menü panel olarak açılabildiğinde) + logo. */}
        <div className="flex min-w-0 items-center gap-2">
        <QuickNavMenuButton />
        <Link
          href="/"
          className={`group flex h-[44px] min-w-0 items-center gap-2.5 rounded-lg transition-colors hover:bg-slate-50/80 ${sideMenu ? quickNavStyles.barBrandSide : ""}`}
          aria-label={t("homeAria")}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-sm text-white shadow-sm shadow-violet-300/30 transition-shadow group-hover:shadow-violet-300/50">
            ✨
          </div>
          <span className="truncate text-sm font-black tracking-wide text-slate-900 transition-colors group-hover:text-violet-900">
            YAŞAM SİSTEMİ
          </span>
          <span className="hidden truncate text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-500 sm:inline">
            {t("tagline")}
          </span>
        </Link>
        </div>
        {/* Sağ küme: bildirim zili (oturumsuz / dogaltas / admin rotalarında bileşen kendini gizler). */}
        <div className="flex shrink-0 items-center">
          <NotificationBell compact />
        </div>
        </div>
      </div>
    </>
  );
}
