"use client";
import { useSyncExternalStore } from "react";
import { cameraCaptureSupportedClient } from "@/lib/media/cameraCapture";

const emptySubscribe = () => () => {};

/**
 * "Fotoğraf Çek" gösterilebilir mi? SSR + hydration'da false (buton sonradan belirir, flash yok);
 * mount sonrası gerçek cihaz kararı. Ayrıntı: lib/media/cameraCapture.ts.
 */
export function useCameraCapture(): boolean {
  return useSyncExternalStore(emptySubscribe, cameraCaptureSupportedClient, () => false);
}
