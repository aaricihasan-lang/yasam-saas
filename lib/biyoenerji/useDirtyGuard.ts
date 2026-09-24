"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * BIO-015 — Kaydedilmemiş değişiklik varken tarayıcı refresh/kapatma/navigasyon
 * koruması. YALNIZ `active` (gerçekten dirty) iken beforeunload devreye girer;
 * form temizken tarayıcı davranışı ENGELLENMEZ. Next.js router'a monkey-patch
 * uygulanmaz — yalnız standart beforeunload kullanılır.
 */
export function useUnsavedChangesWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Eski tarayıcılar için (returnValue set edilmezse uyarı çıkmayabilir).
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * BIO-003/004 — Dirty tespiti (değere-dayalı, "input'a dokunuldu" değil).
 *
 * Modal `open` false→true olduğunda mevcut `value` snapshot'lanır; sonraki
 * değerlerle karşılaştırılır. Kullanıcı bir alanı değiştirip ESKİ HÂLİNE geri
 * getirirse isDirty tekrar false olur. Başarılı Save sonrası `reset()` çağrılırsa
 * yeni snapshot alınır → kapanışta gereksiz uyarı çıkmaz.
 *
 * `value` plain-serializable form state olmalıdır (string/number/boolean/dizi/nesne).
 */
export function useDirtySnapshot<T>(
  open: boolean,
  value: T,
): { isDirty: boolean; reset: () => void } {
  const serialized = safeStringify(value);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const prevOpen = useRef(false);

  useEffect(() => {
    if (open && !prevOpen.current) {
      // Açılışta snapshot al.
      setSnapshot(serialized);
    } else if (!open && prevOpen.current) {
      // Kapanışta temizle (sonraki açılışta taze snapshot).
      setSnapshot(null);
    }
    prevOpen.current = open;
  }, [open, serialized]);

  const reset = useCallback(() => setSnapshot(serialized), [serialized]);

  const isDirty = open && snapshot !== null && serialized !== snapshot;
  return { isDirty, reset };
}
