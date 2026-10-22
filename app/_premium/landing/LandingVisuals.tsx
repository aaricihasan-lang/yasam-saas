"use client";

/**
 * Satış ana sayfası — durum tutmayan görsel sahneler (cihaz çerçeveleri, dağınık → tek merkez anlatımı).
 * Tüm metinler gerçek HTML'dir ve mevcut i18n anahtarlarından gelir; cihaz içleri giriş sonrası gerçek
 * ana panelin / Yaşam Analiz Merkezi'nin sade temsilidir (yeni özellik, puan veya yorum yok).
 * HAREKET YOK: hiçbir öğe animasyon/transform geçişi kullanmaz.
 */
import { useTranslations } from "next-intl";
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Droplet,
  Droplets,
  Flower2,
  FolderArchive,
  Gem,
  Hash,
  Hexagon,
  Layers,
  LayoutGrid,
  Leaf,
  Lock,
  Orbit,
  Package,
  Pencil,
  Phone,
  Search,
  Settings,
  Sparkles,
  Sprout,
  Star,
  StickyNote,
  Sun,
  Thermometer,
  TriangleAlert,
  UsersRound,
  Zap,
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
          <Settings aria-hidden />
          <span className={lp.scrPill}>{t("dashboard.logout")}</span>
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

/**
 * 01 · Hero sahnesi — owner onaylı referans sahnenin kendisi (gömülü yazı/düğmeleri temizlenmiş) dekoratif katmandır.
 * Laptop ekranına gerçek ana panelin HTML temsili perspektifle oturtulur (referanstaki kişi adı/sayılar görünmez);
 * telefon katmanı referanstaki gerçek Yaşam Analiz Merkezi ekranıdır (metinler sistemde birebir mevcut).
 * Tümü statik: animasyon/parallax yok. Ölçek, kap genişliğinden saf CSS ile hesaplanır.
 */
export function HeroScene() {
  const t = useTranslations("home.landingPremium");
  return (
    <div className={lp.heroScene} role="img" aria-label={t("heroDevicesAria")}>
      <div className={lp.sceneCanvas} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={lp.sceneBg} src="/premium/landing/hero-sahne.webp" width={1672} height={941} alt="" decoding="async" fetchPriority="high" />
        <div className={lp.sceneLaptop}>
          <HomeScreen />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={lp.scenePhone} src="/premium/landing/hero-telefon.webp" width={280} height={518} alt="" decoding="async" />
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

/**
 * 03 · Danışan Yolculuğu tanıtım ekranı (owner onaylı referans, 2026-10-22).
 * Etiketler gerçek Danışan Detayı / Danışan Yolculuğu çevirilerinden gelir (clients.detail, clients.yolculuk).
 * Herkese açık sayfa: kişi adı "Örnek Danışan", telefon/kan grubu gizli; sağlık bilgisi, hayalî seans/randevu kaydı YOK.
 * Yalnız görsel; hiçbir hesaplama veya veri erişimi yapmaz.
 */
export function ClientJourneyScreen() {
  const h = useTranslations("home");
  const p = useTranslations("home.landingPremium");
  const d = useTranslations("clients.detail");
  const y = useTranslations("clients.yolculuk");

  const side: { label: string; Icon: typeof LayoutGrid; acc: string }[] = [
    { label: h("modules.energy_body.title"), Icon: Zap, acc: "#3b82d6" },
    { label: h("modules.sifa_rehberi.title"), Icon: Leaf, acc: "#2f9a68" },
    { label: h("modules.digital_content.title"), Icon: BookOpen, acc: "#4f5bd5" },
    { label: h("modules.stok.title"), Icon: Package, acc: "#e08a1e" },
    { label: h("premium.nav.numeroloji"), Icon: Hash, acc: "#2aa7b8" },
    { label: h("premium.nav.atlas"), Icon: Orbit, acc: "#4a7fb8" },
    { label: h("premium.nav.humanDesign"), Icon: Hexagon, acc: "#d4a32c" },
    { label: h("premium.nav.aromatherapy"), Icon: Flower2, acc: "#3fa66a" },
    { label: h("premium.nav.sifa"), Icon: Sprout, acc: "#c07a3a" },
    { label: h("premium.nav.cupping"), Icon: Droplets, acc: "#e0566b" },
  ];
  const info: { label: string; value: string; Icon: typeof LayoutGrid; acc: string }[] = [
    { label: d("info.phone"), value: p("cjHidden"), Icon: Phone, acc: "#4f5bd5" },
    { label: d("info.birthDate"), value: p("cjRecorded"), Icon: CalendarDays, acc: "#7a5bd0" },
    { label: d("info.meetingDate"), value: p("cjRecorded"), Icon: CalendarCheck, acc: "#d0507e" },
    { label: d("info.zodiac"), value: p("cjAuto"), Icon: Sun, acc: "#e08a1e" },
    { label: d("info.bloodType"), value: p("cjHidden"), Icon: Droplet, acc: "#d8483f" },
    { label: d("info.temperament"), value: p("cjRecorded"), Icon: Thermometer, acc: "#2f9a68" },
  ];
  const tabs: { k: string; acc: string }[] = [
    { k: "genel", acc: "#4f46c8" },
    { k: "anamnez", acc: "#2f9a68" },
    { k: "notlar", acc: "#4f5bd5" },
    { k: "seanslar", acc: "#2f9a68" },
    { k: "odevler", acc: "#d8483f" },
    { k: "analizler", acc: "#7a5bd0" },
    { k: "humandesign", acc: "#3b6fd6" },
    { k: "taslar", acc: "#2f7fb8" },
    { k: "beslenme", acc: "#2f9a68" },
    { k: "hafiza", acc: "#9b4fc0" },
    { k: "randevular", acc: "#d0507e" },
    { k: "yolculuk", acc: "#4f46c8" },
    { k: "ucretlendirme", acc: "#b8862b" },
  ];
  const stats: { k: string; v: number; pct: number; Icon: typeof LayoutGrid; acc: string; tint: string }[] = [
    { k: "analizler", v: 5, pct: 72, Icon: Layers, acc: "#6d4fd8", tint: "#f3f0fd" },
    { k: "seanslar", v: 8, pct: 56, Icon: CalendarCheck, acc: "#1f8a58", tint: "#eef7f1" },
    { k: "randevular", v: 2, pct: 40, Icon: CalendarDays, acc: "#d0406e", tint: "#fdf0f4" },
    { k: "notlar", v: 4, pct: 64, Icon: StickyNote, acc: "#2f7fd6", tint: "#eef5fd" },
  ];
  const criteria = ["hasDogum", "hasTelefon", "hasNot", "hasSeans", "hasRandevu", "hasAnaliz", "hasTas", "hasOdev"];
  const missing = ["hasTas", "hasOdev"];
  const done = criteria.length - missing.length;

  return (
    <div className={lp.cjFrame}>
      <span className={lp.cjCam} aria-hidden />
      <div className={lp.cjScreen} role="img" aria-label={p("cjAria")}>
        <div className={lp.cj} aria-hidden>
          <aside className={lp.cjSide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={lp.cjLogo} src={LOGO} width={600} height={501} alt="" loading="lazy" decoding="async" />
            <p className={lp.cjSideHead}>
              <LayoutGrid />
              {h("premium.menuAllModules")}
              <ChevronDown />
            </p>
            <div className={lp.cjSideOpen}>
              <p>
                <span className={lp.cjSideIcon} style={{ "--acc": "#6d4fd8" } as React.CSSProperties}>
                  <UsersRound />
                </span>
                {h("modules.clients.title")}
                <ChevronDown />
              </p>
              <ul>
                <li>{h("premium.nav.dyKayit")}</li>
                <li>{h("premium.nav.dyListe")}</li>
                <li>{h("premium.nav.dyAjanda")}</li>
                <li>{h("modules.yasam_hafizasi.title")}</li>
              </ul>
            </div>
            <ul className={lp.cjSideList}>
              {side.map((s) => (
                <li key={s.label}>
                  <span className={lp.cjSideIcon} style={{ "--acc": s.acc } as React.CSSProperties}>
                    <s.Icon />
                  </span>
                  <span>{s.label}</span>
                  <ChevronRight />
                </li>
              ))}
            </ul>
            <p className={lp.cjSideFoot}>
              <Settings />
              {h("premium.menuSettings")}
            </p>
          </aside>

          <div className={lp.cjMain}>
            <div className={lp.cjTop}>
              <span className={lp.cjTopMark}><Star /></span>
              <b>{h("brand")}</b>
              <span className={lp.cjTopSub}>{p("eyebrow")}</span>
              <span className={lp.cjSearch}><Search />{p("cjSearch")}</span>
              <span className={lp.cjTopBtn}><Bell /></span>
              <span className={lp.cjTopBtn}><Settings /></span>
              <span className={lp.cjUser}><i>U</i>{p("cjExpert")}<ChevronDown /></span>
            </div>

            <div className={lp.cjHead}>
              <div className={lp.cjCrumbs}>
                <span>{h("premium.menuClients")}</span>
                <span>{d("hero.badge")}</span>
                <span>{d("tab.yolculuk")}</span>
                <em className={lp.cjEdit}><Pencil />{p("cjEdit")}</em>
              </div>
              <div className={lp.cjWho}>
                <span className={lp.cjAvatar}>Ö</span>
                <div>
                  <p className={lp.cjName}>{p("cjClientName")}</p>
                  <p className={lp.cjSub}>{d("hero.subtitle")}</p>
                </div>
              </div>
              <div className={lp.cjInfo}>
                {info.map((f) => (
                  <div key={f.label} style={{ "--acc": f.acc } as React.CSSProperties}>
                    <f.Icon />
                    <span>
                      <small>{f.label}</small>
                      <b>{f.value}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={lp.cjTabs}>
              {tabs.map((tb) => (
                <span key={tb.k} className={tb.k === "yolculuk" ? lp.cjTabOn : undefined} style={{ "--acc": tb.acc } as React.CSSProperties}>
                  {d(`tab.${tb.k}`)}
                </span>
              ))}
              <span className={lp.cjWord}>{d("report.wordReport")}</span>
            </div>

            <div className={lp.cjCard}>
              <p className={lp.cjCardTitle}><Sparkles />{p("cjSummaryTitle")}</p>
              <div className={lp.cjStats}>
                {stats.map((s) => (
                  <div key={s.k} style={{ "--acc": s.acc, "--tint": s.tint, "--pct": `${s.pct}%` } as React.CSSProperties}>
                    <span className={lp.cjStatIcon}><s.Icon /></span>
                    <span className={lp.cjStatText}>
                      <small>{y(`summary.${s.k}`)}</small>
                      <b>{s.v}</b>
                    </span>
                    <i className={lp.cjBar} />
                  </div>
                ))}
              </div>
            </div>

            <div className={lp.cjAlert}>
              <span className={lp.cjAlertIcon}><TriangleAlert /></span>
              <span>
                <b>{y("criticalBanner.count", { count: 1 })}</b>
                <small>{d("hero.unpaid")}</small>
              </span>
              <em>{p("cjDetail")}<ArrowRight /></em>
            </div>

            <div className={lp.cjDuo}>
              <div className={lp.cjCard}>
                <p className={lp.cjCardTitle}><Activity />{y("lifeScore.title")}</p>
                <div className={lp.cjScore}>
                  <div className={lp.cjRing} style={{ "--pct": `${(done / criteria.length) * 100}%` } as React.CSSProperties}>
                    <b>{done}/{criteria.length}</b>
                    <small>{y("scoreStage.aktifTakip")}</small>
                  </div>
                  <ul className={lp.cjCriteria}>
                    {criteria.map((c) => (
                      <li key={c} className={missing.includes(c) ? lp.cjMiss : undefined}>
                        {missing.includes(c) ? <Circle /> : <CircleCheck />}
                        {y(`criteria.${c}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className={lp.cjScoreFoot}>{y("lifeScore.criteriaProgress", { completed: done, total: criteria.length })}</p>
              </div>

              <div className={`${lp.cjCard} ${lp.cjMissing}`}>
                <p className={lp.cjCardTitle}>
                  <TriangleAlert />
                  {y("eksikAlanlar.title")}
                  <em>{y("eksikAlanlar.count", { count: missing.length })}</em>
                </p>
                <ul>
                  {missing.map((m) => (
                    <li key={m}><Pencil />{y(`missing.${m}`)}</li>
                  ))}
                </ul>
              </div>
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
