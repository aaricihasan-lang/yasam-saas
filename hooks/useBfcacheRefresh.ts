"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for the browser's pageshow event and calls router.refresh()
 * when the page is restored from the Back/Forward Cache (bfcache).
 *
 * Bfcache restores a frozen snapshot of the page: React's useEffect hooks
 * do not re-run and the Next.js router cache may be stale. router.refresh()
 * flushes the router cache so the component tree re-renders with fresh data.
 *
 * Use this hook in any "use client" component that manages local navigation
 * state (tabs, view switching, search params) to prevent stale or unstyled
 * renders after browser back/forward navigation.
 */
export function useBfcacheRefresh(): void {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);
}
