/**
 * Yaşam Analiz Merkezi — üst başlık paneli. Yalnız görsel/tipografi; metinler sayfadan gelir.
 * 2026-10-21 açık premium görünüm: stil tek kaynakta (premium/analizMerkezi.module.css).
 * Fontlar next/font ile kendi sunucumuzdan (dış istek yok, CSP uyumlu); Türkçe için latin-ext alt kümesi.
 *   Başlık            → Fraunces (modern, yumuşak serif; opsz/SOFT ekseni)
 *   Etiket + açıklama → Jost (ince, geometrik sans)
 * Dekor (silik desen + yıldız) statik ve ekran okuyucudan gizli.
 */
import { Brain } from "lucide-react";
import localFont from "next/font/local";
import styles from "./premium/analizMerkezi.module.css";

// Yerel dosyalar (app/_fonts/FONTLAR.md): Google'ın sunduğu latin + latin-ext içeriğiyle aynı; build'de ağ isteği yok.
const heroSerif = localFont({
  src: "../../_fonts/fraunces.woff2",
  weight: "100 900",
  variable: "--hero-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const heroSans = localFont({
  src: [
    { path: "../../_fonts/jost.woff2", weight: "400", style: "normal" },
    { path: "../../_fonts/jost.woff2", weight: "500", style: "normal" },
  ],
  variable: "--hero-sans",
  display: "swap",
});

/** Sağdaki yıldız detayı (ince halkalar + dört köşeli parıltı). */
function HeroSpark() {
  return (
    <svg viewBox="-42 -42 84 84" focusable="false">
      <circle r="40" fill="rgba(255,255,255,0.35)" stroke="#c4b5fd" strokeOpacity="0.7" strokeWidth="0.8" />
      <circle r="31" fill="none" stroke="#d9a95a" strokeOpacity="0.6" strokeWidth="0.8" strokeDasharray="1 3.5" strokeLinecap="round" />
      <path d="M0 -17 C1 -4 4 -1 17 0 C4 1 1 4 0 17 C-1 4 -4 1 -17 0 C-4 -1 -1 -4 0 -17Z" fill="#d9a95a" />
      <circle cx="28" cy="-28" r="1.6" fill="#d9a95a" fillOpacity="0.8" />
      <circle cx="-33" cy="18" r="1.3" fill="#a78bfa" fillOpacity="0.8" />
    </svg>
  );
}

export default function AnalysisCenterHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className={`${styles.hero} ${heroSerif.variable} ${heroSans.variable}`}>
      <span className={styles.heroPattern} aria-hidden="true" />
      <span className={styles.heroSpark} aria-hidden="true">
        <HeroSpark />
      </span>
      <div className={styles.heroInner}>
        <div className={styles.heroLead}>
          <div className={styles.heroIcon} aria-hidden="true">
            <Brain strokeWidth={1.9} />
          </div>
          <div>
            <p className={styles.heroEyebrow}>{eyebrow}</p>
            <h1 className={styles.heroTitle}>{title}</h1>
          </div>
        </div>
        <p className={styles.heroDesc}>{description}</p>
      </div>
    </header>
  );
}
