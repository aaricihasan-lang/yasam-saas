/**
 * Yaşam Analiz Merkezi — kompakt üst başlık şeridi (2026-10-16). Yalnız görsel/tipografi; metinler sayfadan gelir.
 * Fontlar next/font ile kendi sunucumuzdan (dış istek yok, CSP uyumlu); Türkçe için latin-ext alt kümesi.
 *   Başlık            → Fraunces (modern, yumuşak serif; opsz/SOFT ekseni)
 *   Etiket + açıklama → Jost (ince, geometrik sans)
 * Dekor statik ve ekran okuyucudan gizli.
 */
import { Brain } from "lucide-react";
import { Fraunces, Jost } from "next/font/google";
import styles from "./AnalysisCenterHero.module.css";

const heroSerif = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT"],
  variable: "--hero-serif",
  display: "swap",
});

const heroSans = Jost({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--hero-sans",
  display: "swap",
});

/** Küçük yıldız detayı (ince halka + dört köşeli parıltı). */
function HeroSpark() {
  return (
    <svg viewBox="-32 -32 64 64" focusable="false">
      <circle r="27" fill="none" stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="0.8" />
      <circle r="19" fill="none" stroke="#d9a95a" strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="1 3.5" strokeLinecap="round" />
      <path d="M0 -12 L2.2 -2.2 L12 0 L2.2 2.2 L0 12 L-2.2 2.2 L-12 0 L-2.2 -2.2 Z" fill="#d9a95a" fillOpacity="0.85" />
      <circle cx="20" cy="-20" r="1.4" fill="#d9a95a" fillOpacity="0.7" />
      <circle cx="-23" cy="13" r="1.1" fill="#a78bfa" fillOpacity="0.7" />
    </svg>
  );
}

export default function AnalysisCenterHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className={`${styles.hero} ${heroSerif.variable} ${heroSans.variable}`}>
      <span className={styles.spark} aria-hidden="true">
        <HeroSpark />
      </span>
      <div className={styles.inner}>
        <div className={styles.lead}>
          <div className={styles.icon} aria-hidden="true">
            <Brain strokeWidth={1.9} />
          </div>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
          </div>
        </div>
        <p className={styles.desc}>{description}</p>
      </div>
    </header>
  );
}
