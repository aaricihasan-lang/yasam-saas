"use client";

import { useEffect } from "react";

/**
 * HD rapor ekranı için kaydedilmemiş-değişiklik çıkış koruması (HD-1A).
 *
 * active=true (dirty) iken beforeunload listener bağlar → sekme kapatma / tarayıcı
 * yenileme / tarayıcının desteklediği dış navigasyonda tarayıcı doğrulama sorar.
 * active=false iken listener bağlı DEĞİLDİR.
 *
 * SSR-safe (window yalnız effect içinde). Cleanup ile listener kaldırılır.
 *
 * SINIR: Tarayıcı geri tuşu ve kontrolümüz dışındaki uygulama-içi <Link>'ler için
 * tam koruma GARANTİ EDİLMEZ (Next.js App Router'da resmî route-blocker yoktur;
 * router monkey-patch / history override YAPILMAZ). Uygulama-içi bilinen
 * tetikleyiciler (Yenile, danışan değişimi) ekranın kendi onay akışıyla korunur.
 */
export function useUnsavedGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Eski tarayıcı uyumu — modern tarayıcılar özel metni yok sayar.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
