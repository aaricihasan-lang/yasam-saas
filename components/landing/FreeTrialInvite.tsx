"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronRight, Eye, Sparkles, ShieldCheck, Telescope, UserRound } from "lucide-react";
import lp from "@/app/_premium/landing/landing.module.css";

/**
 * Landing — 7 günlük ücretsiz keşif daveti (TRIAL7). CTA /register akışına gider.
 * "Nasıl başlarım?" adımları GERÇEK akışı anlatır ve sunucunun kayıt moduna göre seçilir:
 *   selfTrial (onaysız deneme açık) → kayıt → giriş (7 gün ilk girişle başlar) → keşif;
 *   aksi halde → kayıt → yönetici onayı → keşif. Hero'daki çağrıyla aynı teklifin ayrıntısıdır.
 * Görsel: eski "3 GÜN" görseli (deneme-3.webp) kaldırıldı; 7 günlük onaylı görsel gelene kadar bölüm
 * görselsiz tek sütun (TRIAL_ART null). Görsel hazır olunca yalnız TRIAL_ART güncellenir.
 */
const TRIAL_ART: { src: string; width: number; height: number } | null = null;

export default function FreeTrialInvite({ selfTrial = false }: { selfTrial?: boolean }) {
  const t = useTranslations("home.freeTrial");
  const p = useTranslations("home.landingPremium");
  const steps = [
    { Icon: UserRound, title: p("step1Title"), desc: p("step1Desc") },
    selfTrial
      ? { Icon: ShieldCheck, title: p("step2TitleInstant"), desc: p("step2DescInstant") }
      : { Icon: ShieldCheck, title: p("step2Title"), desc: p("step2Desc") },
    { Icon: Telescope, title: p("step3Title"), desc: p("step3Desc") },
  ];

  return (
    <div className={lp.trial}>
      <div className={lp.trialGrid} style={TRIAL_ART ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
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
          <p className={lp.trialNote}>{selfTrial ? t("noteInstant") : t("note")}</p>
        </div>

        {TRIAL_ART ? (
          <div className={lp.trialArt} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TRIAL_ART.src} width={TRIAL_ART.width} height={TRIAL_ART.height} alt="" loading="lazy" decoding="async" />
          </div>
        ) : null}
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
