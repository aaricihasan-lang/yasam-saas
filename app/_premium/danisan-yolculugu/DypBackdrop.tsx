import styles from "./dyp.module.css";

/**
 * Danışan Yolculuğu zemini — kurumsal revizyon (2026-10-23): yalnız çok silik mavi/petrol geçişi.
 * Dalga, nokta dokusu ve animasyon YOK; içerik yok, tıklanamaz. Sayfa kökünün ilk çocuğu olarak konur.
 */
export function DypBackdrop() {
  return <div className={styles.backdrop} aria-hidden />;
}
