"use client";

import { reopenAnalyticsConsent } from "@/components/analytics/analyticsConsentClient";

/**
 * "Çerez tercihleri" bağlantısı (P1-6 §3.4): mevcut analitik tercihini sıfırlar
 * (GA susturulur, `_ga` / `_ga_*` çerezleri silinir) ve tercih çubuğunu yeniden açar
 * (window olayı "yasam:analytics-consent-open"). Zorunlu çerezler etkilenmez.
 */
export default function CookiePreferencesButton({
  className,
  label = "Çerez tercihleri",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => reopenAnalyticsConsent()}
      className={
        className ??
        "inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
      }
    >
      {label}
    </button>
  );
}
