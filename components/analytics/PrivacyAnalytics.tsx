"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { redactAnalyticsUrl } from "@/lib/legal/analyticsPolicy";

/**
 * Vercel Web Analytics + Speed Insights — URL maskeleme ile (FAZ1 FINAL HARDENING — INFRA).
 *
 * Uygulama içi rotalar (ör. /dashboard/clients/<uuid>) Vercel'e kimlik taşımadan gider:
 * query/hash atılır, UUID'ler `[id]` olur (lib/legal/analyticsPolicy.ts → redactAnalyticsUrl).
 * `beforeSend` bir fonksiyon olduğundan Server Component (app/layout.tsx) doğrudan
 * geçiremez → bu küçük istemci sarmalayıcısı kullanılır.
 */
export default function PrivacyAnalytics() {
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: redactAnalyticsUrl(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: redactAnalyticsUrl(event.url) })} />
    </>
  );
}
