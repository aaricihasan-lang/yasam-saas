
import BiyoenerjiFolderCards from "./components/BiyoenerjiFolderCards";
import BiyoenerjiGlobalSearch from "./components/BiyoenerjiGlobalSearch";
import { BiyoenerjiDisclaimer } from "./components/BiyoenerjiDisclaimer";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/biyoenerji/biyoenerji.module.css";

// 2026-10-18 premium görünüm (owner onaylı prototip eae69b6). Yalnız görsel: metinler, geri bağlantısı, modül içi
// arama ve sağlık bilgilendirmesi canlıdaki gibi korunur.
export default function BiyoenerjiFolderPage() {
  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      <div className={styles.scene} aria-hidden>
        <span className={styles.sceneSun} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneLeft}`} src="/premium/biyoenerji/yan-sol.webp" width={74} height={921} alt="" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${styles.sceneSide} ${styles.sceneRight}`} src="/premium/biyoenerji/yan-sag.webp" width={55} height={921} alt="" decoding="async" />
      </div>

      <div className={styles.inner}>
        <header className={styles.hero}>
          {/* Başlık hiyerarşisi canlıdaki gibi: h1 = "Yaşam Enerjisi Sistemi", alt başlık = "Biyoenerji" (görünüm premium). */}
          <h1 className={styles.eyebrow}>
            <span>Yaşam Enerjisi Sistemi</span>
          </h1>
          <p className={styles.heroTitle}>
            <span>Biyoenerji</span>
          </p>
          <p className={styles.heroSub}>Enerji anatomisinden tekniklere — tüm çalışma alanları tek merkezde.</p>
        </header>

        <div className={styles.search}>
          <BiyoenerjiGlobalSearch />
        </div>

        <BiyoenerjiFolderCards />

        <div className={styles.disclaimer}>
          <BiyoenerjiDisclaimer />
        </div>
      </div>
    </main>
  );
}
