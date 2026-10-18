import { EnergyFoldersClient, type EnergyFolder } from "./EnergyFoldersClient";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/enerji-beden/enerjiBeden.module.css";

// 2026-10-18 premium görünüm (owner onaylı prototip v3, b048cee): kart objeleri onaylı referanstan raster görsel;
// "Klasöre Git" butonu YOK, kartın tamamı tek bağlantı. Metinler, adresler ve görünürlük kuralı değişmedi.
const energyFolders: readonly EnergyFolder[] = [
  {
    title: "Biyoenerji",
    desc: "Aura, çakra, imajinasyon ve enerji çalışmaları",
    href: "/dashboard/biyoenerji",
    badge: "Enerji",
    accent: "violet",
    art: { src: "/premium/enerji-beden/biyoenerji.webp", w: 459, h: 293 },
  },
  {
    title: "Refleksoloji",
    desc: "Bölge haritası, atlas ve uygulama sistemi",
    href: "/refleksoloji",
    badge: "Beden",
    accent: "mint",
    art: { src: "/premium/enerji-beden/refleksoloji.webp", w: 411, h: 293 },
  },
  {
    title: "Kupa & Hacamat Terapisi",
    desc: "Vücut nokta atlası, amaç rehberi, kupa teknikleri ve güvenlik sistemi",
    href: "/kupa",
    badge: "Kupa",
    accent: "rose",
    art: { src: "/premium/enerji-beden/kupa.webp", w: 458, h: 293 },
  },
];

export default function EnerjiBedenPage() {
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.scene} aria-hidden>
        <span className={styles.sceneSun} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneLeft}`} src="/premium/enerji-beden/yan-sol.webp" width={135} height={871} alt="" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneRight}`} src="/premium/enerji-beden/yan-sag.webp" width={132} height={871} alt="" decoding="async" />
      </div>

      <div className={styles.inner}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span>YAŞAM SİSTEMİ</span>
          </p>
          {/* Onaylı tipografi: "Beden" yeşil, "&" altın, "Enerji" lila (kart renkleriyle aynı anlam). */}
          <h1 className={styles.heroTitle}>
            <span className={styles.tGreen}>Beden</span> <span className={styles.tGold}>&amp;</span>{" "}
            <span className={styles.tViolet}>Enerji Uygulamaları</span>
          </h1>
          <p className={styles.heroSub}>Beden üzerinde çalışan uygulama ve terapi araçları</p>
        </header>

        <EnergyFoldersClient folders={energyFolders} />
      </div>
    </main>
  );
}
