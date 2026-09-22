/**
 * FAZ 1 / İP-3 — İSTEMCİ KANALI (analitik sınıflandırma).
 *
 * Android WebView uygulamasını mobil tarayıcıdan İLERİYE DÖNÜK ayırt etmek için,
 * oturum oluşturmada saklanan `client_channel` değerini SUNUCUDA türetir.
 *
 * BAĞLAYICI GÜVENLİK NOTU:
 *   Kanal işareti istemciden gelen bir İPUCU'dur (x-yasam-client header). KİMLİK,
 *   TENANT veya YETKİ kanıtı DEĞİLDİR ve hiçbir yetki/erişim kararında kullanılmaz —
 *   yalnız analitik kanal etiketi olarak saklanır. İşaret yoksa/spoof'lansa bile
 *   güvenlik user_sessions token binding + users kaydından gelir (değişmez).
 *
 * Fallback: Android işareti yoksa UA-parse platform'a göre web kanalı seçilir
 * (classifyDeviceType — mevcut platform mantığıyla tutarlı). Geçmiş satırlar bu
 * mekanizmadan ETKİLENMEZ (backfill YOK; kolon NULL kalır).
 */
import { classifyDeviceType } from "@/lib/auth/sessionLimits";

/** Sınırlı, tipli kanal değerleri (migration CHECK ile birebir). */
export const CLIENT_CHANNELS = [
  "desktop_web",
  "mobile_web",
  "tablet_web",
  "android_app",
  "unknown",
] as const;

export type ClientChannel = (typeof CLIENT_CHANNELS)[number];

/** Android wrapper'ın göndereceği HTTP header adı (küçük harf). */
export const CLIENT_CHANNEL_HEADER = "x-yasam-client";

/**
 * Android wrapper sözleşmesi: WebView, her istekte
 *   x-yasam-client: android
 * (veya "android-app"/"android-webview") header'ını enjekte eder. Yalnız bu değerler
 * android_app'e maplenir; bilinmeyen/eksik işaret web fallback'e düşer.
 */
const ANDROID_APP_TOKENS = new Set(["android", "android-app", "android-webview", "yasam-android"]);

/**
 * SAF resolver: (userAgent, clientHeader) → ClientChannel.
 * @param userAgent    request User-Agent (web fallback sınıflandırması için)
 * @param clientHeader x-yasam-client header değeri (yoksa null/undefined)
 */
export function resolveClientChannel(
  userAgent: string | null | undefined,
  clientHeader: string | null | undefined,
): ClientChannel {
  const hint = String(clientHeader ?? "").trim().toLowerCase();
  if (hint && ANDROID_APP_TOKENS.has(hint)) return "android_app";

  // İşaret yok/tanınmıyor → UA-parse platform'a göre web kanalı (güvenli fallback).
  switch (classifyDeviceType(String(userAgent ?? ""))) {
    case "desktop":
      return "desktop_web";
    case "mobile":
      return "mobile_web";
    case "tablet":
      return "tablet_web";
    default:
      return "unknown";
  }
}

/** Değerin geçerli bir kanal olup olmadığı (DB/CHECK savunması ile hizalı). */
export function isClientChannel(v: unknown): v is ClientChannel {
  return typeof v === "string" && (CLIENT_CHANNELS as readonly string[]).includes(v);
}
