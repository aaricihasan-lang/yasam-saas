"use client";

// Numeroloji Merkezi — yöntem seçim vitrini (açık premium, 30.10.2026).
// "Bütüncül Numeroloji" kartı mevcut modülü (/numeroloji) DEĞİŞTİRMEDEN açan düz bir bağlantıdır; görseli o modülün kendi
// vitrin görselidir (public/premium/numeroloji/hero-sol.webp). Klasik görseli projede üretilmiş SVG'dir (premiumArt.tsx).

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Shell, TiltLink } from "@/app/numeroloji-klasik/_ui/kit";
import { ClassicHeroArt, Emblem, SceneOrnament } from "@/app/numeroloji-klasik/_ui/premiumArt";

// I18N: chip anahtarları yalnız gösterim (numerology.app.gate.{a,b}.chips.*); kanonik değer değildir.
const CHIPS_A = ["pin", "anaKulvar", "yanKulvar", "cakraOmurgasi", "elementler", "hayatYolu"] as const;
const CHIPS_B = ["cekirdek", "karmik", "zirveler", "kopruler", "kaldeBilesik", "ikiSistem"] as const;

export default function GateClient() {
  const t = useTranslations("numerology.app.gate");
  return (
    <Shell theme="gate">
      <header className="nk-gate-hero" aria-labelledby="nk-gate-title">
        <SceneOrnament className="nk-gate-orn" />
        <p className="nk-eyebrow">{t("eyebrow")}</p>
        <h1 className="nk-title" id="nk-gate-title">{t("title")}</h1>
        <p className="nk-sub">{t("sub")}</p>
      </header>

      <section className="nk-gate-grid" aria-label={t("methodsAria")}>
        <Link className="nk-card nk-link-card nk-school nk-tone-a" href="/numeroloji" aria-describedby="nk-a-not" data-testid="gate-a">
          <span className="nk-school-art nk-art-a" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- sabit dekor; mevcut modülün kendi görseli */}
            <img src="/premium/numeroloji/hero-sol.webp" width={600} height={320} alt="" decoding="async" draggable={false} />
          </span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">A</span>
            <div>
              <h2 className="nk-school-title">{t("a.title")}</h2>
              <p className="nk-school-sub">{t("a.sub")}</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label={t("a.idcardAria")}>
            <div className="nk-idrow"><dt>{t("idLetterTable")}</dt><dd>{t("a.letterTable")}</dd></div>
            <div className="nk-idrow"><dt>{t("idMasterNumber")}</dt><dd>{t("a.masterNumber")}</dd></div>
            <div className="nk-idrow">
              <dt>{t("idTechniques")}</dt>
              <dd className="nk-chips">
                {CHIPS_A.map((c) => <span key={c} className="nk-chip">{t(`a.chips.${c}`)}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot" id="nk-a-not">
            <Icon name="lock" />{t("a.foot")}
            <span className="nk-school-cta" aria-hidden="true">{t("a.cta")}</span>
          </p>
        </Link>

        <TiltLink className="nk-school nk-tone-b" href="/numeroloji-klasik" data-testid="gate-b">
          <span className="nk-school-art nk-art-b" aria-hidden="true">
            <ClassicHeroArt variant="card" className="nk-school-svg" />
          </span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">B</span>
            <div>
              <h2 className="nk-school-title">{t("b.title")}</h2>
              <p className="nk-school-sub">{t("b.sub")}</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label={t("b.idcardAria")}>
            <div className="nk-idrow"><dt>{t("idLetterTable")}</dt><dd>{t("b.letterTable")}</dd></div>
            <div className="nk-idrow"><dt>{t("idMasterNumber")}</dt><dd>{t("b.masterNumber")}</dd></div>
            <div className="nk-idrow">
              <dt>{t("idTechniques")}</dt>
              <dd className="nk-chips">
                {CHIPS_B.map((c) => <span key={c} className="nk-chip">{t(`b.chips.${c}`)}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot">
            <Icon name="shield" />{t("b.foot")}
            <span className="nk-school-cta" aria-hidden="true">{t("b.cta")}</span>
          </p>
        </TiltLink>
      </section>

      <TiltLink className="nk-compare-card" href="/numeroloji-karsilastirma" data-testid="gate-compare">
        <Emblem name="compare" className="nk-compare-emblem" />
        <span>
          <span className="nk-h3" style={{ display: "block" }}>{t("compare.title")}</span>
          <span className="nk-lead" style={{ display: "block" }}>{t("compare.lead")}</span>
        </span>
        <span className="nk-badge nk-violet">{t("compare.badge")}</span>
      </TiltLink>
    </Shell>
  );
}
