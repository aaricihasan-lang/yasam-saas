"use client";

/**
 * Yaşam Analiz Merkezi — ORTAK modül kartı (Numeroloji / Human Design / Gökyüzü Atlası).
 *
 * Sayfa yalnız variant + başlık + açıklama + adres verir; görünüm tek kaynaktan gelir:
 *   renk/zemin/gölge  → analysisModuleThemes.ts
 *   hareket ayarları  → analysisModuleMotion.ts (aç/kapa, hız, eğim, parallax, ışıma, hover)
 *   ölçü/3D/keyframes → AnalysisModuleCard.module.css
 *   ikon + dekor      → moduleArtwork.tsx (katmanlar + variant'a özgü animasyon atamaları)
 * Kartın tamamı tek bağlantıdır (ayrı CTA / rozet yok). Dekor tamamen satır içi SVG (görsel dosyası yok) ve
 * ekran okuyucudan gizli; erişilebilir ad = başlık + açıklama.
 *
 * 3D hover: imleç konumu CSS değişkenlerine yazılır (React yeniden çizimi yok, rAF ile en çok kare başına bir kez);
 * dekor katmanları bu değerle farklı derinliklerde kayar. Yalnız fare/kalem imlecinde; dokunmatikte ve "hareketi
 * azalt" açıkken eğim uygulanmaz (CSS de ayrıca kapatır). Sürekli dekor animasyonları yalnız CSS'tir (JS döngüsü
 * yok) ve kart ekranda değilken IntersectionObserver ile duraklatılır.
 */
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { useCallback, useEffect, useId, useRef, type CSSProperties, type PointerEvent } from "react";
import { ANALYSIS_CARD_MOTION as MOTION, motionCssVars } from "./analysisModuleMotion";
import { ANALYSIS_MODULE_THEMES, themeCssVars, type AnalysisModuleVariant } from "./analysisModuleThemes";
import { MODULE_ARTWORK } from "./moduleArtwork";
import styles from "./AnalysisModuleCard.module.css";

const serif = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["600"],
  variable: "--amc-serif",
  display: "swap",
});

const TILT_PROPS = ["--amc-rx", "--amc-ry", "--amc-px", "--amc-py", "--amc-gx", "--amc-gy"] as const;

export interface AnalysisModuleCardProps {
  variant: AnalysisModuleVariant;
  title: string;
  description: string;
  href: string;
  /** Üst küçük etiket (referans tasarım: "Yaşam Sistemi"). */
  eyebrow?: string;
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
  testId,
}: AnalysisModuleCardProps) {
  const theme = ANALYSIS_MODULE_THEMES[variant];
  const { Icon, Art } = MODULE_ARTWORK[variant];
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLAnchorElement>(null);
  const frame = useRef<number | null>(null);

  // Ekran dışındaki kartın sürekli animasyonları duraklar (CSS: data-inview≠"true" → paused).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.inview = "true";
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      el.dataset.inview = entry.isIntersecting ? "true" : "false";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const handleMove = useCallback((e: PointerEvent<HTMLAnchorElement>) => {
    if (!MOTION.tilt || e.pointerType === "touch") return;
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { clientX, clientY } = e;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const x = clientX - r.left;
      const y = clientY - r.top;
      const px = Math.min(Math.max(x / r.width - 0.5, -0.5), 0.5);
      const py = Math.min(Math.max(y / r.height - 0.5, -0.5), 0.5);
      el.dataset.tilting = "true";
      el.style.setProperty("--amc-rx", `${(-py * 2 * MOTION.tiltMaxX).toFixed(2)}deg`);
      el.style.setProperty("--amc-ry", `${(px * 2 * MOTION.tiltMaxY).toFixed(2)}deg`);
      el.style.setProperty("--amc-px", px.toFixed(3));
      el.style.setProperty("--amc-py", py.toFixed(3));
      el.style.setProperty("--amc-gx", `${x.toFixed(0)}px`);
      el.style.setProperty("--amc-gy", `${y.toFixed(0)}px`);
    });
  }, []);

  const handleLeave = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const el = ref.current;
    if (!el) return;
    delete el.dataset.tilting;
    for (const p of TILT_PROPS) el.style.removeProperty(p);
  }, []);

  const [before, accent, after] = splitTitle(title, theme.titleAccent);

  return (
    <Link
      ref={ref}
      href={href}
      className={`${styles.card} ${serif.variable}`}
      style={{ ...themeCssVars(theme), ...motionCssVars(MOTION) } as CSSProperties}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      data-variant={variant}
      data-ambient={MOTION.ambient ? "on" : "off"}
      data-testid={testId}
    >
      <span className={styles.art} aria-hidden="true">
        <Art gid={gid} />
      </span>
      <span className={styles.scrim} aria-hidden="true" />
      <span className={styles.glare} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.header} aria-hidden="true">
          <span className={styles.icon}>
            <Icon />
          </span>
          <span className={styles.eyebrow}>{eyebrow}</span>
        </div>
        <h2 className={styles.title}>
          {before}
          {accent ? <span className={styles.accent}>{accent}</span> : null}
          {after}
        </h2>
        <p className={styles.body}>{description}</p>
      </div>
    </Link>
  );
}
