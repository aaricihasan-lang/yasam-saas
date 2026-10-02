"use client";

import { useEffect, useRef } from "react";

/**
 * Basit modal davranışı: açıkken arka sayfa kaymaz, Escape modalı kapatır.
 * (Danışan Yolculuğu randevu modalları — satış öncesi mobil kapanış.)
 */
export function useModalBehavior(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Üstte açık onay penceresi (ConfirmProvider) varsa Escape onu kapatır, bu modalı değil.
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
}
