"use client";

// Hesabın (tenant) kapı/kanal GÖRÜNEN AD kişiselleştirmeleri — salt-okuma.
// Kaynak: kullanıcının kendi Bilgi Bankası kayıtlarının başlığı (YALNIZ category/code/title).
// Okunamazsa sessizce hazır adlara düşer (teknik veri/eşleşme etkilenmez).

import { useEffect, useState } from "react";
import {
  buildHdNameOverrides,
  EMPTY_HD_NAME_OVERRIDES,
  type HdNameOverrides,
} from "@/lib/human-design/knowledge/hdNames";
import { listHdKnowledgeNames } from "./hdBilgiKayit";

export function useHdNameOverrides(): HdNameOverrides {
  const [ov, setOv] = useState<HdNameOverrides>(EMPTY_HD_NAME_OVERRIDES);
  useEffect(() => {
    let alive = true;
    listHdKnowledgeNames().then(({ rows, error }) => {
      if (alive && !error) setOv(buildHdNameOverrides(rows));
    });
    return () => {
      alive = false;
    };
  }, []);
  return ov;
}
