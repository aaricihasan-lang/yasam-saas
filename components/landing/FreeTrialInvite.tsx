"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronRight, Eye, Sparkles, ShieldCheck, Telescope, UserRound } from "lucide-react";
import lp from "@/app/_premium/landing/landing.module.css";

/**
 * Landing — 3 günlük ücretsiz keşif daveti.
 * Yeni kayıt altyapısı YOK: CTA mevcut /register akışına gider; süre, yönetici
 * onayıyla başlar ve yönetici tarafından elle yönetilir (otomatik kapanma yok).
 * Hero'daki "3 Gün Ücretsiz Deneyin" çağrısı ile aynı teklifin ayrıntısıdır (ayrı kampanya değil).
 * "Nasıl başlarım?" adımları gerçek akışı anlatır: kayıt → yönetici onayı → açılan modüllerde keşif.
 */
export default function FreeTrialInvite() {
  const t = useTranslations("home.freeTrial");
  const p = useTranslations("home.landingPremium");
  const steps = [
    { Icon: UserRound, title: p("step1Title"), desc: p("step1Desc") },
    { Icon: ShieldCheck, title: p("step2Title"), desc: p("step2Desc") },
    { Icon: Telescope, title: p("step3Title"), desc: p("step3Desc") },
  ];

  return (
    <div className={lp.trial}>
      <div className={lp.trialGrid}>
        <div className={lp.trialText}>
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

          <div className={lp.ctaRow}>
            <Link href="/register" className={lp.btnPrimary}>
              <Sparkles className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {t("cta")}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <a href="#test-hesabi" className={lp.btnGlass}>
              <span className={lp.btnGlassIcon} aria-hidden>
                <Eye className="h-4 w-4" />
              </span>
              {p("demoCta")}
            </a>
          </div>
          <p className={lp.trialNote}>{t("note")}</p>
        </div>

        <div className={lp.trialArt} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/premium/landing/deneme-3.webp" width={700} height={630} alt="" loading="lazy" decoding="async" />
        </div>
      </div>

      <div className={lp.steps}>
        <div className={lp.stepsHead}>
          <h3 className={lp.stepsTitle}>{p("stepsTitle")}</h3>
          <p className={lp.stepsSub}>{p("stepsSub")}</p>
        </div>
        <ol className={lp.stepList}>
          {steps.map((s, i) => (
            <li key={s.title} className={lp.step}>
              <span className={lp.stepNum} aria-hidden>{i + 1}</span>
              <s.Icon className={lp.stepIcon} aria-hidden />
              <p className={lp.stepTitle}>{s.title}</p>
              <p className={lp.stepDesc}>{s.desc}</p>
              {i < steps.length - 1 ? <ChevronRight className={lp.stepArrow} aria-hidden /> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
