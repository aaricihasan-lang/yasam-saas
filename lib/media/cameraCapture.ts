/**
 * Kamera ile çekip yükleme — WEB tarafı yetenek kararı (SSR-güvenli, saf).
 *
 * `<input type="file" accept="image/*" capture="environment">`:
 *   - Android Chrome / iOS Safari: doğrudan arka kamerayı açar → GÖSTERİLİR.
 *   - Masaüstü: kamera akışı yok, yalnız dosya seçici açılır (galeriyle aynı) → GİZLENİR.
 *   - Yaşam Sistemi Android uygulaması (WebView): mevcut native kod (1.9.x) `capture`'ı yok sayar
 *     ve galeriyi açar → "Fotoğraf Çek" yanıltıcı olur → GİZLENİR. Native kamera entegrasyonu
 *     yayınlandığında uygulama User-Agent'ına `YasamCamera/1` ekler (bkz. docs/android-camera-native-contract.md);
 *     o andan itibaren buton otomatik görünür. Web tarafında ek değişiklik gerekmez.
 */
import { isAndroidAppUserAgent } from "@/lib/platform/outputSupport";

/** Native kamera desteği bildiren UA işareti (Android uygulaması ekler). */
export const CAMERA_CAPABILITY_UA_TOKEN = "YasamCamera/1";

export type CameraEnv = {
  userAgent: string;
  /** `(pointer: coarse)` media query sonucu (dokunmatik birincil girdi). */
  coarsePointer: boolean;
};

/** Saf karar: bu ortamda "Fotoğraf Çek" gösterilmeli mi? */
export function cameraCaptureSupported(env: CameraEnv): boolean {
  const ua = env.userAgent.slice(0, 1024);
  if (isAndroidAppUserAgent(ua)) return ua.includes(CAMERA_CAPABILITY_UA_TOKEN);
  if (/android|iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS masaüstü UA'sı (Macintosh) + dokunmatik → kamera var.
  return env.coarsePointer;
}

export function cameraCaptureSupportedClient(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    coarse = false;
  }
  return cameraCaptureSupported({ userAgent: navigator.userAgent || "", coarsePointer: coarse });
}
