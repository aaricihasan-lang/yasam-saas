"use client";

// Türkiye (Europe/Istanbul) GÜNCEL takvim yılı — hydration-safe + otomatik yıl geçişi.
//
// useSyncExternalStore ile:
//   • SSR ve ilk client (hydration) render'ı AYNI snapshot'ı (getServerSnapshot) kullanır →
//     hydration mismatch OLMAZ. Hydration'dan sonra client getSnapshot ile uzlaşır; yıl
//     server ile client arasında değiştiyse güvenli biçimde tek re-render ile düzeltilir.
//   • Açık kalan sekmede bir sonraki Türkiye yıl sınırında otomatik güncellenir (timer).
//   • Sekme uykuya girip döndüğünde / bilgisayar askıdan kalktığında visibility + focus
//     dönüşünde güncel yıl yeniden okunur (eski yılda takılı kalmaz).
// Sürekli polling / gereksiz re-render yoktur: değer değişmedikçe store yeniden render tetiklemez.

import { useSyncExternalStore } from "react";
import { currentIstanbulYear, msUntilNextIstanbulYear } from "@/lib/numeroloji/currentYear";

// setTimeout üst sınırı (~24.8 gün). Yıl sınırı daha uzaksa parça parça uyanıp yeniden
// zamanlarız; her uyanışta değer değişmediğinden re-render olmaz (yalnız yeniden zamanlama).
const MAX_TIMEOUT_MS = 2_147_000_000;

function subscribe(onStoreChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    // +1sn tampon: sınırı GEÇTİKTEN sonra uyan (kenar yuvarlama hatasını önler).
    const raw = msUntilNextIstanbulYear(new Date()) + 1000;
    const delay = Math.min(Math.max(raw, 1000), MAX_TIMEOUT_MS);
    timer = setTimeout(() => {
      onStoreChange();
      schedule();
    }, delay);
  };

  const recheck = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      onStoreChange();
    }
  };

  schedule();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", recheck);
  if (typeof window !== "undefined") window.addEventListener("focus", recheck);

  return () => {
    if (timer) clearTimeout(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", recheck);
    if (typeof window !== "undefined") window.removeEventListener("focus", recheck);
  };
}

// Primitive (number) — Object.is ile karşılaştırılır; aynı yıl için stabil, değişince re-render.
const getSnapshot = () => currentIstanbulYear();
const getServerSnapshot = () => currentIstanbulYear();

/** Türkiye (Europe/Istanbul) güncel takvim yılı. Kronolojik sunum sınırı için tek kaynak. */
export function useCurrentYear(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
