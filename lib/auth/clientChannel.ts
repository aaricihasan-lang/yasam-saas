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
 * Eski/analitik ipucu değerleri — yalnız usage360 "türetilmiş Android" sınıfı için okunur.
 * OTURUM sınıflandırması bunları TEK BAŞINA kabul ETMEZ (aşağıdaki iki-sinyal kuralı).
 */
const ANDROID_APP_TOKENS = new Set(["android", "android-app", "android-webview", "yasam-android"]);

/** Resmi uygulama UA soneki: `YasamSistemiAndroid/<sürüm>` (ör. YasamSistemiAndroid/2.4.1). */
export const ANDROID_APP_UA_SUFFIX = /\bYasamSistemiAndroid\/\d+(?:\.\d+){0,3}\b/;

/** Header bir Android ipucu mu? (analitik; oturum/yetki kararı DEĞİL) */
export function isAndroidChannelHint(clientHeader: string | null | undefined): boolean {
  const hint = String(clientHeader ?? "").trim().toLowerCase();
  return hint !== "" && ANDROID_APP_TOKENS.has(hint);
}

/**
 * SAF resolver: (userAgent, clientHeader) → ClientChannel.
 *
 * OTURUM MODELİ v2 (owner kararı): `android_app` YALNIZ İKİ SİNYAL BİRLİKTE varsa —
 *   (1) UA'da resmi sonek `YasamSistemiAndroid/<sürüm>` VE (2) `x-yasam-client: android` (tam değer).
 * Tek sinyal (yalnız UA / yalnız header / `; wv)` WebView işareti) → web kanalı. Kanal yalnız
 * oturum POLİTİKASINI (süre/cihaz sınıfı) seçer; rol/tenant/yetki kanıtı DEĞİLDİR.
 * @param userAgent    request User-Agent
 * @param clientHeader x-yasam-client header değeri (yoksa null/undefined)
 */
export function resolveClientChannel(
  userAgent: string | null | undefined,
  clientHeader: string | null | undefined,
): ClientChannel {
  const ua = String(userAgent ?? "").slice(0, 1024);
  const hint = String(clientHeader ?? "").trim().toLowerCase();
  if (hint === "android" && ANDROID_APP_UA_SUFFIX.test(ua)) return "android_app";

  // İşaret yok/eksik → UA-parse platform'a göre web kanalı (güvenli fallback).
  switch (classifyDeviceType(ua)) {
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
