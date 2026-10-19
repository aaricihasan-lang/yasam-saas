"use client";

/**
 * Numeroloji giriş ekranı (modül seçici).
 *
 * 2026-10-19 premium görünüm (owner referansı "Mor ve Altın Numeroloji Yaşam Sistemi"; onaylı prototip Aşama 13,
 * d22c74b): yalnız GÖRÜNÜM değişti. Üç giriş (Numeroloji Analizi → /numeroloji/analiz, Kayıtlı Analizler →
 * /numeroloji/liste, Bilgi Bankası → /numeroloji/bilgi-bankasi) ve metinlerin anlamı aynen; erişim kontrolü
 * eskisi gibi alt sayfaların kendi kapılarında. Kart objeleri ve başlık sahneleri onaylı referanstan kesilmiş raster
 * görseller (public/premium/numeroloji); kartın tamamı tek bağlantı.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import { tiltLeave, tiltMove } from "@/app/_premium/enerji-beden/cardTilt";
import styles from "@/app/_premium/numeroloji/numerolojiHub.module.css";

const ICON = {
  sparkle: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </>
  ),
  book: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 9.5C10.5 6 10.5 4 12 2c1.5 2 1.5 4 0 7.5zM12 14.5c1.5 3.5 1.5 5.5 0 7.5-1.5-2-1.5-4 0-7.5zM9.5 12C6 13.5 4 13.5 2 12c2-1.5 4-1.5 7.5 0zM14.5 12c3.5-1.5 5.5-1.5 7.5 0-2 1.5-4 1.5-7.5 0z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

function Icon({ name, size, stroke }: { name: keyof typeof ICON; size: number; stroke: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON[name]}
    </svg>
  );
}

type HubCard = {
  key: "analiz" | "kayitli" | "bilgi";
  href: string;
  title: string;
  desc: string;
  icon: keyof typeof ICON;
  tone: "violet" | "indigo" | "plum";
  art: { w: number; h: number };
  badge?: string;
};

const CARDS: readonly HubCard[] = [
  {
    key: "analiz",
    href: "/numeroloji/analiz",
    title: "Numeroloji Analizi",
    desc: "Ad, soyad ve doğum tarihi ile tam motor çıktısı; sekmeli analiz, premium yaşam haritası görseli ve yüksek çözünürlüklü PNG dışa aktarım tek ekranda.",
    icon: "sparkle",
    tone: "violet",
    art: { w: 250, h: 280 },
    badge: "Buradan başlayın",
  },
  {
    key: "kayitli",
    href: "/numeroloji/liste",
    title: "Kayıtlı Analizler",
    desc: "Kayıtlarınızı listeleyin; ad soyad, doğum tarihi ve kayıt zamanıyla birlikte her kaydı açıp tam metin özetini anında görüntüleyin.",
    icon: "archive",
    tone: "indigo",
    art: { w: 245, h: 336 },
  },
  {
    key: "bilgi",
    href: "/numeroloji/bilgi-bankasi",
    title: "Bilgi Bankası",
    desc: "Numeroloji eğitim notları, açıklamalar, yorum metinleri ve bilgi içeriklerini tek merkezde düzenleyin.",
    icon: "book",
    tone: "plum",
    art: { w: 296, h: 336 },
  },
];

export default function NumerolojiHubPage() {
  return (
    <main className={`${styles.page} ${energyFontVars}`} data-testid="numeroloji-hub">
      <div className={styles.scene} aria-hidden />

      <div className={styles.inner}>
        <header className={styles.hero}>
          <div className={`${styles.heroScene} ${styles.heroLeft}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/premium/numeroloji/hero-sol.webp" width={600} height={320} alt="" decoding="async" draggable={false} />
          </div>
          <div className={`${styles.heroScene} ${styles.heroRight}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/premium/numeroloji/hero-sag.webp" width={632} height={310} alt="" decoding="async" draggable={false} />
          </div>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>
              <span>Yaşam Sistemi</span>
            </p>
            <h1 className={styles.heroTitle}>Numeroloji</h1>
            <p className={styles.heroSub}>
              Yaşam haritanızı hesaplayın, raporunuzu oluşturun ve analizlerinizi saklayın. Modülü seçin.
            </p>
          </div>
        </header>

        <nav className={styles.cards} aria-label="Numeroloji alanları">
          {CARDS.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className={styles.card}
              data-card={card.key}
              data-tone={card.tone}
              onPointerMove={(e) => tiltMove(e, 0.25)}
              onPointerLeave={tiltLeave}
            >
              <span className={styles.cardArt} style={{ aspectRatio: `${card.art.w} / ${card.art.h}` }} aria-hidden>
                <span className={styles.artLayer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/premium/numeroloji/${card.key}.webp`}
                    width={card.art.w}
                    height={card.art.h}
                    alt=""
                    decoding="async"
                    draggable={false}
                  />
                </span>
              </span>
              {card.badge ? <span className={styles.badge}>{card.badge}</span> : null}
              <div className={styles.cardBody}>
                <span className={styles.cardIcon} aria-hidden>
                  <Icon name={card.icon} size={26} stroke={1.8} />
                </span>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDesc}>{card.desc}</p>
              </div>
            </Link>
          ))}
        </nav>

        <p className={styles.footNote}>
          <span className={styles.footIcon} aria-hidden>
            <Icon name="flower" size={20} stroke={1.4} />
          </span>
          Numeroloji — sayıların diliyle kendinizi keşfedin, yaşam haritanızı analiz edin ve bilgiyi tek merkezde yönetin.
        </p>
      </div>
    </main>
  );
}
