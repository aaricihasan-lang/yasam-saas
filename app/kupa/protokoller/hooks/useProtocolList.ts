"use client";

import { useCallback, useEffect, useState } from "react";
import { listProtocols, type CuppingProtocol } from "@/app/kupa/lib/api";

/**
 * Protokol listesi (DB-first). "N bölge" gibi ilişki sayıları BU ekranda GÖSTERİLMEZ:
 * kart başına ayrı relation fetch = N+1 olurdu. Sayaç, bulk contract gelene kadar OMIT
 * edilir (sırf görsel için N+1 üretilmez).
 */
export function useProtocolList() {
  const [protocols, setProtocols] = useState<CuppingProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manuel yenileme (event-handler bağlamı; ör. silme sonrası). Efekt bunu ÇAĞIRMAZ.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProtocols(await listProtocols());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Protokoller yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount yüklemesi: setState'ler inline async gövdede (sync effect setState → cascading-render lint'i).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listProtocols();
        if (!cancelled) setProtocols(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Protokoller yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { protocols, loading, error, refresh, setProtocols };
}
