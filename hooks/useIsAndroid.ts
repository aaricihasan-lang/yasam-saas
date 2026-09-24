"use client";
import { useSyncExternalStore } from "react";
import { isAndroidClient } from "@/lib/platform/android";

// Android değeri sabittir (UA değişmez) → değişiklik yayınlamayan boş subscribe.
const emptySubscribe = () => () => {};

/**
 * Android cihaz tespiti (client). SSR + hydration'da HER ZAMAN false döner
 * (server snapshot), mount sonrası gerçek client değerine geçer — hydration
 * uyumsuzluğu oluşmaz ve effect içinde setState çağrılmaz.
 *
 * Kullanım: Android'de Word (.docx) indirme UI'sini gizlemek için.
 *   const isAndroid = useIsAndroid();
 *   {!isAndroid && <WordDownloadButton />}
 */
export function useIsAndroid(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isAndroidClient(), // client snapshot (gerçek UA)
    () => false, // server snapshot (SSR-güvenli varsayılan)
  );
}
