import type { ReactNode } from "react";
import { Layers } from "lucide-react";
import { BiyoenerjiDisclaimer } from "@/app/dashboard/biyoenerji/components/BiyoenerjiDisclaimer";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "./bioKutuphane.module.css";

/**
 * 2026-10-20 — Biyoenerji iç ekranları premium kabuğu (Bilinçaltı Sebepleri, Biyoenerji Seansları, İmajinasyon
 * Kütüphanesi, Sembol Dili Kütüphanesi). Owner GÖRSEL PASS prototipleri (YasamSistemi-Gorsel-Tasarim/biyoenerji-*).
 * Owner kararı: bu ekranlarda üst geri düğmeleri, breadcrumb ve altı sekmeli bölüm gezinmesi YOK — route'lar,
 * yetki kontrolü ve /dashboard/biyoenerji giriş ekranındaki bölüm kartları aynen erişilebilir kalır.
 * Hero görseli sayfaya ait sabit dekordur (kayda göre görsel YOK). Sağlık bilgilendirmesi korunur.
 */
export default function BiyoenerjiPremiumShell({
  badge,
  titleHead,
  titleAccent,
  subtitle,
  heroSrc,
  heroWidth,
  heroHeight,
  children,
}: {
  badge: string;
  /** Başlığın düz kısmı (ör. "Bilinçaltı Sebepleri "); vurgusuz başlıkta tüm başlık. */
  titleHead: string;
  /** Mor vurgulu son kelime (ör. "Kütüphanesi"); yoksa verilmez. */
  titleAccent?: string;
  subtitle: string;
  heroSrc: string;
  heroWidth: number;
  heroHeight: number;
  children: ReactNode;
}) {
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.heroArt}
            src={heroSrc}
            width={heroWidth}
            height={heroHeight}
            alt=""
            aria-hidden
            decoding="async"
            draggable={false}
          />
          <div className={styles.heroBody}>
            <p className={styles.badge}>
              <span className={styles.badgeIcon} aria-hidden>
                <Layers className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
              {badge}
            </p>
            <h1 className={styles.title}>
              {titleHead}
              {titleAccent ? <span className={styles.titleAccent}>{titleAccent}</span> : null}
            </h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        </header>
        <div className="min-w-0">{children}</div>
        <div className={styles.disclaimer}>
          <BiyoenerjiDisclaimer />
        </div>
      </div>
    </main>
  );
}
