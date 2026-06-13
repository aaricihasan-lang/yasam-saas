"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";

/**
 * Drop-in component version of useBfcacheRefresh.
 * Add <BfcacheRefreshHandler /> anywhere in a page's JSX — it renders
 * nothing visible but registers the pageshow listener.
 *
 * Use this in pages that don't already call useRouter themselves.
 * Pages that do use useRouter should call useBfcacheRefresh() directly.
 */
export default function BfcacheRefreshHandler() {
  useBfcacheRefresh();
  return null;
}
