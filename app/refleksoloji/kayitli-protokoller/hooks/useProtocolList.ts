"use client";

import { useCallback, useEffect, useState } from "react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  DEMO_SEED_PROTOCOLS,
  DEMO_USER_LOCAL_PREFIX,
  isDemoFixtureProtocol,
  isUserLocalProtocol,
  savedProtocolToRecord,
} from "@/lib/demo/demoRefleksoloji";
import {
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";
import type { ReflexologyProtocolRecord } from "../types";

function buildDemoProtocolList(): ReflexologyProtocolRecord[] {
  const local = loadProtocolsFromStorage().map(savedProtocolToRecord);
  return [...local, ...DEMO_SEED_PROTOCOLS];
}

function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

export function useProtocolList() {
  const isDemo = readYasamUser()?.is_demo_account === true;

  const [protocols, setProtocols] = useState<ReflexologyProtocolRecord[]>([]);
  const [loading, setLoading] = useState(!isDemo);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setProtocols(buildDemoProtocolList());
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadErrorMessage(null);

    // GÜVENLİK (anon kilidi): tenant_id sunucuda oturumdan belirlenir.
    try {
      const res = await fetch("/api/refleksoloji/protocols", {
        headers: userHeaders(),
        cache: "no-store",
      });
      setLoading(false);

      if (res.status === 401 || res.status === 403) {
        setLoadErrorMessage("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
        setProtocols([]);
        return;
      }

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; protocols?: ReflexologyProtocolRecord[]; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setLoadErrorMessage(`Protokoller okunamadı: ${json?.error ?? res.statusText}`);
        setProtocols([]);
        return;
      }

      setProtocols((json.protocols ?? []) as ReflexologyProtocolRecord[]);
    } catch (err) {
      setLoading(false);
      setLoadErrorMessage(
        `Protokoller okunamadı: ${err instanceof Error ? err.message : "Bağlantı hatası"}`,
      );
      setProtocols([]);
    }
  }, [isDemo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteProtocol = useCallback(
    async (id: string) => {
      if (isDemo) {
        // Fixture seed protokoller silinemez
        if (isDemoFixtureProtocol(id)) return false;
        if (!isUserLocalProtocol(id)) return false;

        const localId = id.slice(DEMO_USER_LOCAL_PREFIX.length);
        const current = loadProtocolsFromStorage();
        const next = current.filter((p) => p.id !== localId);
        if (next.length === current.length) return false;
        saveProtocolsToStorage(next);
        setProtocols(buildDemoProtocolList());
        return true;
      }

      // GÜVENLİK (anon kilidi): silme güvenli route üzerinden; id+tenant_id eşleşmesi
      // sunucuda zorlanır (IDOR engellenir).
      try {
        const res = await fetch(
          `/api/refleksoloji/protocols/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: userHeaders() },
        );
        if (!res.ok) return false;
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (!json?.ok) return false;
        // P1-2: ters yön — server'dan silinen kayıt Protokol Haritası'nın
        // localStorage kopyasında zombie kalmasın (source_uid = local id).
        const sourceUid = protocols.find((p) => p.id === id)?.source_uid;
        if (sourceUid) {
          const local = loadProtocolsFromStorage();
          const next = local.filter((p) => p.id !== sourceUid);
          if (next.length !== local.length) saveProtocolsToStorage(next);
        }
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [isDemo, refresh, protocols],
  );

  return { protocols, loading, loadErrorMessage, refresh, deleteProtocol, isDemo };
}
