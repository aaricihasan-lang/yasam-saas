"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * BIO-03 — Biyoenerji modal katman yığını.
 *
 * Sorun: iç içe açılan modallar (CrudFormModal → LargeTextModal) Escape'i ve
 * Tab focus-trap'ini `window` seviyesinde AYRI AYRI dinliyordu; tek Esc iki modala
 * birden ulaşıp alttaki formu da kapatıyor ve yazılan uzun metin uyarısız
 * kayboluyordu.
 *
 * Çözüm: açık her modal yığına bir kimlikle girer; klavye işleyicileri yalnız
 * kendi katmanı EN ÜSTTEYSE çalışır. Kapanınca (veya unmount) yığından çıkar.
 * Yığın yalnız açılış SIRASINI tutar; veri/state taşımaz.
 */
const stack: symbol[] = [];

/** Test/teşhis için: şu an açık Biyoenerji modal katmanı sayısı. */
export function openModalLayerCount(): number {
  return stack.length;
}

/**
 * Modal açıkken katman yığınına kaydolur. Dönen `isTopLayer()` olay anında
 * çağrılır: true ise bu modal en üsttedir ve Escape/Tab'ı işleyebilir.
 */
export function useModalLayer(open: boolean): () => boolean {
  const idRef = useRef<symbol | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = Symbol("bio-modal-layer");
    stack.push(id);
    idRef.current = id;
    return () => {
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (idRef.current === id) idRef.current = null;
    };
  }, [open]);

  return useCallback(() => {
    const id = idRef.current;
    return id !== null && stack[stack.length - 1] === id;
  }, []);
}
