"use client";

import Link from "next/link";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import styles from "../_premium/hd.module.css";
import { useEducationHubCard } from "./useEducationHubCard";

/** Kart görseli (public/premium/human-design/<art>.webp) + doğal boyutu. İlişki kartında yalnız bağlı küreler. */
const ART = {
  hesaplama: [278, 237],
  "bilgi-bankasi": [365, 237],
  "iliski-kureler": [310, 235],
  // Transit kartı: onaylı başlık görselinin (hero-sag) gezegen + güneş kesiti — yeni tasarım varlığı değil.
  "transit-gokyuzu": [310, 235],
} as const;

/** Renkli ikon karoları (owner onaylı referanstaki 3D karolara yakın; çok renkli küçük semboller). */
const TILE = {
  map: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden focusable="false">
      <path d="M3 6.5 8.5 4.5v13L3 19.5z" fill="#6ee7d0" />
      <path d="M8.5 4.5 15 6.5v13l-6.5-2z" fill="#7dd3fc" />
      <path d="M15 6.5 21 4.5v13l-6 2z" fill="#a7f3d0" />
    </svg>
  ),
  stack: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden focusable="false">
      <rect x="4" y="4" width="11" height="11" rx="2" fill="#facc15" />
      <rect x="8" y="8" width="11" height="11" rx="2" fill="#ef4444" opacity=".9" />
      <rect x="11" y="11" width="9" height="9" rx="2" fill="#60a5fa" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden focusable="false">
      <path d="M12 20.5 4.6 13.4A4.7 4.7 0 0 1 12 7.3a4.7 4.7 0 0 1 7.4 6.1z" fill="#fcd34d" />
      <path d="M12 20.5 4.6 13.4A4.7 4.7 0 0 1 8 6" fill="none" stroke="#fff7d1" strokeWidth="1.2" opacity=".8" />
    </svg>
  ),
  orbit: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden focusable="false">
      <ellipse cx="12" cy="12" rx="10" ry="4.6" fill="none" stroke="#a5b4fc" strokeWidth="1.6" transform="rotate(-24 12 12)" />
      <circle cx="12" cy="12" r="4.4" fill="#fcd34d" />
      <circle cx="20.2" cy="8.4" r="2.1" fill="#7dd3fc" />
      <circle cx="4.2" cy="15.8" r="1.5" fill="#f9a8d4" />
    </svg>
  ),
} as const;

export type HdHubModule = {
  title: string;
  desc: string;
  href: string;
  badge: string;
  /** Görsel ton (rozet / ikon karosu / ok rengi). */
  tone: "violet" | "blue" | "purple";
  /** İkon karosu. */
  tile: keyof typeof TILE;
  /** Kart görseli. */
  art: keyof typeof ART;
  /** P2-3: Android'de (Word indirilemez) gösterilecek açıklama; yoksa `desc`. */
  androidDesc?: string;
};

// Owner sınırı: eğim ~2–3°, hafif parallax; dokunmatikte ve "hareketi azalt" açıkken eğim yok.
const TILT_X = 2 * 0.8;
const TILT_Y = 2.2 * 0.8;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py"];

function HubCard({ mod, isAndroid }: { mod: HdHubModule; isAndroid: boolean }) {
  const frame = useRef<number | null>(null);
  const [w, h] = ART[mod.art];

  function onPointerMove(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = Math.min(Math.max((clientX - r.left) / r.width - 0.5, -0.5), 0.5);
      const py = Math.min(Math.max((clientY - r.top) / r.height - 0.5, -0.5), 0.5);
      el.dataset.tilting = "true";
      el.style.setProperty("--rx", `${(-py * 2 * TILT_X).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 2 * TILT_Y).toFixed(2)}deg`);
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    });
  }

  function onPointerLeave(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const el = e.currentTarget;
    delete el.dataset.tilting;
    for (const p of TILT_PROPS) el.style.removeProperty(p);
  }

  return (
    <Link
      href={mod.href}
      className={styles.card}
      data-tone={mod.tone}
      data-art={mod.art}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span className={styles.cardArt} aria-hidden>
        <span className={styles.artLayer}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
          <img src={`/premium/human-design/${mod.art}.webp`} width={w} height={h} alt="" decoding="async" draggable={false} />
        </span>
        <span className={styles.sheen} />
      </span>
      <span className={styles.badge}>{mod.badge}</span>
      <span className={styles.body}>
        <span className={styles.icon} aria-hidden>
          {TILE[mod.tile]}
        </span>
        <h2 className={styles.title}>{mod.title}</h2>
        <p className={styles.desc}>
          {mod.androidDesc ? (
            <>
              <span className="no-android">{mod.desc}</span>
              {isAndroid && mod.androidDesc}
            </>
          ) : (
            mod.desc
          )}
        </p>
      </span>
      <span className={styles.arrow} aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

/**
 * HD hub — AŞAMA 3C çalışma alanı kartları (Human Design Hesaplama + Bilgi Bankası + İlişki ve Grup Analizleri).
 * Eski Kayıtlı Haritalar/Word üst şeridi ve admin-only "Rapor Oluştur" kartı
 * kaldırıldı; Profesyonel Word harita görünümünden, geçmiş raporlar Geçmiş Analizler'den açılır.
 * 2026-10-18 premium görünüm (owner onaylı prototip, tasarım arşivi 1fed59a): kartın tamamı tek bağlantı; href'ler
 * sayfadan gelir (değişmedi).
 */
export function HdHubModules({ modules, educationCard = false }: { modules: readonly HdHubModule[]; educationCard?: boolean }) {
  // P2-3: Android'de Word vaadi metin olarak da gösterilmez (`.no-android` SSR'da gizli).
  const isAndroid = useIsAndroid();
  // FAZ 2-B3: Hazır Eğitim Haritaları kartı yalnız sunucu yoklaması 200 dönerse (owner'ın yetki verdiği eğitmen) eklenir.
  const edu = useEducationHubCard(educationCard);

  return (
    <div className={styles.cards} data-hd-hub>
      {modules.map((mod) => (
        <HubCard key={`${mod.href}:${mod.title}`} mod={mod} isAndroid={isAndroid} />
      ))}
      {edu ? <HubCard key={`${edu.href}:edu`} mod={edu} isAndroid={isAndroid} /> : null}
    </div>
  );
}
