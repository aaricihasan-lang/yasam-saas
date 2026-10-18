"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Landing — 3 günlük ücretsiz keşif daveti.
 * Yeni kayıt altyapısı YOK: CTA mevcut /register akışına gider; süre, yönetici
 * onayıyla başlar ve yönetici tarafından elle yönetilir (otomatik kapanma yok).
 */
export default function FreeTrialInvite() {
  const t = useTranslations("home.freeTrial");

  return (
    <div className="relative w-full rounded-[28px] bg-gradient-to-r from-indigo-300/80 via-violet-300/80 to-fuchsia-300/80 p-px shadow-[0_18px_50px_rgba(109,40,217,0.14),0_6px_18px_rgba(236,72,153,0.08)]">
      <div className="relative overflow-hidden rounded-[27px] bg-gradient-to-br from-white via-violet-50/80 to-fuchsia-50/70 px-5 py-6 sm:px-8 sm:py-7 lg:px-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-fuchsia-200/40 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden />

        <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8 lg:gap-12">
          <div className="min-w-0 text-center md:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/80 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t("eyebrow")}
            </span>

            <h2 className="mt-3 text-[1.375rem] font-black leading-tight tracking-tight text-slate-950 sm:text-2xl lg:text-[1.75rem]">
              {t("title")}
            </h2>
            <p className="mt-1.5 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 bg-clip-text text-base font-black text-transparent min-[400px]:text-lg sm:text-xl">
              {t("highlight")}
            </p>

            <div className="mx-auto mt-3 max-w-[640px] space-y-2 text-[0.9375rem] leading-[1.7] text-slate-600 md:mx-0">
              <p>{t("body1")}</p>
              <p>{t("body2")}</p>
            </div>
            <p className="mx-auto mt-3 max-w-[640px] text-[0.9375rem] font-bold leading-[1.6] text-slate-800 md:mx-0">
              {t("closing")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 md:w-[300px] lg:w-[320px]">
            <div className="hidden items-center gap-3 md:flex" aria-hidden>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-3xl font-black text-white shadow-[0_8px_22px_rgba(109,40,217,0.32)]">
                3
              </span>
              <span className="text-left text-sm font-black uppercase leading-tight tracking-[0.12em] text-violet-800">
                {t("daysLabel")}
                <span className="block text-[11px] font-bold tracking-[0.14em] text-slate-500">{t("daysSub")}</span>
              </span>
            </div>

            <Link
              href="/register"
              className="inline-flex min-h-[48px] w-full max-w-[340px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-5 py-3 text-center text-sm font-bold text-white no-underline md:whitespace-nowrap shadow-[0_8px_24px_rgba(109,40,217,0.34)] transition [forced-color-adjust:none] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(109,40,217,0.44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 lg:text-[15px]"
            >
              {t("cta")}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>

            <p className="max-w-[300px] text-center text-[11.5px] italic leading-snug text-slate-500">
              {t("note")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
