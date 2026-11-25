import Link from "next/link";
import { useTranslations } from "next-intl";
import KritikStokRozeti from "./KritikStokRozeti";
import styles from "@/app/_premium/urun-stok/urunStok.module.css";
import { premiumFontVars } from "@/app/_premium/fonts";

// 2026-10-18 premium görsel entegrasyon (owner onaylı prototip 99a1ca7): başlık / açıklama / adres aynen;
// yalnız görünüm değişti (kart görseli = public/premium/urun-stok/<art>.webp).
// I18N: başlık/açıklama stock.hub.cards.<art> (TR birebir).
const hubModules = [
  {
    art: "tum-urunler",
    href: "/urun-stok/canli-stok",
  },
  {
    art: "dogaltas",
    href: "/urun-stok/dogaltas",
  },
  {
    art: "yag",
    href: "/urun-stok/yag",
  },
  {
    art: "sabun-krem",
    href: "/urun-stok/sabun-krem",
  },
  {
    art: "tespih-taki",
    href: "/urun-stok/aksesuar",
  },
  {
    art: "satis-fiyat",
    href: "/urun-stok/satis-fiyatlandirma",
  },
  {
    art: "satis-gecmisi",
    href: "/urun-stok/satis-gecmisi",
  },
  {
    art: "diger-urunler",
    href: "/urun-stok/diger",
  },
] as const;

/** Kart görsellerinin doğal ölçüsü (CLS'siz yerleşim için). */
const ART_SIZE: Record<(typeof hubModules)[number]["art"], { w: number; h: number }> = {
  "tum-urunler": { w: 382, h: 182 },
  dogaltas: { w: 372, h: 182 },
  yag: { w: 371, h: 182 },
  "sabun-krem": { w: 382, h: 182 },
  "tespih-taki": { w: 382, h: 174 },
  "satis-fiyat": { w: 372, h: 174 },
  "satis-gecmisi": { w: 371, h: 174 },
  "diger-urunler": { w: 382, h: 174 },
};

// Owner kararı: "Aktif" rozeti / "Modüle git" butonu yok; kartın tamamı tek bağlantı.
function HubModuleCard({ item }: { item: (typeof hubModules)[number] }) {
  const t = useTranslations("stock.hub");
  const size = ART_SIZE[item.art];
  return (
    <Link href={item.href} className={styles.card} data-card={item.art}>
      <span className={styles.cardArt} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/premium/urun-stok/${item.art}.webp`} width={size.w} height={size.h} alt="" decoding="async" draggable={false} />
        <span className={styles.sheen} />
      </span>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{t(`cards.${item.art}.title`)}</h3>
        <p className={styles.cardDesc}>{t(`cards.${item.art}.desc`)}</p>
      </div>
    </Link>
  );
}

export default function UrunStokHubPage() {
  const t = useTranslations("stock.hub");
  return (
    <main className={`${styles.page} ${premiumFontVars}`}>
      <div className={styles.scene} aria-hidden>
        <span className={styles.sceneSun} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneLeft}`} src="/premium/urun-stok/yan-sol.webp" width={72} height={918} alt="" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneRight}`} src="/premium/urun-stok/yan-sag.webp" width={49} height={918} alt="" decoding="async" />
      </div>

      <div className={styles.inner}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span>Yaşam Sistemi</span>
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.tA}>{t("titleA")}</span> <span className={styles.tAmp}>&amp;</span>{" "}
            <span className={styles.tB}>{t("titleB")}</span> <span className={styles.tC}>{t("titleC")}</span>
          </h1>
          <p className={styles.heroSub}>
            {t("subtitle")}
          </p>
          <div className={styles.badgeRow}>
            <KritikStokRozeti />
          </div>
        </header>

        <section className={styles.cards} aria-label={t("modulesAria")}>
          {hubModules.map((item) => (
            <HubModuleCard key={item.art} item={item} />
          ))}
        </section>
      </div>
    </main>
  );
}
