"use client";

/**
 * Gökyüzü Atlası — açık premium görünüm bileşenleri (Yeni Analiz · Analiz Arşivi · Bilgi Bankası).
 * Yalnız sunum: gezinme kararları / veri / iş mantığı çağıran sayfada kalır. Stil tek kaynaktan
 * (`atlasPremium.module.css`). Dekor (sahne, gezegenler, zodyak halkası, yıldız tozu) aria-hidden'dır;
 * hareketler CSS (transform/opacity) ve prefers-reduced-motion'da kapanır.
 */
import type { CSSProperties, ReactNode } from "react";
import { ChevronRight, Orbit } from "lucide-react";
import { ATLAS_NAV, type AtlasView } from "../../AtlasShell";
import { atlasDisplay, atlasText } from "../fonts";
import s from "./atlasPremium.module.css";

export { s as ap };

const ART = "/premium/gokyuzu-atlasi";

/** Premium açık görünümü kullanan Atlas görünümleri. */
export const PREMIUM_VIEWS: readonly AtlasView[] = ["new", "archive", "kb"];
export const isPremiumView = (v: AtlasView) => PREMIUM_VIEWS.includes(v);

const SPARKS: CSSProperties[] = [
  { left: "18%", top: "22%", animationDelay: "0s" },
  { left: "44%", top: "12%", animationDelay: "1.4s" },
  { left: "71%", top: "30%", animationDelay: "2.6s" },
  { left: "88%", top: "16%", animationDelay: "3.8s" },
  { left: "62%", top: "64%", animationDelay: "0.8s" },
];

/** Zodyak halkası: ince altın yörünge + 12 burç çentiği (dekoratif; çok yavaş döner). */
function ZodiacRing() {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const pt = (r: number, deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)] as const;
  return (
    <svg viewBox="0 0 400 400" className={s.ringSpin}>
      <g fill="none" stroke="#c99a4b">
        <circle cx="200" cy="200" r="196" strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="200" cy="200" r="186" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2 6" />
        {ticks.map((d) => {
          const major = d % 30 === 0;
          const [x1, y1] = pt(196, d);
          const [x2, y2] = pt(major ? 178 : 190, d);
          return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity={major ? 0.7 : 0.35} strokeWidth={major ? 1.2 : 0.7} />;
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const [x, y] = pt(196, i * 30 + 15);
          return <circle key={i} cx={x} cy={y} r="2.2" fill="#e7c98a" stroke="none" fillOpacity="0.9" />;
        })}
      </g>
    </svg>
  );
}

/** Başlık sahnesi: referans gökyüzü + çark (statik), üstünde süzülen gezegenler, dönen halka ve yıldız tozu. */
function HeroScene({ scene }: { scene: "genel" | "bilgi" }) {
  return (
    <div className={`${s.scene} ${scene === "bilgi" ? s.sceneBilgi : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.sceneImg} src={`${ART}/${scene === "bilgi" ? "ic-sahne-bilgi" : "ic-sahne"}.webp`} width={scene === "bilgi" ? 750 : 852} height={scene === "bilgi" ? 219 : 186} alt="" decoding="async" draggable={false} />
      <div className={s.ring}>
        <ZodiacRing />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${s.planet} ${s.planetA}`} src={`${ART}/ic-gezegen-halka.webp`} width={119} height={107} alt="" decoding="async" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${s.planet} ${s.planetB}`} src={`${ART}/ic-gezegen-mavi.webp`} width={87} height={88} alt="" decoding="async" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${s.planet} ${s.planetC}`} src={`${ART}/ic-kure-altin.webp`} width={78} height={78} alt="" decoding="async" draggable={false} />
      {SPARKS.map((st, i) => (
        <span key={i} className={s.spark} style={st} />
      ))}
    </div>
  );
}

/**
 * Premium başlık: marka (ana ekrana döner) + MEVCUT Atlas sekmeleri (ATLAS_NAV, aynı onNavigate) + owner araçları,
 * ardından görünüm başlığı ve sağ alan (metrikler / eylemler). Yeni gezinme öğesi eklemez.
 */
export function AtlasPremiumHero({
  view,
  onNavigate,
  ownerTools,
  eyebrow,
  title,
  sub,
  aside,
  scene = "genel",
  compact = false,
}: {
  view: AtlasView;
  onNavigate: (v: AtlasView) => void;
  ownerTools?: ReactNode;
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  aside?: ReactNode;
  scene?: "genel" | "bilgi";
  /** Yeni Analiz: çalışma masasına dikey alan kalsın diye daha kısa başlık. */
  compact?: boolean;
}) {
  return (
    <header className={`${atlasDisplay.variable} ${atlasText.variable} ${s.hero} ${compact ? s.heroCompact : ""} [font-family:var(--font-atlas-text)]`} data-testid="atlas-premium-hero">
      <HeroScene scene={scene} />
      <div className={s.heroInner}>
        <div className={s.brandRow}>
          <button type="button" onClick={() => onNavigate("home")} className={s.brand} title="Gökyüzü Atlası ana ekranı">
            <span className={s.brandMark}>
              <Orbit className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className={s.brandSmall}>YAŞAM SİSTEMİ · ASTROLOJİ</span>
              <span className={s.brandName}>GÖKYÜZÜ ATLASI</span>
            </span>
          </button>
          <nav aria-label="Gökyüzü Atlası" className={s.nav}>
            {ATLAS_NAV.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={view === key ? "page" : undefined}
                onClick={() => onNavigate(key)}
                className={`${s.navBtn} ${view === key ? s.navBtnActive : ""} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6f55c9]`}
              >
                <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          {/* ml-auto: dar ekranda yeni satıra inse de sağa yaslı → sağa hizalı açılır menü ekran içinde kalır. */}
          {ownerTools ? <span className="ml-auto flex shrink-0">{ownerTools}</span> : null}
        </div>
        <div className={s.titleBlock}>
          <div className="min-w-0">
            {eyebrow ? <p className={s.eyebrow}>{eyebrow}</p> : null}
            <h2 className={s.title}>{title}</h2>
            {sub ? <p className={s.sub}>{sub}</p> : null}
          </div>
          {aside ? <div className={s.heroAside}>{aside}</div> : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Yeni Analiz bağlam satırı (owner 2026-10-23): üstte yalnız ince kimlik — "Gökyüzü Atlası › Yeni Analiz".
 * Marka Atlas ana ekranına döner (Analiz Arşivi / Bilgi Bankası oradan); sekme / eylem grubu yok. Statik.
 */
export function AtlasWorkBar({ onNavigate }: { onNavigate: (v: AtlasView) => void }) {
  return (
    <nav aria-label="Konum" className={`${atlasText.variable} ${s.workBar} [font-family:var(--font-atlas-text)]`} data-testid="atlas-workbar">
      <div className={s.workBarInner}>
        <button type="button" onClick={() => onNavigate("home")} className={`${s.workBrand} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6f55c9]`} title="Gökyüzü Atlası ana ekranı">
          <Orbit className="h-3.5 w-3.5" aria-hidden="true" />
          Gökyüzü Atlası
        </button>
        <ChevronRight className={`${s.workSep} h-3.5 w-3.5`} aria-hidden="true" />
        <h1 className={s.workTitle}>Yeni Analiz</h1>
      </div>
    </nav>
  );
}

export function AtlasMetrics({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <div className={s.metrics} style={{ "--ap-cols": columns } as CSSProperties} data-testid="atlas-archive-metrics">
      {children}
    </div>
  );
}

export function AtlasMetric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className={s.metric}>
      <span className={s.metricIcon} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`${s.metricLabel} block`}>{label}</span>
        <span className={`${s.metricValue} block`}>{value}</span>
      </span>
    </div>
  );
}

/** Premium boş durum: isteğe bağlı sayfa düzeyi sabit çizim (kayda göre değişmez) + simge + metin + eylemler. */
export function AtlasEmpty({ art, icon, title, text, actions, testId }: { art?: "bilgi"; icon?: ReactNode; title: ReactNode; text?: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <div className={s.empty} data-testid={testId}>
      {art === "bilgi" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.emptyArt} src={`${ART}/ic-bilgi-bos.webp`} width={730} height={310} alt="" aria-hidden="true" decoding="async" draggable={false} />
      ) : null}
      {icon ? (
        <span className={s.emptyIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className={s.emptyTitle}>{title}</p>
      {text ? <p className={s.emptyText}>{text}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
