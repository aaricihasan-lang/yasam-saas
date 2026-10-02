/**
 * BIO-02 — Çıkışta bellek-içi (modül seviyesi) hassas cache temizliği için kayıt defteri.
 *
 * Modüller kendi temizleyicilerini kaydeder; `clearYasamUser()` çıkışta hepsini çalıştırır.
 * Kaydı olmayan modüller ETKİLENMEZ (davranış değişikliği yalnız kaydedenler için).
 * Temizleyici hatası çıkışı ASLA bloklamaz.
 */
const cleanups = new Set<() => void>();

export function registerLogoutCleanup(fn: () => void): () => void {
  cleanups.add(fn);
  return () => {
    cleanups.delete(fn);
  };
}

export function runLogoutCleanups(): void {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      /* çıkış asla bloklanmaz */
    }
  }
}
