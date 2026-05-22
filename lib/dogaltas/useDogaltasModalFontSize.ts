"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clampDogaltasModalFontSize,
  DOGALTAS_MODAL_FONT_DEFAULT,
  DOGALTAS_MODAL_FONT_MAX,
  DOGALTAS_MODAL_FONT_MIN,
  DOGALTAS_MODAL_FONT_STEP,
  readStoredDogaltasModalFontSize,
  writeStoredDogaltasModalFontSize,
} from "@/lib/dogaltas/dogaltasModalFontSize";

export function useDogaltasModalFontSize(open: boolean) {
  const [modalFontSize, setModalFontSize] = useState(DOGALTAS_MODAL_FONT_DEFAULT);

  useEffect(() => {
    if (!open) return;
    setModalFontSize(readStoredDogaltasModalFontSize());
  }, [open]);

  const persist = useCallback((next: number) => {
    const clamped = clampDogaltasModalFontSize(next);
    setModalFontSize(clamped);
    writeStoredDogaltasModalFontSize(clamped);
  }, []);

  const decrease = useCallback(() => {
    setModalFontSize((current) => {
      const next = clampDogaltasModalFontSize(current - DOGALTAS_MODAL_FONT_STEP);
      writeStoredDogaltasModalFontSize(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    persist(DOGALTAS_MODAL_FONT_DEFAULT);
  }, [persist]);

  const increase = useCallback(() => {
    setModalFontSize((current) => {
      const next = clampDogaltasModalFontSize(current + DOGALTAS_MODAL_FONT_STEP);
      writeStoredDogaltasModalFontSize(next);
      return next;
    });
  }, []);

  return {
    modalFontSize,
    decrease,
    reset,
    increase,
    canDecrease: modalFontSize > DOGALTAS_MODAL_FONT_MIN,
    canIncrease: modalFontSize < DOGALTAS_MODAL_FONT_MAX,
    isDefault: modalFontSize === DOGALTAS_MODAL_FONT_DEFAULT,
  };
}
