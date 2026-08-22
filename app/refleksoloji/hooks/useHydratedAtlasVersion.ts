"use client";

import { useEffect, useState } from "react";
import {
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  mergeAtlasDocuments,
  saveAtlas,
  saveOrganList,
  unionOrganLists,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import {
  hydrateAtlasFromServer,
  setAtlasSyncSuspended,
} from "@/lib/refleksolojiAtlasSync";
import { readYasamUser } from "@/lib/auth/yasamUser";

/**
 * SALT-OKUMA atlas hidrasyonu (Kayıtlı Protokol detay + Protokol Haritası önizleme).
 *
 * SORUN (BUG-4): kayıtlı protokol haritası atlas'ı YALNIZ localStorage'dan okuyordu.
 * Yeni cihaz/tarayıcıda protokol sunucudan gelir, atlas sunucuda vardır ama yerel
 * boş olduğundan harita boş kalırdı. Bu hook mount'ta sunucudan atlas indirir,
 * tombstone-farkında birleştirir, yerele yazar ve dönen sürüm numarasını artırır;
 * tüketen bileşen bu sürümü memo bağımlılığına ekleyerek haritayı yeniden çözer.
 *
 * Salt-okuma: sunucuya geri PUT ETMEZ (görüntüleme ekranından yazma amplifikasyonu
 * olmasın). Yazma yalnız Bölge Haritası/Kayıtlı Atlas düzenleme ekranlarından gider.
 */
export function useHydratedAtlasVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (readYasamUser()?.is_demo_account === true) return;

    let cancelled = false;
    void hydrateAtlasFromServer().then((server) => {
      if (cancelled || !server) return;
      const serverDoc = (server.document ?? {}) as AtlasDocument;
      const hasServerData =
        listOrganNamesFromAtlas(serverDoc).length > 0 || server.organ_list.length > 0;
      if (!hasServerData) return;

      const localDoc = loadAtlas();
      const merged = mergeAtlasDocuments(serverDoc, localDoc);
      const mergedOrgans = unionOrganLists(server.organ_list, loadOrganList());

      // Birleştirmeyi yerele yaz; geri-PUT'u bastır (salt-okuma ekran).
      setAtlasSyncSuspended(true);
      saveAtlas(merged);
      saveOrganList(mergedOrgans);
      setAtlasSyncSuspended(false);

      if (!cancelled) setVersion((v) => v + 1);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
