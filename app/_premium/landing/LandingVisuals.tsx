"use client";

/**
 * Satış ana sayfası — durum tutmayan görsel sahneler (cihaz çerçeveleri, dağınık → tek merkez anlatımı).
 * Tüm metinler gerçek HTML'dir ve mevcut i18n anahtarlarından gelir; cihaz içleri giriş sonrası gerçek
 * ana panelin / Yaşam Analiz Merkezi'nin sade temsilidir (yeni özellik, puan veya yorum yok).
 * HAREKET YOK: hiçbir öğe animasyon/transform geçişi kullanmaz.
 */
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  FolderArchive,
  Gem,
  Hash,
  LayoutGrid,
  Lock,
  StickyNote,
  UsersRound,
} from "lucide-react";
import lp from "./landing.module.css";
import { LANDING_HOME_CENTERS, LANDING_ANALYSIS_CARDS } from "./landingTheme";

const LOGO = "/premium/brand/yasam-sistemi-logo.webp";

/* ── Giriş sonrası ana panelin temsili (laptop ekranı) ───────────────────── */
function HomeScreen() {
  const t = useTranslations("home");
  const nav = ["dyKayit", "dyListe", "dyAjanda", "energyBody", "reflexology", "cupping", "stones", "aromatherapy", "sifa", "beslenme", "personalArchive", "numeroloji", "humanDesign"];
  return (
    <div className={lp.scrApp}>
      <aside className={lp.scrSide}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={lp.scrLogo} src={LOGO} width={600} height={501} alt="" loading="lazy" decoding="async" />
        <p className={lp.scrMenuHead}>
          <LayoutGrid aria-hidden />
          {t("premium.menuAllModules")}
          <ChevronDown aria-hidden />
        </p>
        <ul className={lp.scrMenu}>
          {nav.map((k) => (
            <li key={k}>{t(`premium.nav.${k}`)}</li>
          ))}
        </ul>
      </aside>
      <div className={lp.scrMain}>
        <div className={lp.scrTop}>
          <span className={lp.scrPill}>Türkçe</span>
          <Bell aria-hidden />
        </div>
        <div className={lp.scrHero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/premium/ana-sayfa/hero-manzara.webp" width={738} height={259} alt="" loading="lazy" decoding="async" />
          <div className={lp.scrHeroText}>
            <p className={lp.scrEyebrow}>{t("premium.eyebrow")}</p>
            <p className={lp.scrHello}>{t("dashboard.welcomePlain")}</p>
            <p className={lp.scrSub}>{t("premium.heroSub")}</p>
          </div>
        </div>
        <p className={lp.scrSecTitle}>{t("premium.modulesTitle")}</p>
        <div className={lp.scrGrid}>
          {LANDING_HOME_CENTERS.map((c) => (
            <div key={c.key} className={lp.scrCard} style={{ "--acc": c.acc } as React.CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.icon} alt="" loading="lazy" decoding="async" />
              <p className={lp.scrCardTitle}>{t(`modules.${c.key}.title`)}</p>
              <p className={lp.scrCardDesc}>{t(`modules.${c.key}.desc`)}</p>
              <span className={lp.scrCardGo}>
                <ArrowRight aria-hidden />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Yaşam Analiz Merkezi'nin mobil temsili (telefon ekranı) ─────────────── */
function AnalysisPhoneScreen() {
  const t = useTranslations("home");
  return (
    <div className={lp.phApp}>
      <div className={lp.phStatus}>
        <span>9:41</span>
        <span className={lp.phIsland} />
        <span className={lp.phBatt} />
      </div>
      <div className={lp.phHead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={600} height={501} alt="" loading="lazy" decoding="async" />
        <span>{t("brand")}</span>
        <Bell aria-hidden />
      </div>
      <div className={lp.phLead}>
        <p className={lp.phLeadEyebrow}>{t("premium.eyebrow")}</p>
        <p className={lp.phLeadTitle}>{t("modules.numerology.title")}</p>
        <p className={lp.phLeadDesc}>{t("modules.numerology.desc")}</p>
      </div>
      {LANDING_ANALYSIS_CARDS.map((c) => (
        <div key={c.navKey} className={lp.phCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.img} alt="" loading="lazy" decoding="async" />
          <p>{t(`premium.nav.${c.navKey}`)}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Giriş sonrası merkezlerin mobil listesi (hero telefonu) ─────────────── */
function CentersPhoneScreen() {
  const t = useTranslations("home");
  return (
    <div className={lp.phApp}>
      <div className={lp.phStatus}>
        <span>9:41</span>
        <span className={lp.phIsland} />
        <span className={lp.phBatt} />
      </div>
      <div className={lp.phHead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={600} height={501} alt="" loading="lazy" decoding="async" />
        <span>{t("brand")}</span>
        <Bell aria-hidden />
      </div>
      <p className={lp.phHello}>{t("dashboard.welcomePlain")}</p>
      <ul className={lp.phList}>
        {LANDING_HOME_CENTERS.map((c) => (
          <li key={c.key}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.icon} alt="" loading="lazy" decoding="async" />
            <span>{t(`modules.${c.key}.title`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 01 · Hero sahnesi: laptop (ana panel) + telefon (merkezler). */
export function HeroDevices() {
  const t = useTranslations("home.landingPremium");
  return (
    <div className={lp.devStage} role="img" aria-label={t("heroDevicesAria")}>
      <div className={lp.laptop} aria-hidden>
        <div className={lp.laptopLid}>
          <span className={lp.laptopCam} />
          <div className={lp.laptopScreen}>
            <HomeScreen />
          </div>
        </div>
        <div className={lp.laptopBase}>
          <span className={lp.laptopNotch} />
        </div>
      </div>
      <div className={`${lp.phone} ${lp.phoneHero}`} aria-hidden>
        <div className={lp.phoneScreen}>
          <CentersPhoneScreen />
        </div>
      </div>
    </div>
  );
}

/** 06 · Mobil bölüm telefonu (Yaşam Analiz Merkezi). */
export function MobilePhone() {
  const t = useTranslations("home.landingPremium");
  return (
    <div className={lp.mobStage}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={lp.mobDecor} src="/premium/landing/bitki-taslar.webp" width={224} height={460} alt="" aria-hidden loading="lazy" decoding="async" />
      <div className={`${lp.phone} ${lp.phoneMobile}`} role="img" aria-label={t("phoneAria")}>
        <div className={lp.phoneScreen} aria-hidden>
          <AnalysisPhoneScreen />
        </div>
      </div>
      <span className={lp.plinth} aria-hidden />
    </div>
  );
}

/** 03 · Tablet içinde örnek danışan ekranı (temsili veri; Ahmet Yılmaz). */
export function ClientTablet() {
  const t = useTranslations("home.mockup");
  const tabs = ["tabGenel", "tabNumeroloji", "tabRefleksoloji", "tabDogaltas", "tabNotlar", "tabRandevular", "tabDosyalar"];
  const works = [
    { n: 1, dot: "#7c6fc4" },
    { n: 2, dot: "#c8507f" },
    { n: 3, dot: "#1f9a7a" },
    { n: 4, dot: "#1d8fc4" },
    { n: 5, dot: "#b8862b" },
  ];
  return (
    <div className={lp.tablet}>
      <span className={lp.tabletCam} aria-hidden />
      <div className={lp.tabletScreen}>
        <div className={lp.clApp}>
          <div className={lp.clBar}>
            <span className={lp.clDots} aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <p>{t("windowTitle")}</p>
          </div>
          <div className={lp.clBody}>
            <div className={lp.clSide}>
              <div className={lp.clClient}>
                <span className={lp.clAvatar} aria-hidden>AY</span>
                <div>
                  <p className={lp.clName}>{t("clientName")}</p>
                  <span className={lp.clActive}>{t("activeClient")}</span>
                </div>
              </div>
              <dl className={lp.clRows}>
                <div>
                  <dt>{t("rowLastMeeting")}</dt>
                  <dd>04.06.2026</dd>
                </div>
                <div>
                  <dt>{t("rowSavedWork")}</dt>
                  <dd>{t("savedWorkValue")}</dd>
                </div>
                <div>
                  <dt>{t("rowUpcoming")}</dt>
                  <dd>{t("upcomingValue")}</dd>
                </div>
              </dl>
              <nav className={lp.clTabs} aria-label={t("tabsAria")}>
                {tabs.map((k, i) => (
                  <span key={k} className={i === 0 ? lp.clTabOn : undefined}>
                    {t(k)}
                  </span>
                ))}
              </nav>
            </div>
            <div className={lp.clMain}>
              <div className={lp.clStats}>
                {[
                  ["5", "statAnaliz"],
                  ["8", "statSeans"],
                  ["3", "statDosya"],
                  ["4", "statNot"],
                ].map(([v, k]) => (
                  <div key={k}>
                    <strong>{v}</strong>
                    <span>{t(k)}</span>
                  </div>
                ))}
              </div>
              <p className={lp.clWorksHead}>{t("recentWorks")}</p>
              <ul className={lp.clWorks}>
                {works.map((w) => (
                  <li key={w.n}>
                    <i style={{ "--dot": w.dot } as React.CSSProperties} aria-hidden />
                    <span>
                      <b>{t(`work${w.n}`)}</b>
                      <small>{t(`work${w.n}detail`)}</small>
                    </span>
                    <em>{t(`work${w.n}date`)}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 04 · Dağınık dosyalardan tek merkeze (yalnız açıklayıcı; içe aktarma vaadi yok). */
export function ScatterToHub() {
  const t = useTranslations("home.landingPremium");
  const drawers = [UsersRound, CalendarDays, StickyNote, FolderArchive, Gem, Hash];
  const labels = t.raw("hubDrawers") as string[];
  return (
    <div className={lp.flowStage}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={lp.pileImg} src="/premium/landing/dagnik-dosyalar.webp" width={600} height={475} alt="" aria-hidden loading="lazy" decoding="async" />
      <svg className={lp.flowLines} viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lpFlowGold" x1="0" x2="1">
            <stop offset="0" stopColor="#e9d3a0" stopOpacity="0.2" />
            <stop offset="1" stopColor="#b8862b" />
          </linearGradient>
        </defs>
        <path d="M0 20 C 80 18, 120 52, 186 60" />
        <path d="M0 48 C 70 50, 120 58, 186 60" />
        <path d="M0 78 C 70 76, 120 64, 186 60" />
        <path d="M0 104 C 80 104, 120 70, 186 60" />
        <path className={lp.flowHead} d="M178 52 L194 60 L178 68" />
      </svg>
      <div className={lp.cabinet}>
        <div className={lp.cabinetHead}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={600} height={501} alt="" loading="lazy" decoding="async" />
        </div>
        <ul className={lp.drawers}>
          {drawers.map((Icon, i) => (
            <li key={i}>
              <Icon aria-hidden />
              <span>{labels[i]}</span>
            </li>
          ))}
        </ul>
        <p className={lp.cabinetFoot}>
          <Lock aria-hidden />
          {t("problemHub")}
        </p>
      </div>
    </div>
  );
}
