"use client";

import { useEffect } from "react";

/**
 * Aromaterapi V2 — C3D kaydedilmemiş değişiklik (dirty) koruması.
 *
 * `dirty` iken tarayıcı sekme kapatma/yenileme öncesi native uyarı gösterir.
 * Salt yan-etki (event listener); state güncellemesi YOK. Uygulama içi yönlendirme
 * uyarısı ileriki formlarda kendi onay diyaloğuyla (AromaterapiConfirmDialog) ele alınır.
 */
export function useAromaterapiDirtyGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Bazı tarayıcılar returnValue set edilmesini bekler.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
