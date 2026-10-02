"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * BIO-07 — Tarayıcı / Android donanım "geri" tuşunun kirli formu SESSİZCE atmasını
 * engelleyen geçmiş (history) koruması.
 *
 * Yöntem: koruma "silahlıyken" aynı URL'ye tek bir koruma girdisi eklenir
 * (`history.pushState({ __bioGuard }, "")`). Next.js app-router harici pushState'e
 * kendi iç durumunu kopyalar; aynı URL olduğu için görünür navigasyon olmaz.
 * Kullanıcı geri bastığında koruma girdisi tüketilir → `onBack({ stay })` çağrılır:
 *   - Çağıran kalmak isterse `stay()` korumayı yeniden kurar (sayfada kalınır) ve
 *     kendi "Kaydedilmemiş değişiklikler" onayını gösterir.
 *   - Çağıran `stay()` demezse (temiz form/modal kapatıldı) geri hareketi tamamlanmış sayılır.
 * `release()`: koruma hâlâ en üstteyse onu sessizce geri alır (modal kaydedilip/kapatılınca).
 * `leave(steps)`: kullanıcı "çık" dediğinde korumayı + sayfayı geride bırakır.
 *
 * Kapsam: yalnız Biyoenerji modalları ve çakra editörü. Router monkey-patch YOK.
 */
type GuardState = { __bioGuard?: string } | null;

export type BackGuardApi = {
  /** Korumayı yeniden kur (kullanıcı sayfada kalıyor). */
  stay: () => void;
};

export function useHistoryBackGuard(
  armed: boolean,
  onBack: (api: BackGuardApi) => void,
  opts: { autoContinueWhenDisarmed?: boolean } = {},
) {
  const idRef = useRef<string>("");
  const pushedRef = useRef(false);
  const skipRef = useRef(0);
  const armedRef = useRef(armed);
  const onBackRef = useRef(onBack);
  const autoContinueRef = useRef(!!opts.autoContinueWhenDisarmed);

  useEffect(() => {
    armedRef.current = armed;
    onBackRef.current = onBack;
    autoContinueRef.current = !!opts.autoContinueWhenDisarmed;
  });

  const isOnGuard = () =>
    typeof window !== "undefined" &&
    (window.history.state as GuardState)?.__bioGuard === idRef.current;

  const push = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!idRef.current) idRef.current = `bio-guard-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ __bioGuard: idRef.current }, "");
    pushedRef.current = true;
  }, []);

  const release = useCallback(() => {
    if (!pushedRef.current || typeof window === "undefined") return;
    pushedRef.current = false;
    if (isOnGuard()) {
      skipRef.current += 1;
      window.history.back();
    }
  }, []);

  const leave = useCallback((steps: number) => {
    if (typeof window === "undefined") return;
    if (pushedRef.current && isOnGuard()) {
      pushedRef.current = false;
      skipRef.current += 1;
      window.history.go(-(steps + 1));
    } else {
      pushedRef.current = false;
      window.history.go(-steps);
    }
  }, []);

  // Silahlanınca koruma girdisini kur.
  useEffect(() => {
    if (armed && !pushedRef.current) push();
  }, [armed, push]);

  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) {
        if (skipRef.current > 0) skipRef.current -= 1;
        return;
      }
      if (isOnGuard()) return; // ileri gidip korumaya geri gelindi
      pushedRef.current = false;
      if (skipRef.current > 0) {
        skipRef.current -= 1;
        return;
      }
      if (armedRef.current) {
        onBackRef.current({ stay: push });
      } else if (autoContinueRef.current) {
        // Koruma artık gereksizdi (ör. kaydedildi); kullanıcının asıl geri isteğini tamamla.
        window.history.back();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [push]);

  return { release, leave };
}
