/**
 * Yaşam Analiz Merkezi — ORTAK modül kartı (Numeroloji / Human Design / Yaşam Takvimi · Kozmik Ajanda / Gökyüzü Atlası).
 *
 * 2026-10-21 açık premium görünüm (owner PASS referansı). Sayfa yalnız variant + başlık + açıklama + adres verir;
 * görünüm tek kaynaktan gelir: premium/analizMerkezi.module.css (renkler [data-variant] değişkenleri). Kart zemini
 * referanstan kesilmiş sabit görseldir (kayda / kullanıcıya göre DEĞİŞMEZ); ikon, etiket, başlık, açıklama, durum
 * etiketi ve ok gerçek HTML. Kartın tamamı tek bağlantıdır; dekor ekran okuyucudan gizli, erişilebilir ad = başlık +
 * açıklama (+ durum).
 */
import Link from "next/link";
import { Jost, Playfair_Display } from "next/font/google";
import { ArrowRight, CalendarDays, ChartColumn } from "lucide-react";
import type { ComponentType } from "react";
import styles from "./premium/analizMerkezi.module.css";

const serif = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["600"],
  variable: "--amc-serif",
  display: "swap",
});

const sans = Jost({
  subsets: ["latin", "latin-ext"],
  weight: ["500"],
  variable: "--amc-sans",
  display: "swap",
});

export type AnalysisModuleVariant = "numerology" | "humanDesign" | "cosmicAgenda" | "skyAtlas";

function HumanDesignIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" focusable="false">
      <path d="M12 2.5 L20 12 L12 21.5 L4 12 Z" />
      <path d="M12 7 L16.2 12 L12 17 L7.8 12 Z" strokeOpacity="0.75" />
      <path d="M4 12 H20" strokeOpacity="0.55" />
    </svg>
  );
}

function SkyAtlasIcon() {
  return (
    <svg viewBox="-12 -12 24 24" focusable="false">
      <path d="M0 -11 C0.9 -3 3 -0.9 11 0 C3 0.9 0.9 3 0 11 C-0.9 3 -3 0.9 -11 0 C-3 -0.9 -0.9 -3 0 -11Z" fill="currentColor" />
      <circle cx="7.5" cy="-7.5" r="1.3" fill="currentColor" opacity="0.7" />
      <circle cx="-7" cy="7.5" r="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** Varyanta özgü sabit öğeler: ikon, kart zemini, başlıkta vurgulanan kelime, üst etiketin gösterimi. */
const VARIANTS: Record<AnalysisModuleVariant, { Icon: ComponentType<{ strokeWidth?: number }>; art: string; accent: "none" | "first" | "last"; eyebrow: boolean }> = {
  numerology: { Icon: ChartColumn, art: "kart-numeroloji", accent: "none", eyebrow: true },
  humanDesign: { Icon: HumanDesignIcon, art: "kart-human-design", accent: "last", eyebrow: true },
  cosmicAgenda: { Icon: CalendarDays, art: "kart-kozmik-ajanda", accent: "none", eyebrow: false },
  skyAtlas: { Icon: SkyAtlasIcon, art: "kart-gokyuzu-atlasi", accent: "first", eyebrow: true },
};

export interface AnalysisModuleCardProps {
  variant: AnalysisModuleVariant;
  title: string;
  description: string;
  href: string;
  /** Üst küçük etiket (referans tasarım: "Yaşam Sistemi"). */
  eyebrow?: string;
  /** Sağ üst durum etiketi (ör. Kozmik Ajanda "Aktif"). */
  status?: string;
  /** Sağ alt yön oku (dekor). */
  arrow?: boolean;
  testId?: string;
}

function splitTitle(title: string, accent: "none" | "first" | "last"): [string, string, string] {
  const words = title.trim().split(/\s+/);
  if (accent === "none" || words.length < 2) return ["", "", title];
  if (accent === "first") return ["", words[0], ` ${words.slice(1).join(" ")}`];
  return [`${words.slice(0, -1).join(" ")} `, words[words.length - 1], ""];
}

export default function AnalysisModuleCard({
  variant,
  title,
  description,
  href,
  eyebrow = "Yaşam Sistemi",
  status,
  arrow = false,
  testId,
}: AnalysisModuleCardProps) {
  const v = VARIANTS[variant];
  const { Icon } = v;
  const [before, accent, after] = splitTitle(title, v.accent);

  return (
    <Link href={href} className={`${styles.card} ${serif.variable} ${sans.variable}`} data-variant={variant} data-testid={testId}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sabit dekor zemini; boyutlar CSS ile, dış istek yok */}
      <img className={styles.cardArt} src={`/premium/analiz-merkezi/${v.art}.webp`} alt="" aria-hidden="true" draggable={false} decoding="async" />
      <span className={styles.cardScrim} aria-hidden="true" />
      <span className={styles.cardEdge} aria-hidden="true" />
      <span className={styles.cardSheen} aria-hidden="true" />

      <div className={styles.cardContent}>
        <div className={styles.cardHead} aria-hidden="true">
          <span className={styles.cardIcon}>
            <Icon strokeWidth={2} />
          </span>
          {v.eyebrow ? <span className={styles.cardEyebrow}>{eyebrow}</span> : null}
        </div>
        <h2 className={styles.cardTitle}>
          {before}
          {accent ? <span className={styles.cardAccent}>{accent}</span> : null}
          {after}
        </h2>
        <p className={styles.cardBody}>{description}</p>
      </div>

      {status ? <span className={styles.cardStatus}>{status}</span> : null}
      {arrow ? (
        <span className={styles.cardArrow} aria-hidden="true">
          <ArrowRight strokeWidth={2.5} />
        </span>
      ) : null}
    </Link>
  );
}
