import styles from "./dyp.module.css";

/**
 * Danışan Yolculuğu premium zemini (owner onaylı 3 referans, 2026-10-23): açık mavi · lila · mint ·
 * yumuşak pembe dalgalar + kırık beyaz. Yalnız SABİT dekor — animasyon yok, içerik yok, tıklanamaz.
 * Üst ve alt bant ayrı çizilir → uzun sayfada dalgalar gerilmez. Sayfa kökünün ilk çocuğu olarak konur.
 */
export function DypBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden>
      <svg className={styles.wavesTop} viewBox="0 0 1600 460" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="dyp-w1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#bfe3ff" stopOpacity="0.8" />
            <stop offset="0.5" stopColor="#dcd4ff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#ffd6ea" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="dyp-w2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c6f1e3" stopOpacity="0.7" />
            <stop offset="0.55" stopColor="#e4dcff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#cde4ff" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d="M0 230 C 260 130, 470 320, 760 240 S 1260 100, 1600 200 L 1600 0 L 0 0 Z" fill="url(#dyp-w1)" />
        <path d="M0 350 C 300 260, 520 420, 820 345 S 1330 240, 1600 320 L 1600 262 C 1320 200, 1060 345, 780 292 S 260 222, 0 296 Z" fill="url(#dyp-w2)" />
        <path d="M0 300 C 240 220, 460 360, 720 300 S 1180 200, 1600 250" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="2" fill="none" />
      </svg>
      <svg className={styles.wavesBottom} viewBox="0 0 1600 420" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="dyp-w3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e2d6ff" stopOpacity="0.7" />
            <stop offset="0.5" stopColor="#ffe1f0" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffe6d2" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="dyp-w4" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#cfe8ff" stopOpacity="0.6" />
            <stop offset="0.5" stopColor="#d8f5ea" stopOpacity="0.5" />
            <stop offset="1" stopColor="#e6dcff" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d="M0 420 L 0 170 C 240 100, 520 270, 820 190 S 1330 50, 1600 130 L 1600 420 Z" fill="url(#dyp-w3)" />
        <path d="M0 300 C 280 240, 560 370, 860 300 S 1360 200, 1600 270 L 1600 420 L 0 420 Z" fill="url(#dyp-w4)" />
        <path d="M0 240 C 260 170, 560 300, 860 230 S 1380 140, 1600 200" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" fill="none" />
      </svg>
      <span className={`${styles.dots} ${styles.dotsLeft}`} />
      <span className={`${styles.dots} ${styles.dotsRight}`} />
    </div>
  );
}
