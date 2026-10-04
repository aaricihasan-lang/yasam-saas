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
 * Kurulu resmî Yaşam Sistemi Android uygulamasının paket adı. Android System WebView, uygulamanın
 * isteklerine (giriş POST'u ve fetch'ler dahil) `X-Requested-With: <paket>` başlığını kendisi ekler —
 * production tanılamasıyla doğrulandı (2026-10-04: admin giriş + oturum istekleri, tümü bu değer).
 */
export const OFFICIAL_ANDROID_PACKAGE = "com.yasamsistemi.app";
export const REQUESTED_WITH_HEADER = "x-requested-with";
const ANDROID_WEBVIEW_UA = /\bAndroid\b[^)]*;\s*wv\)/;

/**
 * SAF resolver: (userAgent, clientHeader, requestedWith) → ClientChannel.
 *
 * `android_app` YALNIZ şu iki kombinasyondan biriyle (her biri İKİ sinyal):
 *   (A) mevcut kurulu uygulama: UA Android WebView (`Android … ; wv)`) VE
 *       `X-Requested-With` = resmî paket adı (`com.yasamsistemi.app`, tam değer);
 *   (B) ileride native güncelleme: UA soneki `YasamSistemiAndroid/<sürüm>` VE `x-yasam-client: android`.
 * Tek sinyal (yalnız `; wv)`, yalnız paket header'ı, başka paket — Instagram/Facebook vb. —, mobil
 * Chrome/Safari) → web kanalı. Kanal yalnız oturum POLİTİKASINI (süre/cihaz sınıfı) seçer; kimlik,
 * rol, tenant veya yetki kanıtı DEĞİLDİR (parola/rol/tenant kontrolleri her istekte aynen geçerli).
 * @param userAgent     request User-Agent
 * @param clientHeader  x-yasam-client header değeri (yoksa null/undefined)
 * @param requestedWith X-Requested-With header değeri (yoksa null/undefined)
 */
export function resolveClientChannel(
  userAgent: string | null | undefined,
  clientHeader: string | null | undefined,
  requestedWith?: string | null,
): ClientChannel {
  const ua = String(userAgent ?? "").slice(0, 1024);
  const hint = String(clientHeader ?? "").trim().toLowerCase();
  const pkg = String(requestedWith ?? "").trim();
  if (pkg === OFFICIAL_ANDROID_PACKAGE && ANDROID_WEBVIEW_UA.test(ua)) return "android_app";
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
