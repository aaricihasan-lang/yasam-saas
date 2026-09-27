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
  clearLegacyProtocols,
  createProtocolId,
  loadLegacyProtocols,
  loadProtocolsFromStorage,
  loadQuarantinedProtocols,
  saveProtocolsToStorage,
  saveQuarantinedProtocols,
} from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";
import type { SavedProtocol } from "@/app/refleksoloji/protokol-haritasi/types";
import { setProtocolCache } from "@/lib/refleksoloji/protocolCache";
import { classifyLegacyProtocols } from "@/lib/refleksoloji/protocolSyncCore";
import type { ReflexologyProtocolRecord } from "../types";

/**
 * DL-007: eski cihaz-geneli protokol kopyaları. Sunucuda aynı source_uid + BİREBİR
 * aynı içerikle bulunanlar (sahiplik kanıtlı) kapsamlı yerel kopyaya alınır; diğerleri
 * karantinaya taşınır (kullanıcı kararı). ASLA otomatik silme/otomatik yükleme yok.
 * Önce hedef yazılır, sonra kaynak kaldırılır. Dönüş: karantina sayısı.
 */
function processLegacyProtocols(rows: ReflexologyProtocolRecord[]): number {
  const legacy = loadLegacyProtocols();
  if (legacy.length === 0) return loadQuarantinedProtocols().length;
  const { adopt, quarantine } = classifyLegacyProtocols(legacy, rows);
  if (adopt.length > 0) {
    const local = loadProtocolsFromStorage();
    const ids = new Set(local.map((p) => p.id));
    const next = [...local, ...adopt.filter((a) => !ids.has(a.id))];
    if (!saveProtocolsToStorage(next)) return loadQuarantinedProtocols().length;
  }
  let q = loadQuarantinedProtocols();
  if (quarantine.length > 0) {
    const seen = new Set(q.map((p) => `${p.id}|${p.updatedAt}`));
    q = [...q, ...quarantine.filter((p) => !seen.has(`${p.id}|${p.updatedAt}`))];
    if (!saveQuarantinedProtocols(q)) return loadQuarantinedProtocols().length;
  }
  clearLegacyProtocols();
  return q.length;
}

function protocolBody(p: SavedProtocol, sourceUid: string): Record<string, unknown> {
  const raw = { ...p, id: sourceUid };
  delete (raw as { pendingSync?: boolean }).pendingSync;
  delete (raw as { baseVersion?: string }).baseVersion;
  return {
    source_uid: sourceUid,
    title: p.title,
    target_problem: p.description || null,
    organs: p.organs.length > 0 ? p.organs.join(" | ") : null,
    application_notes: p.notes || null,
    raw_json: raw,
  };
}

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
  const [quarantineCount, setQuarantineCount] = useState(0);

  const refresh = useCallback(async () => {
    if (isDemo) {
      const demoList = buildDemoProtocolList();
      setProtocols(demoList);
      // Detay geçişini seed'lemek için oturum-içi cache'e yaz (salt hız).
      setProtocolCache(demoList);
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

      const rows = (json.protocols ?? []) as ReflexologyProtocolRecord[];
      setProtocols(rows);
      // Detay geçişini seed'lemek için oturum-içi cache'e yaz (salt hız).
      setProtocolCache(rows);
      setQuarantineCount(processLegacyProtocols(rows));
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
        // Başarılı silme → aynı cihazdan tekrar tıklama/yarışta eski satır görünmesin.
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

  /** "Bana ait, içe aktar": karantinadaki protokoller YENİ source_uid ile bu hesaba kaydedilir. */
  const importQuarantine = useCallback(async (): Promise<{ imported: number; failed: number }> => {
    const q = loadQuarantinedProtocols();
    let imported = 0;
    const failedList: SavedProtocol[] = [];
    for (const p of q) {
      const sourceUid = createProtocolId(p.title, new Set());
      try {
        const res = await fetch("/api/refleksoloji/protocols", {
          method: "POST",
          headers: { ...userHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(protocolBody(p, sourceUid)),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (res.ok && json?.ok) {
          imported += 1;
          const local = loadProtocolsFromStorage();
          saveProtocolsToStorage([
            ...local,
            { ...p, id: sourceUid, baseVersion: p.updatedAt, pendingSync: undefined },
          ]);
        } else {
          failedList.push(p);
        }
      } catch {
        failedList.push(p);
      }
    }
    // Başarısızlar karantinada KALIR (veri kaybı yok; tekrar denenebilir).
    saveQuarantinedProtocols(failedList);
    setQuarantineCount(failedList.length);
    if (imported > 0) await refresh();
    return { imported, failed: failedList.length };
  }, [refresh]);

  const discardQuarantine = useCallback(() => {
    saveQuarantinedProtocols([]);
    setQuarantineCount(0);
  }, []);

  return {
    protocols,
    loading,
    loadErrorMessage,
    refresh,
    deleteProtocol,
    isDemo,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
  };
}
