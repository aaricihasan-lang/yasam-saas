import DogalDestekCards from "./DogalDestekCards";
import styles from "./dogalDestek.module.css";

// 2026-10-18 premium görünüm (owner onaylı prototip a26807d): aydınlık pastel sahne + serif başlık. Yalnız görsel;
// erişim ModuleRouteGuard (routeModuleAccess /dogal-destek) ve kart görünürlüğü DogalDestekCards'ta değişmedi.
export default function DogalDestekPage() {
  return (
    <main className={styles.page}>
      <div className={styles.scene} aria-hidden>
        <span className={styles.sceneSun} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.sceneSide} ${styles.sceneLeft}`}
          src="/premium/dogal-destek/yan-sol.webp"
          width={104}
          height={916}
          alt=""
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.sceneSide} ${styles.sceneRight}`}
          src="/premium/dogal-destek/yan-sag.webp"
          width={103}
          height={916}
          alt=""
          decoding="async"
        />
      </div>

      <div className={styles.inner}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span>Yaşam Sistemi</span>
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.tA}>Doğal Destek</span> <span className={styles.tAmp}>&amp;</span>{" "}
            <span className={styles.tB}>Rehber</span>
          </h1>
          <p className={styles.heroSub}>
            Doğaltaş, doğal destek yöntemleri, beslenme ve profesyonel başvuru kaynakları
          </p>
        </header>

        <DogalDestekCards />
      </div>
    </main>
  );
}
