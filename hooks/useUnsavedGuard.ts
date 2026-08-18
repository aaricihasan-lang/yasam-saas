"use client";

import { useEffect } from "react";

/**
 * Şifa Rehberi — kaydedilmemiş değişiklik koruması (FAZ 3).
 *
 * `dirty` iken tarayıcı sekmesini kapatma / yenileme (beforeunload) native uyarı
 * gösterir. Uygulama-içi bilinen navigasyon (Kapat / Ana Menü / Listeye dön / geri)
 * için çağıran taraf `confirmDiscardIfDirty` ile onay alır.
 *
 * BİLİNÇLİ SADE: history monkey-patch / router hack / popstate interception YOK.
 * Autosave YOK. Yalnız native beforeunload + bilinen aksiyon onayı.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
