"use client";

/**
 * NKB-V2-D2 — Kaynak + bağlantı verisini yükleyen hook (yalnız Ana/Yan Kulvar kayıtları).
 * Global state / yeni state kütüphanesi YOK. Yalnız modal/form açıkken (enabled) yükler.
 * loading/error ayrı; reload mutasyonlardan sonra güvenli yeniler.
 */
import { useCallback, useEffect, useState } from "react";
import {
  listRecordSources,
  listSources,
  type NumerologySourceRow,
  type RecordSourceRow,
} from "./sourcesApi";

export function useKulvarSources(recordId: string | null, enabled: boolean) {
  const [sources, setSources] = useState<NumerologySourceRow[]>([]);
  const [links, setLinks] = useState<RecordSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const srcRes = await listSources();
    const linkRes = recordId
      ? await listRecordSources(recordId)
      : { rows: [] as RecordSourceRow[], error: null as string | null };
    setSources(srcRes.rows);
    setLinks(linkRes.rows);
    setError(srcRes.error ?? linkRes.error ?? null);
    setLoading(false);
  }, [recordId, enabled]);

  useEffect(() => {
    // Modal/form açılınca veriyi tek sefer yükle (standart "external data load" effect'i).
    // reload sonucu setState async tamamlanır; kaskad render riski yok. Bilinçli suppression.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void reload();
  }, [enabled, reload]);

  return { sources, links, loading, error, reload, setError };
}
