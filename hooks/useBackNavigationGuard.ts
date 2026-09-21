"use client";

import { useEffect, useRef } from "react";

/**
 * Şifa Rehberi — tarayıcı GERİ/İLERİ (popstate) için kaydedilmemiş-değişiklik guard'ı.
 *
 * `useUnsavedGuard` (beforeunload) sekme-kapatma / yenileme'yi karşılar; bu hook ise
 * client-side geri/ileri navigasyonunu karşılar. `beforeunload` client-side route
 * değişiminde FİRE ETMEZ → geri tuşu için ayrı, kapsamı dar bir desen gerekir.
 *
 * DESEN (App Router uyumlu, global history monkey-patch YOK):
 *   - `active` (dirty) olunca AYNI url ile tek bir "sentinel" history girişi push edilir.
 *   - Geri basılınca önce sentinel tüketilir → URL değişmez, popstate alırız (hâlâ sayfadayız).
 *   - Native `window.confirm` (senkron, güvenilir) sorulur:
 *       • Kal  → sentinel yeniden kurulur (sayfada kalınır).
 *       • Ayrıl → history.back() ile gerçek önceki girişe gidilir.
 *   - `active=false` (kaydedildi) / unmount → listener temizlenir (KALICI KİLİT YOK).
 *
 * SINIRLAR: Bu yalnız geri/ileri (popstate) + (useUnsavedGuard ile) sekme-kapatma/yenileme'yi
 * kapsar. Aynı sayfadaki `<Link>` tıklamalarını App Router yerleşik olarak engelleyemez;
 * bu ekranlarda (create/edit) böyle bir link BULUNMADIĞINDAN ek müdahale gerekmez.
 * Davranış yalnız gerçek tarayıcıda uçtan uca doğrulanabilir.
 */
export function useBackNavigationGuard(active: boolean, message: string): void {
  // Ref'ler render sırasında DEĞİL, kendi effect'lerinde güncellenir (React kuralı).
  const activeRef = useRef(active);
  const messageRef = useRef(message);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    // Sentinel: aynı URL ile tek giriş. Geri basınca bunu tüketir → sayfa değişmez.
    window.history.pushState({ __sifaBackGuard: true }, "", window.location.href);

    const onPopState = () => {
      if (!activeRef.current) return; // artık dirty değil → serbest bırak
      // Sentinel tüketildi; hâlâ aynı sayfadayız (URL değişmedi). Onay iste.
      const leave = window.confirm(messageRef.current);
      if (leave) {
        activeRef.current = false; // yeniden guard'lama
        window.history.back(); // gerçek önceki girişe dön
      } else {
        // Kal: sentinel'i yeniden kur.
        window.history.pushState({ __sifaBackGuard: true }, "", window.location.href);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);
}
