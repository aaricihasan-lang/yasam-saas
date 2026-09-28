/**
 * USAGE360 — İSTEMCİ BAĞLAMI NORMALİZASYONU (saf; sunucuda çağrılır).
 *
 * Ham User-Agent ve konum başlıklarından YALNIZ aile düzeyinde bilgi çıkarır; ham UA,
 * IP ve başlıkların kendisi hiçbir yere yazılmaz (bu modül IP başlıklarını OKUMAZ bile).
 * Kanal/cihaz bilgisi yalnız analitik etikettir — kimlik/yetki kararı için KULLANILMAZ.
 *
 * Android tanımlama önceliği:
 *   1) UA soneki `YasamSistemiAndroid/<versionName>` → android_app (+ app_version). Resmî yöntem;
 *      WebView'de UA her isteğe (navigasyon + fetch/XHR) eklenir.
 *   2) Sonek yoksa Android WebView işareti (`; wv)`) veya eski `x-yasam-client` ipucu →
 *      android_webview_derived (TÜRETİLMİŞ; kesin değildir). `loadUrl(url, headers)` ile
 *      eklenen başlık sayfa-içi fetch'e taşınmadığı için başlık tek başına güvenilir değildir.
 *   3) Aksi halde mevcut classifyDeviceType → desktop_web / mobile_web / tablet_web.
 */
import { classifyDeviceType } from "@/lib/auth/sessionLimits";
import { resolveClientChannel, CLIENT_CHANNEL_HEADER } from "@/lib/auth/clientChannel";
import type { UsageBrowserFamily, UsageChannel, UsageOsFamily } from "@/lib/usage/usageTaxonomy";

export type UsageClientContext = {
  channel: UsageChannel;
  osFamily: UsageOsFamily;
  browserFamily: UsageBrowserFamily;
  appVersion: string | null;
  country: string | null;
  city: string | null;
};

const ANDROID_APP_SUFFIX = /\bYasamSistemiAndroid\/([0-9A-Za-z._-]{1,32})/;
const ANDROID_WEBVIEW_MARK = /;\s*wv\)/i;

function resolveOsFamily(ua: string): UsageOsFamily {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/cros/i.test(ua)) return "chromeos";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";
  return "other";
}

function resolveBrowserFamily(ua: string, isWebView: boolean): UsageBrowserFamily {
  if (isWebView) return "webview";
  if (/edg(e|a|ios)?\//i.test(ua)) return "edge";
  if (/samsungbrowser\//i.test(ua)) return "samsung";
  if (/opr\/|opera/i.test(ua)) return "opera";
  if (/firefox\/|fxios\//i.test(ua)) return "firefox";
  if (/chrome\/|crios\//i.test(ua)) return "chrome";
  if (/safari\//i.test(ua)) return "safari";
  return "other";
}

/** UA → kanal/aile/app sürümü. Ham UA döndürülmez. */
export function parseUsageUserAgent(
  userAgent: string | null | undefined,
  clientHintHeader?: string | null,
): Pick<UsageClientContext, "channel" | "osFamily" | "browserFamily" | "appVersion"> {
  const ua = String(userAgent ?? "").slice(0, 1024);
  const suffix = ANDROID_APP_SUFFIX.exec(ua);
  if (suffix) {
    return { channel: "android_app", osFamily: "android", browserFamily: "webview", appVersion: suffix[1] };
  }

  const isWebView = ANDROID_WEBVIEW_MARK.test(ua);
  // Eski başlık sözleşmesi geriye-uyumlu okunur ama yalnız TÜRETİLMİŞ sınıf üretir.
  const legacyHint = resolveClientChannel(ua, clientHintHeader) === "android_app";
  if (isWebView || legacyHint) {
    return {
      channel: "android_webview_derived",
      osFamily: "android",
      browserFamily: isWebView ? "webview" : resolveBrowserFamily(ua, false),
      appVersion: null,
    };
  }

  const device = classifyDeviceType(ua);
  const channel: UsageChannel =
    device === "desktop" ? "desktop_web"
      : device === "mobile" ? "mobile_web"
        : device === "tablet" ? "tablet_web"
          : "unknown";
  return { channel, osFamily: resolveOsFamily(ua), browserFamily: resolveBrowserFamily(ua, false), appVersion: null };
}

/** Vercel ülke başlığı → ISO-2 büyük harf; geçersizse null. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== "XX" ? v : null;
}

/** Vercel şehir başlığı (URL-encoded) → güvenli kısa ad; geçersizse null. */
export function normalizeCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v: string;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // NFC: "İ", "ş" gibi harfler birleşik/ayrışık gelse de tek biçime indirgenir.
  v = v.normalize("NFC").replace(/[ \t]+/g, " ").trim();
  // Şehir adı yalnız harf (her alfabe; Türkçe Ç Ğ İ I ı Ö Ş Ü dahil) / birleşik işaret /
  // boşluk / . ' ’ - içerir. Başka karakter (rakam, <, >, _, @, /, satır sonu, kontrol
  // karakteri …) veya 64'ten uzun değer → değer REDDEDİLİR (kırpılıp "temizlenmiş" bir
  // serbest metin saklanmaz). DB CHECK ile aynı 64 sınırı.
  if (!v || v.length > 64 || !/^[\p{L}\p{M} .'’-]+$/u.test(v)) return null;
  return v;
}

/** İstek başlıklarından Usage360 bağlamı. IP başlıkları OKUNMAZ. */
export function resolveUsageClientContext(headers: Headers): UsageClientContext {
  const parsed = parseUsageUserAgent(headers.get("user-agent"), headers.get(CLIENT_CHANNEL_HEADER));
  return {
    ...parsed,
    country: normalizeCountry(headers.get("x-vercel-ip-country")),
    city: normalizeCity(headers.get("x-vercel-ip-city")),
  };
}
