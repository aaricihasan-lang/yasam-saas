"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — kişiselleştirilmiş karşılama (HomeHero yerine; yalnız kişiselleştirme açıkken).
 *
 * P0 son kabul prototipi (js/office.js → hero / heroInner / bgLayer) ile aynı yapı:
 *  - A · İmza Bandı: canlı bant; tema / fotoğraf bandın zemininde.
 *  - B · Dijital Ofis: zemin tüm sayfada (PersonalPageLayer); karşılama şeffaf cam bant.
 *  - C · Kartvizit Stüdyo: altın çerçeveli kâğıt plaket + paspartulu fotoğraf çerçevesi ("cerceve" logo bölgesi).
 * Kullanıcı metni React ile kaçışlanır. Görseller yalnız assetSrc (sunucu varlık kimliği → blob: URL) ile gelir.
 * Erişilebilirlik: başlık daima tek <h1 id="home-hero-title">; serbest satırlarda başlık yoksa ekran okuyucuya özel h1.
 */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { heroBackground, resolvedLineColor } from "@/lib/workspace/contrast";
import type { HomeView } from "@/lib/workspace/homeView";
import type { TextLine, WorkspaceDesign } from "@/lib/workspace/schema";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { designFacts, photoVars, brandVars, type PwFacts } from "./personalRoot";
import { usePhotoReadability } from "./usePhotoReadability";
import styles from "./personal.module.css";
import rd from "./readability.module.css";

const HERO_ART = "/premium/ana-sayfa/hero-manzara.webp";
/** Katman tavanında bile hedefe ulaşılamazsa ek yazı gölgesi (tona göre; satır içi → tasarım gölgesini ezer). */
const SHADOW_LIGHT = "0 0 2px rgb(251 250 247 / 0.95), 0 0 10px rgb(251 250 247 / 0.85), 0 0 22px rgb(251 250 247 / 0.6)";
const SHADOW_DARK = "0 0 2px rgb(10 6 24 / 0.95), 0 0 10px rgb(10 6 24 / 0.8), 0 0 22px rgb(10 6 24 / 0.55)";

const ROLE_CLS: Record<TextLine["role"], string> = {
  label: styles.lnLabel,
  title: styles.lnTitle,
  subtitle: styles.lnSubtitle,
  body: styles.lnBody,
  quote: styles.lnQuote,
};
const ALIGN_CLS = { left: styles.alLeft, center: styles.alCenter, right: styles.alRight } as const;
const VALIGN_CLS = { top: styles.vaTop, center: styles.vaCenter, bottom: styles.vaBottom } as const;

/** Fotoğraf: masaüstü / mobil varyant (≤ 640 px), cover + odak + yakınlaştırma (esnetme yok). */
export function PersonalPhoto({ assetId, assetSrc, className }: { assetId: string | null; assetSrc: PersonalWorkspace["assetSrc"]; className?: string }) {
  const desk = assetSrc(assetId, "desktop");
  const mob = assetSrc(assetId, "mobile");
  const main = desk ?? mob;
  if (!main) return null;
  return (
    <picture>
      {desk && mob ? <source media="(max-width: 640px)" srcSet={mob} /> : null}
      <img className={`${styles.ph} ${className ?? ""}`} src={main} alt="" draggable={false} decoding="async" />
    </picture>
  );
}

/** Hazır tema katmanı (yalnız CSS; görsel dosya yok). */
export function ThemeLayer({ theme }: { theme: WorkspaceDesign["bg"]["theme"] }) {
  return (
    <div className={`${styles.thLayer} ${styles[`th_${theme}`] ?? ""}`} aria-hidden>
      <span className={`${styles.thOrb} ${styles.o1}`} />
      <span className={`${styles.thOrb} ${styles.o2}`} />
      <span className={styles.thGrain} />
    </div>
  );
}

/** Zemin katmanı (prototip bgLayer). forFrame: C çerçevesinde varsayılan manzara tam kaplar. */
function BgLayer({ design, f, assetSrc, forFrame = false }: { design: WorkspaceDesign; f: PwFacts; assetSrc: PersonalWorkspace["assetSrc"]; forFrame?: boolean }) {
  const bg = design.bg;
  if (f.hasPhoto) {
    return (
      <>
        <div className={styles.phLayer} aria-hidden>
          <PersonalPhoto assetId={bg.photoAssetId} assetSrc={assetSrc} />
        </div>
        <div className={styles.shade} aria-hidden />
      </>
    );
  }
  if (f.custom && bg.mode === "theme") return <ThemeLayer theme={bg.theme} />;
  return forFrame ? (
    <div className={styles.phLayer} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${styles.ph} ${styles.phManzara}`} src={HERO_ART} alt="" draggable={false} />
    </div>
  ) : (
    <div className={styles.heroArt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO_ART} width={738} height={259} alt="" aria-hidden data-testid="home-hero-glow" />
    </div>
  );
}

function HeroText({ design, firstName, heroDate }: { design: WorkspaceDesign; firstName: string; heroDate: string }) {
  const t = useTranslations("home");
  const tx = design.text;
  const greeting = firstName ? `${t("dashboard.welcomePrefix")} ${firstName}` : t("dashboard.welcomePlain");
  if (tx.useGreeting) {
    return (
      <>
        <p className={styles.hEyebrow}>{t("premium.eyebrow")}</p>
        <h1 id="home-hero-title" className={styles.hTitle}>
          {firstName ? (
            <>
              <span>{t("dashboard.welcomePrefix")}</span>
              <span className={styles.hName}>{firstName} ✨</span>
            </>
          ) : (
            <span>{t("dashboard.welcomePlain")}</span>
          )}
        </h1>
        {tx.showDate ? <p className={styles.hDate}>{heroDate}</p> : null}
        <p className={styles.hSub}>{t("premium.heroSub")}</p>
      </>
    );
  }
  // Serbest satırlar. "Otomatik" renk CSS'ten (ton / görünüm moduna göre); seçilen renk sunucunun kontrast kuralıyla aynı
  // çözümle (contrast.ts → resolvedLineColor) satıra yazılır.
  const bg = heroBackground(design) ?? (design.bg.tone === "dark" ? "#1d1733" : "#fbfaf7");
  const lines = tx.lines.filter((l) => l.text.trim() !== "");
  const firstTitle = lines.findIndex((l) => l.role === "title");
  return (
    <>
      {firstTitle < 0 ? <h1 id="home-hero-title" className={styles.srOnly}>{greeting}</h1> : null}
      {lines.map((l, i) => {
        const style = { "--pw-fs": `${l.size}px`, color: l.color === "auto" ? undefined : resolvedLineColor(design, l, bg) } as CSSProperties;
        const cls = `${styles.ln} ${ROLE_CLS[l.role]}`;
        return i === firstTitle ? (
          <h1 key={l.id} id="home-hero-title" className={cls} style={style}>{l.text}</h1>
        ) : (
          <p key={l.id} className={cls} style={style}>{l.text}</p>
        );
      })}
      {tx.showDate ? <p className={`${styles.ln} ${styles.lnDate}`}>{heroDate}</p> : null}
    </>
  );
}

export type PersonalHeroProps = {
  /** Ana sayfa görünüm nesnesi (resolveHomeView). Karşılama tasarımı `design`'dan çizilir (düzenlemede çalışma kopyası). */
  view: HomeView;
  /** pw.viewDesign */
  design: WorkspaceDesign;
  firstName: string;
  heroDate: string;
  assetSrc: PersonalWorkspace["assetSrc"];
  /** <LogoZone zone="hero" …/> — karşılama bandı / C plaketi içindeki logo bölgesi. */
  logoSlot?: ReactNode;
  /** <LogoZone zone="cerceve" …/> — yalnız C düzeninde fotoğraf çerçevesi bölgesi. */
  frameLogoSlot?: ReactNode;
};

export default function PersonalHero({ design, firstName, heroDate, assetSrc, logoSlot, frameLogoSlot }: PersonalHeroProps) {
  const f = designFacts(design);
  const vars = { ...photoVars(design.bg), ...brandVars(design.brand) } as CSSProperties;
  // Fotoğraf üzerindeki metin: istemci piksel kapısı (C düzeninde metin plakette, fotoğrafın üzerinde değil)
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const rs = usePhotoReadability({
    enabled: f.hasPhoto && f.layout !== "C",
    scope: f.photoScope ?? "hero",
    tone: f.tone,
    heroRef,
    textRef,
    signature: JSON.stringify([design.layout, design.bg, design.text, design.brand]),
  });
  const scrimRgb = f.tone === "dark" ? "18 13 36" : "251 250 247";
  const data = {
    "data-pw-hero": f.layout,
    "data-tone": f.tone,
    "data-shade": f.shade,
    "data-bg": f.bgMode,
    "data-custom": f.custom ? "1" : undefined,
    "data-photo": f.hasPhoto ? "1" : undefined,
    "data-page": f.page ? "1" : undefined,
    "data-branded": f.branded ? "1" : undefined,
  };
  const inner = (
    <div className={`${styles.hInner} ${ALIGN_CLS[design.text.align]} ${VALIGN_CLS[design.text.valign]}`}>
      <div
        ref={textRef}
        className={styles.hText}
        style={rs.applicable && rs.status === "insufficient" ? { textShadow: f.tone === "dark" ? SHADOW_DARK : SHADOW_LIGHT } : undefined}
        data-pw-obstacle="hero-text"
        data-pw-readability={rs.applicable ? rs.status : undefined}
        data-pw-readability-ratio={rs.applicable && rs.ratio !== null ? String(rs.ratio) : undefined}
        data-pw-readability-alpha={rs.applicable ? String(rs.alpha) : undefined}
      >
        <HeroText design={design} firstName={firstName} heroDate={heroDate} />
        {rs.applicable && rs.alpha > 0 ? (
          <span className={rd.scrim} aria-hidden style={{ "--pw-rd-a": String(rs.alpha), "--pw-rd-c": scrimRgb } as CSSProperties} />
        ) : null}
      </div>
    </div>
  );

  if (f.layout === "C") {
    return (
      <section ref={heroRef} className={`${styles.hero} ${styles.heroC}`} aria-labelledby="home-hero-title" style={vars} {...data}>
        <div className={styles.plaque}>
          {inner}
          {logoSlot}
        </div>
        <div className={styles.artFrame}>
          <div className={styles.mat}>
            <BgLayer design={design} f={f} assetSrc={assetSrc} forFrame />
            {frameLogoSlot}
          </div>
        </div>
      </section>
    );
  }
  if (f.page) {
    return (
      <section ref={heroRef} className={`${styles.hero} ${styles.heroB} ${f.custom ? styles.isCustom : styles.isDefault}`} aria-labelledby="home-hero-title" style={vars} {...data}>
        {f.custom ? null : <BgLayer design={design} f={f} assetSrc={assetSrc} />}
        {inner}
        {logoSlot}
      </section>
    );
  }
  return (
    <section
      ref={heroRef}
      className={`${styles.hero} ${styles.heroA} ${f.custom ? styles.isCustom : styles.isDefault} ${f.hasPhoto ? styles.hasPhoto : ""}`}
      aria-labelledby="home-hero-title"
      style={vars}
      {...data}
    >
      <BgLayer design={design} f={f} assetSrc={assetSrc} />
      {inner}
      {logoSlot}
    </section>
  );
}
