"use client";

import { useEffect, useState } from "react";
import { REGION_EDIT_MIN_WIDTH } from "../lib/editingViewport";

/**
 * ÜRÜN KURALI: Bölge Haritası ayak üzerinde HASSAS koordinat düzenlemesi yalnız
 * yeterince geniş ekranlarda (masaüstü/laptop) açıktır. Telefon/dar ekranlarda
 * harita SALT-OKUMA görüntüleme modundadır (yanlış atlas verisi riskini önler).
 *
 * Karar VIEWPORT tabanlıdır (user-agent sniffing DEĞİL): eşik `lib/editingViewport`
 * içindeki `REGION_EDIT_MIN_WIDTH` (Tailwind `lg` = 1024px). `matchMedia` ile
 * reaktiftir → pencere küçülüp büyüdüğünde düzenleme izni deterministik güncellenir
 * (desktop→mobil→desktop geçişi güvenli).
 *
 * Not: bir dokunmatik masaüstü sırf `pointer: coarse` diye kapatılmaz — sinyal
 * yalnız genişliktir; geniş ekran = düzenleme açık.
 */

const QUERY = `(min-width: ${REGION_EDIT_MIN_WIDTH}px)`;

export function useRegionEditingAllowed(): boolean {
  const [allowed, setAllowed] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      // SSR/desteklenmeyen: düzenleme yüzeyi zaten hydrate sonrası (client) render edilir.
      return true;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setAllowed(mql.matches);
    onChange(); // mount'ta gerçek değere hizala
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return allowed;
}
