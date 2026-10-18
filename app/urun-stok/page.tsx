import Link from "next/link";
import KritikStokRozeti from "./KritikStokRozeti";
import styles from "@/app/_premium/urun-stok/urunStok.module.css";

// 2026-10-18 premium görsel entegrasyon (owner onaylı prototip 99a1ca7): başlık / açıklama / adres aynen;
// yalnız görünüm değişti (kart görseli = public/premium/urun-stok/<art>.webp).
const hubModules = [
  {
    title: "Tüm Ürünler",
    desc: "Doğaltaş, yağ, sabun, krem, tespih ve diğer tüm ürünleri tek listede görüntüleyin.",
    art: "tum-urunler",
    href: "/urun-stok/canli-stok",
  },
  {
    title: "Doğaltaş Ürün/Stok",
    desc: "Bileklik, dizi, kolye ve ham taş stokları; maliyet ve satış fiyatı.",
    art: "dogaltas",
    href: "/urun-stok/dogaltas",
  },
  {
    title: "Yağ Ürün/Stok",
    desc: "Uçucu yağ, sabit yağ ve karışım yağ ürünleri.",
    art: "yag",
    href: "/urun-stok/yag",
  },
  {
    title: "Sabun / Krem Ürünleri",
    desc: "Doğal sabun, krem ve bakım ürünleri stok yönetimi.",
    art: "sabun-krem",
    href: "/urun-stok/sabun-krem",
  },
  {
    title: "Tespih / Takı / Aksesuar",
    desc: "Tespih, bileklik, kolye ve aksesuar ürün stokları.",
    art: "tespih-taki",
    href: "/urun-stok/aksesuar",
  },
  {
    title: "Satış & Fiyatlandırma",
    desc: "Sepet, kur, maliyet, kâr hesabı ve satış kaydı.",
    art: "satis-fiyat",
    href: "/urun-stok/satis-fiyatlandirma",
  },
  {
    title: "Satış Geçmişi",
    desc: "Satış raporları, kâr analizi ve satın alma karar destek merkezi.",
    art: "satis-gecmisi",
    href: "/urun-stok/satis-gecmisi",
  },
  {
    title: "Diğer Ürünler",
    desc: "Kategoriye sığmayan tüm özel ürünler, farklı satış kalemleri ve serbest ürün stokları.",
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
  const size = ART_SIZE[item.art];
  return (
    <Link href={item.href} className={styles.card} data-card={item.art}>
      <span className={styles.cardArt} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/premium/urun-stok/${item.art}.webp`} width={size.w} height={size.h} alt="" decoding="async" draggable={false} />
        <span className={styles.sheen} />
      </span>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        <p className={styles.cardDesc}>{item.desc}</p>
      </div>
    </Link>
  );
}

export default function UrunStokHubPage() {
  return (
    <main className={styles.page}>
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
            <span className={styles.tA}>Ürün</span> <span className={styles.tAmp}>&amp;</span>{" "}
            <span className={styles.tB}>Stok</span> <span className={styles.tC}>Merkezi</span>
          </h1>
          <p className={styles.heroSub}>
            Tüm ürünlerinizi, stoklarınızı, satış ve fiyatlandırma süreçlerinizi tek merkezden yönetin.
          </p>
          <div className={styles.badgeRow}>
            <KritikStokRozeti />
          </div>
        </header>

        <section className={styles.cards} aria-label="Ürün & Stok modülleri">
          {hubModules.map((item) => (
            <HubModuleCard key={item.title} item={item} />
          ))}
        </section>
      </div>
    </main>
  );
}
