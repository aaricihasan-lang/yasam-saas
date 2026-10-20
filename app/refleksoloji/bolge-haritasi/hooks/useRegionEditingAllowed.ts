"use client";

import { useEffect, useState } from "react";
import {
  isEditViewport,
  REGION_EDIT_MIN_WIDTH,
  REGION_EDIT_TABLET_MIN_WIDTH,
} from "../lib/editingViewport";

/**
 * ÜRÜN KURALI: Bölge Haritası ayak üzerinde HASSAS koordinat düzenlemesi yalnız
 * yeterince geniş ekranlarda (masaüstü/laptop ve tablet) açıktır. Telefon/dar
 * ekranlarda harita SALT-OKUMA görüntüleme modundadır (yanlış atlas verisi riskini önler).
 *
 * Karar `lib/editingViewport.isEditViewport` içindedir (user-agent sniffing DEĞİL):
 * ≥ 1024px her zaman; 768–1023px yalnız cihaz ekranının kısa kenarı ≥ 600px (tablet)
 * ise. `matchMedia` ile reaktiftir → pencere küçülüp büyüdüğünde / cihaz döndüğünde
 * düzenleme izni deterministik güncellenir (desktop→mobil→desktop geçişi güvenli).
 *
 * Not: bir dokunmatik cihaz sırf `pointer: coarse` diye kapatılmaz — sinyal
 * yalnız genişlik + ekran kısa kenarıdır.
 */

const DESKTOP_QUERY = `(min-width: ${REGION_EDIT_MIN_WIDTH}px)`;
const TABLET_QUERY = `(min-width: ${REGION_EDIT_TABLET_MIN_WIDTH}px)`;

function readAllowed(): boolean {
  const shortSide = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  return isEditViewport(window.innerWidth, shortSide);
}

export function useRegionEditingAllowed(): boolean {
  const [allowed, setAllowed] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      // SSR/desteklenmeyen: düzenleme yüzeyi zaten hydrate sonrası (client) render edilir.
      return true;
    }
    return readAllowed();
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const tablet = window.matchMedia(TABLET_QUERY);
    const onChange = () => setAllowed(readAllowed());
    onChange(); // mount'ta gerçek değere hizala
    desktop.addEventListener("change", onChange);
    tablet.addEventListener("change", onChange);
    return () => {
      desktop.removeEventListener("change", onChange);
      tablet.removeEventListener("change", onChange);
    };
  }, []);

  return allowed;
}
