"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — kişiselleştirilmiş karşılama (HomeHero yerine; yalnız kişiselleştirme açıkken).
 *
 * P0 son kabul prototipi (js/office.js → hero / heroInner / bgLayer) ile aynı yapı:
 *  - A · İmza Bandı: canlı bant; tema / fotoğraf bandın zemininde.
 *  - B · Dijital Ofis: zemin tüm sayfada (PersonalPageLayer; varsayılan zeminde manzara duvar kâğıdı); karşılama cam bant.
 *  - C · Kartvizit Stüdyo: altın çerçeveli kâğıt plaket + paspartulu fotoğraf çerçevesi ("cerceve" logo bölgesi).
 * Kullanıcı metni React ile kaçışlanır. Görseller yalnız assetSrc (sunucu varlık kimliği → blob: URL) ile gelir.
 * Erişilebilirlik: başlık daima tek <h1 id="home-hero-title">; serbest satırlarda başlık yoksa ekran okuyucuya özel h1.
 * KDO-01: metin renkleri ETKİN görünüm moduna göre bilinen zeminde hesaplanır (lib/workspace/heroColors) ve satır içi
 *   yazılır; zemin bilinmiyorsa (fotoğraf) tarayıcı piksel kapısı çalışır. KDO-03: her satırın kendi hizası.
 * KDO-04: text.surface → yazı alanı zemini (C plaketi / A-B metin paneli), marka paletinden bağımsız.
 */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { heroBackgroundFor, heroPalette, type HeroPalette } from "@/lib/workspace/heroColors";
import { contrastRatio } from "@/lib/workspace/contrast";
import type { EffectiveViewMode } from "@/lib/workspace/viewMode";
import type { HomeView } from "@/lib/workspace/homeView";
import type { TextLine, WorkspaceDesign } from "@/lib/workspace/schema";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { designFacts, photoVars, brandVars, type PwFacts } from "./personalRoot";
import { usePhotoReadability } from "./usePhotoReadability";
import styles from "./personal.module.css";
import rd from "./readability.module.css";

export const HERO_ART = "/premium/ana-sayfa/hero-manzara.webp";
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
const LINE_ALIGN_CLS = { left: styles.lnAlLeft, center: styles.lnAlCenter, right: styles.lnAlRight } as const;
const VALIGN_CLS = { top: styles.vaTop, center: styles.vaCenter, bottom: styles.vaBottom } as const;

/** Fotoğraf: masaüstü / mobil varyant (≤ 640 px), cover + odak + yakınlaştırma (esnetme yok). */
export function PersonalPhoto({ assetId, assetSrc, className, role }: { assetId: string | null; assetSrc: PersonalWorkspace["assetSrc"]; className?: string; role?: "photo" | "backdrop" }) {
  const desk = assetSrc(assetId, "desktop");
  const mob = assetSrc(assetId, "mobile");
  const main = desk ?? mob;
  if (!main) return null;
  return (
    <picture>
      {desk && mob ? <source media="(max-width: 640px)" srcSet={mob} /> : null}
      <img
        className={`${styles.ph} ${className ?? ""}`}
        src={main}
        alt=""
        draggable={false}
        decoding="async"
        data-pw-frame-photo={role === "photo" ? "" : undefined}
        data-pw-frame-backdrop={role === "backdrop" ? "" : undefined}
      />
    </picture>
  );
}

/**
 * C · Kartvizit Stüdyo fotoğraf çerçevesi (Owner kararı 2026-11-02). Ana sayfa ve Kişiselleştirme panelindeki önizleme
 * AYNI bileşeni kullanır → önizleme = kaydedilmiş gerçek görünüm.
 *  - Çerçeveyi Doldur ("fill", eski kayıtların varsayılanı): cover + odak + yakınlaştırma (bugünkü görünüm birebir).
 *  - Fotoğrafı Sığdır ("fit"): görselin TAMAMI, oran korunarak (contain) çerçevede; ölçek bg.frameZoom (1 = tam sığar,
 *    < 1 uzaklaşır, > 1 yakınlaşır), konum odak noktasıyla. Kalan boşluk aynı fotoğrafın yumuşatılmış, hafif örtülü
 *    kopyasıyla dolar (premium paspartu zemini). Görsel hiçbir modda esnetilmez.
 * Kapsayıcı kutu photoVars (--pw-fx/--pw-fy/--pw-mfx/--pw-mfy/--pw-zoom/--pw-fzoom) değişkenlerini taşımalıdır.
 */
export function FramePhoto({ bg, assetSrc }: { bg: WorkspaceDesign["bg"]; assetSrc: PersonalWorkspace["assetSrc"] }) {
  const fit = bg.frameFit === "fit";
  return (
    <div className={`${styles.phLayer} ${fit ? styles.frameFitLayer : ""}`} aria-hidden>
      {fit ? <PersonalPhoto assetId={bg.photoAssetId} assetSrc={assetSrc} className={styles.phBackdrop} role="backdrop" /> : null}
      {fit ? <span className={styles.fitVeil} /> : null}
      <PersonalPhoto assetId={bg.photoAssetId} assetSrc={assetSrc} className={fit ? styles.phFit : undefined} role="photo" />
    </div>
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
  if (f.hasPhoto && forFrame) return <FramePhoto bg={bg} assetSrc={assetSrc} />;
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

function HeroText({ design, firstName, heroDate, pal }: { design: WorkspaceDesign; firstName: string; heroDate: string; pal: HeroPalette | null }) {
  const t = useTranslations("home");
  const tx = design.text;
  const greeting = firstName ? `${t("dashboard.welcomePrefix")} ${firstName}` : t("dashboard.welcomePlain");
  // Zemin biliniyorsa (tema / varsayılan / gece katmanı / yazı zemini) renkler satır içi: CSS kuralları ezemez, mod değişince
  // yeniden hesaplanır. Fotoğrafta (pal=null) CSS + tarayıcı piksel kapısı.
  const c = (v: string | undefined) => (v ? ({ color: v } as CSSProperties) : undefined);
  if (tx.useGreeting) {
    const nameStyle = pal ? ({ backgroundImage: `linear-gradient(95deg, ${pal.name[0]} 0%, ${pal.name[1]} 100%)` } as CSSProperties) : undefined;
    return (
      <>
        <p className={styles.hEyebrow} style={c(pal?.eyebrow)}>{t("premium.eyebrow")}</p>
        <h1 id="home-hero-title" className={styles.hTitle} style={c(pal?.title)}>
          {firstName ? (
            <>
              <span>{t("dashboard.welcomePrefix")}</span>
              <span className={styles.hName} style={nameStyle}>{firstName} ✨</span>
            </>
          ) : (
            <span>{t("dashboard.welcomePlain")}</span>
          )}
        </h1>
        {tx.showDate ? <p className={styles.hDate} style={c(pal?.date)}>{heroDate}</p> : null}
        <p className={styles.hSub} style={c(pal?.sub)}>{t("premium.heroSub")}</p>
      </>
    );
  }
  // Serbest satırlar. Her satır kendi hizasıyla (yoksa ortak hiza — eski kayıtlar aynen).
  const lines = tx.lines.filter((l) => l.text.trim() !== "");
  const firstTitle = lines.findIndex((l) => l.role === "title");
  return (
    <>
      {firstTitle < 0 ? <h1 id="home-hero-title" className={styles.srOnly}>{greeting}</h1> : null}
      {lines.map((l, i) => {
        const style = { "--pw-fs": `${l.size}px`, color: pal ? pal.line(l) : undefined } as CSSProperties;
        const al = l.align ?? tx.align;
        const cls = `${styles.ln} ${ROLE_CLS[l.role]} ${LINE_ALIGN_CLS[al]}`;
        return i === firstTitle ? (
          <h1 key={l.id} id="home-hero-title" className={cls} style={style} data-pw-line-align={al}>{l.text}</h1>
        ) : (
          <p key={l.id} className={cls} style={style} data-pw-line-align={al}>{l.text}</p>
        );
      })}
      {tx.showDate ? <p className={`${styles.ln} ${styles.lnDate} ${LINE_ALIGN_CLS[tx.align]}`} style={c(pal?.date)}>{heroDate}</p> : null}
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
  /** <LogoZone zone="cerceve" …/> — yalnız C düzeninde fotoğraf çerçevesi bölgesi (eski kayıtlar). */
  frameLogoSlot?: ReactNode;
  /** Etkin görünüm modu (kök data-pw-mode); metin renkleri bu moddaki gerçek zemine göre hesaplanır. */
  mode?: EffectiveViewMode;
};

export default function PersonalHero({ design, firstName, heroDate, assetSrc, logoSlot, frameLogoSlot, mode = "day" }: PersonalHeroProps) {
  const f = designFacts(design);
  const vars = { ...photoVars(design.bg), ...brandVars(design.brand) } as CSSProperties;
  const surface = design.text.surface;
  const bgModel = heroBackgroundFor(design, mode);
  const pal = bgModel ? heroPalette(design, bgModel) : null;
  const surfaceTone = surface ? (contrastRatio(surface, "#000000") < 7 ? "dark" : "light") : undefined;
  // Fotoğraf üzerindeki metin: istemci piksel kapısı (C düzeninde metin plakette, fotoğrafın üzerinde değil)
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const rs = usePhotoReadability({
    // Yazı zemini (opak) seçiliyse metin fotoğrafın üzerinde değil → piksel kapısı gerekmez (zemin biliniyor).
    enabled: f.hasPhoto && f.layout !== "C" && !surface,
    scope: f.photoScope ?? "hero",
    tone: f.tone,
    heroRef,
    textRef,
    signature: JSON.stringify([design.layout, design.bg, design.text, design.brand, mode]),
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
    "data-office": f.office ? "1" : undefined,
    "data-surface": surfaceTone,
  };
  const mixed = !design.text.useGreeting && design.text.lines.some((l) => l.align && l.align !== design.text.align);
  const inner = (
    <div className={`${styles.hInner} ${ALIGN_CLS[design.text.align]} ${VALIGN_CLS[design.text.valign]}`}>
      <div
        ref={textRef}
        className={`${styles.hText} ${surface && f.layout !== "C" ? styles.hSurface : ""}`}
        style={{
          ...(rs.applicable && rs.status === "insufficient" ? { textShadow: f.tone === "dark" ? SHADOW_DARK : SHADOW_LIGHT } : {}),
          ...(surface && f.layout !== "C" ? { background: surface } : {}),
        }}
        data-pw-obstacle="hero-text"
        data-pw-mixed={mixed ? "1" : undefined}
        data-pw-text-bg={pal ? pal.bg : undefined}
        data-pw-readability={rs.applicable ? rs.status : undefined}
        data-pw-readability-ratio={rs.applicable && rs.ratio !== null ? String(rs.ratio) : undefined}
        data-pw-readability-alpha={rs.applicable ? String(rs.alpha) : undefined}
      >
        <HeroText design={design} firstName={firstName} heroDate={heroDate} pal={pal} />
        {rs.applicable && rs.alpha > 0 ? (
          <span className={rd.scrim} aria-hidden style={{ "--pw-rd-a": String(rs.alpha), "--pw-rd-c": scrimRgb } as CSSProperties} />
        ) : null}
      </div>
    </div>
  );

  if (f.layout === "C") {
    return (
      <section ref={heroRef} className={`${styles.hero} ${styles.heroC}`} aria-labelledby="home-hero-title" style={vars} {...data}>
        <div className={styles.plaque} style={surface ? ({ background: surface } as CSSProperties) : undefined} data-surface={surfaceTone}>
          {inner}
          {logoSlot}
        </div>
        <div className={styles.artFrame}>
          <div className={styles.mat} data-pw-frame={f.hasPhoto ? design.bg.frameFit : undefined}>
            <BgLayer design={design} f={f} assetSrc={assetSrc} forFrame />
            {frameLogoSlot}
          </div>
        </div>
      </section>
    );
  }
  if (f.page) {
    return (
      <section ref={heroRef} className={`${styles.hero} ${styles.heroB} ${f.office ? styles.isOffice : styles.isCustom}`} aria-labelledby="home-hero-title" style={vars} {...data}>
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
