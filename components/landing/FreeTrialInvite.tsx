"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import lp from "@/app/_premium/landing/landing.module.css";

/**
 * Landing — 3 günlük ücretsiz keşif daveti.
 * Yeni kayıt altyapısı YOK: CTA mevcut /register akışına gider; süre, yönetici
 * onayıyla başlar ve yönetici tarafından elle yönetilir (otomatik kapanma yok).
 * Hero'daki "3 Gün Ücretsiz Deneyin" çağrısı ile aynı teklifin ayrıntısıdır (ayrı kampanya değil).
 */
export default function FreeTrialInvite() {
  const t = useTranslations("home.freeTrial");

  return (
    <div className={lp.trial}>
      <div className={lp.trialGrid}>
        <div className="min-w-0">
          <span className={lp.trialEyebrow}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("eyebrow")}
          </span>

          <h2 className={lp.trialTitle}>{t("title")}</h2>
          <p className={lp.trialHl}>{t("highlight")}</p>

          <div className={lp.trialBody}>
            <p>{t("body1")}</p>
            <p>{t("body2")}</p>
          </div>
          <p className={lp.trialClosing}>{t("closing")}</p>
        </div>

        <div className={lp.trialAside}>
          <div className={lp.medal} aria-hidden>
            <span className={lp.medalNum}>3</span>
            <span className={lp.medalText}>
              {t("daysLabel")}
              <small>{t("daysSub")}</small>
            </span>
          </div>

          <Link href="/register" className={`${lp.btnGold} ${lp.trialCta}`}>
            {t("cta")}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>

          <p className={lp.trialNote}>{t("note")}</p>
        </div>
      </div>
    </div>
  );
}
