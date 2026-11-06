"use client";

/**
 * Uzman ana sayfası — karşılama (hero) bölgesi.
 *
 * P3 (Kişisel Dijital Ofis): yalnız SUNUM AYRIŞTIRMASI. Markup, CSS sınıfları ve test kimlikleri (`home-hero-glow`,
 * `home-hero-title`) app/page.tsx'teki önceki satır içi hâliyle BİREBİR aynıdır; davranış değişikliği yoktur.
 * Kişisel tasarımın (lib/workspace/homeView.ts → HomeView.hero / background) bu bölgeye bağlanması P4'tedir.
 */
import { useTranslations } from "next-intl";
import premium from "./home.module.css";

export default function HomeHero({ firstName, heroDate }: { firstName: string; heroDate: string }) {
  const t = useTranslations("home");
  return (
    <section className={premium.hero} aria-labelledby="home-hero-title">
      <div className={premium.heroArt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/premium/ana-sayfa/hero-manzara.webp" width={738} height={259} alt="" aria-hidden data-testid="home-hero-glow" />
      </div>
      <div className={premium.heroText}>
        <p className={premium.eyebrow}>{t("premium.eyebrow")}</p>
        <h1 id="home-hero-title" className={premium.heroTitle}>
          {firstName ? (
            <>
              <span>{t("dashboard.welcomePrefix")}</span>
              <span className={premium.heroName}>{firstName} ✨</span>
            </>
          ) : (
            <span>{t("dashboard.welcomePlain")}</span>
          )}
        </h1>
        <p className={premium.heroDate}>{heroDate}</p>
        <p className={premium.heroSub}>{t("premium.heroSub")}</p>
      </div>
    </section>
  );
}
