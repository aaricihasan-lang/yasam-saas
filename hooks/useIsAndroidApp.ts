"use client";
import { useSyncExternalStore } from "react";
import { isAndroidAppClient } from "@/lib/platform/outputSupport";

// UA değişmez → değişiklik yayınlamayan boş subscribe.
const emptySubscribe = () => () => {};

/**
 * Android UYGULAMA WebView'i tespiti (client; UA `YasamSistemiAndroid/` veya `; wv)`).
 * SSR + hydration'da HER ZAMAN false (server snapshot), mount sonrası gerçek değer —
 * hydration uyumsuzluğu oluşmaz. SSR flash'ı `.no-android-app` sınıfı önler; bu hook
 * JS ile alternatif içerik (ör. "uygulamada desteklenmiyor" notu) göstermek içindir.
 *
 * Android Chrome / iOS / masaüstü tarayıcıda false döner (oralarda çıktılar çalışır).
 */
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isAndroidAppClient(), // client snapshot (gerçek UA)
    () => false, // server snapshot (SSR-güvenli varsayılan)
  );
}
