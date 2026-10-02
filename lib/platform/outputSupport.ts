/**
 * Çıktı (Word / PDF / PNG / TXT / JSON / yazdır) CTA'ları için YETENEK BAZLI görünürlük —
 * SSR-güvenli, yan-etkisiz saf yardımcılar (plan §4.6, owner kararı 10).
 *
 * KURAL: yalnız ÇALIŞMAYAN CTA gizlenir. "Dokunmatik = gizle" kuralı YOKTUR.
 *   (1) Tüm Android (Chrome + WebView): Word (.docx) gizli — sunucu Word route'ları zaten
 *       androidWordGuard ile 403 döner. Sınıf: `.no-android` (html[data-android]).
 *   (2) Android UYGULAMA WebView'i (UA `YasamSistemiAndroid/` soneki veya `; wv)` işareti —
 *       lib/usage/clientContext.ts tespitiyle tutarlı): blob:/data: indirme, window.print,
 *       window.open(blob) mekanizmalı çıktılar gizli. Sınıf: `.no-android-app`
 *       (html[data-android-app]).
 *       İSTİSNA: Anamnez boş + dolu PDF Android'de GÖRÜNÜR kalır (owner kararı 11/K8).
 *   (3) iOS / Android Chrome / diğer mobil tarayıcılar: PDF/PNG/görüntüle/indir/yazdır
 *       GÖRÜNÜR kalır.
 *   (4) Kullanıcı dosyası erişimi (kişisel arşiv, ekler; signed URL) → her yerde görünür.
 *
 * Gizleme iki katmanlıdır: SSR'da `<html data-android data-android-app>` + globals.css
 * kuralı (hydration öncesi flash yok) ve istemcide mevcut `useIsAndroid` /
 * `useIsAndroidApp` guard'ları (defense-in-depth; render edilmez).
 */
import { isAndroidUserAgent } from "@/lib/platform/android";

/** Tüm Android'de gizlenecek öğe sınıfı (Word CTA'ları). */
export const NO_ANDROID_CLASS = "no-android";
/** Yalnız Android uygulama WebView'inde gizlenecek öğe sınıfı (blob/print çıktıları). */
export const NO_ANDROID_APP_CLASS = "no-android-app";

/** `<html>` üzerindeki SSR işaret attribute'ları (globals.css kuralıyla eşleşir). */
export const ANDROID_HTML_ATTR = "data-android";
export const ANDROID_APP_HTML_ATTR = "data-android-app";

// lib/usage/clientContext.ts ile AYNI desenler (harness tutarlılığı doğrular).
const ANDROID_APP_SUFFIX = /\bYasamSistemiAndroid\//;
const ANDROID_WEBVIEW_MARK = /;\s*wv\)/i;

/** Saf UA testi: Android uygulama WebView'i mi? (sonek veya `; wv)`). UA yoksa false. */
export function isAndroidAppUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").slice(0, 1024);
  return ANDROID_APP_SUFFIX.test(ua) || ANDROID_WEBVIEW_MARK.test(ua);
}

/** Tarayıcıda çalışırken Android uygulama WebView'i mi? navigator yoksa (SSR) false. */
export function isAndroidAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return isAndroidAppUserAgent(navigator.userAgent);
}

/** Sunucu UA'sından `<html>` işaretleri. App WebView her zaman Android sayılır. */
export function platformFlags(userAgent: string | null | undefined): { android: boolean; androidApp: boolean } {
  const androidApp = isAndroidAppUserAgent(userAgent);
  return { android: androidApp || isAndroidUserAgent(userAgent), androidApp };
}

/**
 * Çıktı türleri:
 *   - "word":        .docx (sunucu veya istemci üretimi) → tüm Android'de gizli.
 *   - "client-blob": istemcide blob:/data: indirme (TXT/PNG/JSON/istemci PDF) → app'te gizli.
 *   - "print":       window.print → app'te gizli.
 *   - "blob-open":   window.open(blob:) / <object data=blob:> önizleme → app'te gizli.
 *   - "anamnez-pdf": Anamnez boş/dolu PDF → HER YERDE görünür (K8 istisnası).
 *   - "user-file":   kullanıcı dosyası (signed URL / ek) → her yerde görünür (kategori B).
 */
export type OutputKind = "word" | "client-blob" | "print" | "blob-open" | "anamnez-pdf" | "user-file";

export type OutputVisibility = {
  /** Bu UA'da CTA gösterilmeli mi? */
  visible: boolean;
  /** CTA öğesine eklenecek SSR gizleme sınıfı ("" = sınıf gerekmez). */
  hideClass: "" | typeof NO_ANDROID_CLASS | typeof NO_ANDROID_APP_CLASS;
};

/** Türe göre SSR gizleme sınıfı (UA'dan bağımsız). */
export function outputHideClass(kind: OutputKind): OutputVisibility["hideClass"] {
  switch (kind) {
    case "word":
      return NO_ANDROID_CLASS;
    case "client-blob":
    case "print":
    case "blob-open":
      return NO_ANDROID_APP_CLASS;
    case "anamnez-pdf":
    case "user-file":
      return "";
  }
}

/** Saf karar tablosu (harness + sunucu tarafı kullanım için). */
export function outputVisibility({
  ua,
  kind,
}: {
  ua: string | null | undefined;
  kind: OutputKind;
}): OutputVisibility {
  const flags = platformFlags(ua);
  const hideClass = outputHideClass(kind);
  const visible =
    hideClass === NO_ANDROID_CLASS ? !flags.android
      : hideClass === NO_ANDROID_APP_CLASS ? !flags.androidApp
        : true;
  return { visible, hideClass };
}
