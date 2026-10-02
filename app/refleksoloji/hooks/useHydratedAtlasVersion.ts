"use client";

import { useEffect, useState } from "react";
import { ATLAS_CHANGED_EVENT, hydrateAndMergeAtlas, isAtlasStorageKey } from "@/lib/atlasStorage";
import { readYasamUser } from "@/lib/auth/yasamUser";

/**
 * SALT-OKUMA atlas hidrasyonu (Kayıtlı Protokol detay + Protokol Haritası önizleme).
 *
 * SORUN (BUG-4): kayıtlı protokol haritası atlas'ı YALNIZ localStorage'dan okuyordu.
 * Yeni cihaz/tarayıcıda protokol sunucudan gelir, atlas sunucuda vardır ama yerel
 * boş olduğundan harita boş kalırdı. Bu hook mount'ta sunucudan atlas indirir,
 * tombstone-farkında birleştirir (TEK merkez: atlasStorage.hydrateAndMergeAtlas),
 * yerele yazar ve dönen sürüm numarasını artırır; tüketen bileşen bu sürümü memo
 * bağımlılığına ekleyerek haritayı yeniden çözer.
 *
 * Salt-okuma: sunucuya geri PUT ETMEZ (FA-13 — görüntüleme ekranından yazma yok).
 */
export function useHydratedAtlasVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (readYasamUser()?.is_demo_account === true) return;

    let cancelled = false;
    void hydrateAndMergeAtlas().then((r) => {
      if (!cancelled && r) setVersion((v) => v + 1);
    });
    // RF-02: başka sekme / birleştirme atlası değiştirince önizleme yeniden çözülür.
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (isAtlasStorageKey(e.key)) bump();
    };
    window.addEventListener(ATLAS_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener(ATLAS_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return version;
}
