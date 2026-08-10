"use client";

import { useSearchParams } from "next/navigation";

/**
 * Preview durumu URL query'sinde taşınır (?preview=1). Detay navigasyonunda
 * kaybolmaması için tüm YEBS iç linkleri `withPreview` ile üretilir.
 *
 * GÜVENLİK NOTU: preview bir client kolaylığıdır; gerçek yetki server-side
 * verifyAdminRequest'tir. Server yalnız doğrulanmış admin isteğinde preview verisi
 * döndürür — bu bayrak tek başına yetki vermez.
 */
export function usePreview(): {
  preview: boolean;
  withPreview: (href: string) => string;
} {
  const sp = useSearchParams();
  const preview = sp.get("preview") === "1";
  const withPreview = (href: string): string => {
    if (!preview) return href;
    return href.includes("?") ? `${href}&preview=1` : `${href}?preview=1`;
  };
  return { preview, withPreview };
}
