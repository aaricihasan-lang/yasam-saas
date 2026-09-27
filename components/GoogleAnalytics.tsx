"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import {
  GA_MEASUREMENT_ID,
  analyticsPagePath,
  shouldEnableAnalytics,
} from "@/lib/legal/analyticsPolicy";

/**
 * Google Analytics — YALNIZ herkese açık sayfalarda ve YALNIZ oturum açılmamış
 * ziyaretçide (FAZ1 FINAL HARDENING — INFRA). Kural: lib/legal/analyticsPolicy.ts.
 *
 * Güvenlik:
 *   - İzinli olmayan rotada (dashboard/danışan/modül/admin) gtag.js HİÇ yüklenmez.
 *   - GA bir kez yüklendiyse (ör. giriş sayfası) ve kullanıcı oturum açar ya da
 *     uygulama içi bir rotaya geçerse `window["ga-disable-<ID>"] = true` ile GA
 *     susturulur. Bayrak, history.pushState/replaceState ve popstate'te GA'nın kendi
 *     dinleyicilerinden ÖNCE güncellenir (enhanced measurement sayfa değişimi dahil).
 *   - page_view elle ve yalnız normalize yol ile gönderilir (query/hash YOK).
 *   - Inline init script'i YOK: dataLayer/gtag kuyruğu burada kurulur, gtag.js yüklenince işler.
 *   - gtag.js yalnız ilk izinli sayfada, effect içinde DOM'a bir kez eklenir.
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
    __yasamGaGuard?: boolean;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}` as const;
const SCRIPT_ID = "yasam-gtag-js";

function hasBrowserSession(): boolean {
  try {
    return Boolean(readSessionToken()) || readYasamUser() !== null;
  } catch {
    return false;
  }
}

function evaluate(pathname: string): boolean {
  const enabled = shouldEnableAnalytics({ pathname, hasSession: hasBrowserSession() });
  window[DISABLE_KEY] = !enabled;
  return enabled;
}

/** GA'nın history dinleyicilerinden önce bayrağı günceller (tek sefer kurulur). */
function installNavigationGuard(): void {
  if (window.__yasamGaGuard) return;
  window.__yasamGaGuard = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      try {
        const target = args[2];
        if (target != null) evaluate(new URL(String(target), window.location.href).pathname);
      } catch {
        /* URL çözülemezse mevcut bayrak korunur */
      }
      return original.apply(this, args);
    } as History["pushState"];
  }
  window.addEventListener("popstate", () => evaluate(window.location.pathname), true);
  // Aynı sekmede giriş (localStorage) olayı yayınlanmaz → hafif periyodik kontrol.
  window.setInterval(() => evaluate(window.location.pathname), 2000);
}

function ensureGtag(): GtagFn {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // GA, kuyrukta `arguments` nesnesi bekler (dizi değil).
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  }
  if (!document.getElementById(SCRIPT_ID)) {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);
  }
  return window.gtag;
}

export default function GoogleAnalytics() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (!evaluate(pathname)) return;
    installNavigationGuard();
    const gtag = ensureGtag();
    const pagePath = analyticsPagePath(pathname);
    const pageLocation = `${window.location.origin}${pagePath}`;
    // Sonraki otomatik olaylar da (scroll/engagement) query'siz konumu kullansın.
    gtag("set", { page_location: pageLocation, page_path: pagePath });
    gtag("event", "page_view", {
      page_path: pagePath,
      page_location: pageLocation,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
