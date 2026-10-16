"use client";

import { useEffect } from "react";

/**
 * Tam ekran HD penceresi açıkken ARKA SAYFANIN kaydırmasını kilitler (çift dikey scrollbar önlemi).
 *
 * Neden: pencere `fixed inset-0` ve içeriğini kendi `overflow-y-auto` alanında kaydırıyor; arka
 * sayfa (document) kaydırılabilir kaldığında tarayıcı onun scrollbar'ını da gösteriyordu → iki
 * dikey çubuk, tekerlek/dokunma bazen arka sayfayı kaydırıyordu.
 *
 * Güvenlik:
 *   • Sayaçlı: birden çok kilit (iç içe modal, React Strict Mode çift mount) doğru sayılır; yalnız
 *     SON kilit kalktığında eski değerler geri yazılır.
 *   • Yalnız inline stil (html/body overflow) — global CSS'e dokunmaz; önceki inline değer korunur.
 *   • Kapanınca kaydırma konumu geri verilir (konum zaten korunur; tarayıcı farkına karşı güvence).
 *   • SSR-safe (document yalnız effect içinde).
 */

let lockCount = 0;
let saved: { htmlOverflow: string; bodyOverflow: string; scrollX: number; scrollY: number } | null = null;

export function hdLockBodyScroll(): void {
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }
  lockCount += 1;
}

export function hdUnlockBodyScroll(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0 || !saved) return;
  const { htmlOverflow, bodyOverflow, scrollX, scrollY } = saved;
  saved = null;
  document.documentElement.style.overflow = htmlOverflow;
  document.body.style.overflow = bodyOverflow;
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
}

export function useHdBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    hdLockBodyScroll();
    return hdUnlockBodyScroll;
  }, [active]);
}

/** Yalnız test: modül durumunu okur (üretim kodu kullanmaz). */
export function __hdScrollLockStateForTest(): { count: number; locked: boolean } {
  return { count: lockCount, locked: saved !== null };
}
