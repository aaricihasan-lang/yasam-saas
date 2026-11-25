"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listProtocols, type CuppingProtocol } from "@/app/kupa/lib/api";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";

/**
 * Protokol listesi (DB-first). "N bölge" gibi ilişki sayıları BU ekranda GÖSTERİLMEZ:
 * kart başına ayrı relation fetch = N+1 olurdu. Sayaç, bulk contract gelene kadar OMIT
 * edilir (sırf görsel için N+1 üretilmez).
 */
export function useProtocolList() {
  const [protocols, setProtocols] = useState<CuppingProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("cupping.protocols.list");
  const errText = useKupaErrorText();

  // Manuel yenileme (event-handler bağlamı; ör. silme sonrası). Efekt bunu ÇAĞIRMAZ.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProtocols(await listProtocols());
    } catch (e) {
      setError(errText(e, t("loadError")));
    } finally {
      setLoading(false);
    }
  }, [errText, t]);

  // Mount yüklemesi: setState'ler inline async gövdede (sync effect setState → cascading-render lint'i).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listProtocols();
        if (!cancelled) setProtocols(data);
      } catch (e) {
        if (!cancelled) setError(errText(e, t("loadError")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız mount yüklemesi (dil değişimi yeniden yükleme tetiklemez)
  }, []);

  return { protocols, loading, error, refresh, setProtocols };
}
