"use client";

import { useCallback, useEffect, useState } from "react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import {
  draftToSavedProtocol,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "../lib/protocolStorage";

export type SaveProtocolResult =
  | { saved: SavedProtocol; storageOk: boolean }
  | { saved: null; storageOk: true };

function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

// GÜVENLİK (anon kilidi): reflexology_protocols artık tarayıcıdan doğrudan
// supabase ile yazılmaz. Yazma güvenli /api/refleksoloji/protocols POST üzerinden
// gider; tenant_id sunucuda oturumdan belirlenir.
async function syncProtocolToSupabase(saved: SavedProtocol): Promise<string | null> {
  try {
    const res = await fetch("/api/refleksoloji/protocols", {
      method: "POST",
      headers: { ...userHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        source_uid: saved.id,
        title: saved.title,
        target_problem: saved.description || null,
        organs: saved.organs.length > 0 ? saved.organs.join(" | ") : null,
        application_notes: saved.notes || null,
        raw_json: saved as Record<string, unknown>,
        created_at: saved.createdAt,
      }),
    });
    if (!res.ok) return "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!json?.ok) return "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";
    return null;
  } catch {
    return "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";
  }
}

export function useProtocolRegistry() {
  const isDemo = readYasamUser()?.is_demo_account === true;

  const [protocols, setProtocols] = useState<SavedProtocol[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProtocols(loadProtocolsFromStorage());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: SavedProtocol[]): boolean => {
    const ok = saveProtocolsToStorage(next);
    setProtocols(next);
    return ok;
  }, []);

  const saveProtocol = useCallback(
    (draft: ProtocolFormDraft, editId?: string | null): SaveProtocolResult => {
      const previous = editId ? protocols.find((p) => p.id === editId) : undefined;
      const ids = new Set(protocols.filter((p) => p.id !== editId).map((p) => p.id));
      const saved = draftToSavedProtocol(draft, {
        id: editId ?? undefined,
        previous,
        existingIds: ids,
      });
      if (!saved) return { saved: null, storageOk: true };

      const nextList = editId
        ? protocols.map((p) => (p.id === editId ? saved : p))
        : [...protocols, saved];

      const storageOk = persist(nextList);

      if (!editId && !isDemo) {
        // Fire-and-forget Supabase sync for new protocols (demo'da atlanır)
        void syncProtocolToSupabase(saved).then((errMsg) => {
          if (errMsg) setSyncErrorMessage(errMsg);
        });
      }

      return { saved, storageOk };
    },
    [protocols, persist, isDemo],
  );

  const deleteProtocol = useCallback(
    (id: string): boolean => {
      if (!protocols.some((p) => p.id === id)) return false;
      persist(protocols.filter((p) => p.id !== id));
      return true;
    },
    [protocols, persist],
  );

  const clearSyncError = useCallback(() => setSyncErrorMessage(null), []);

  return {
    protocols,
    hydrated,
    saveProtocol,
    deleteProtocol,
    syncErrorMessage,
    clearSyncError,
  };
}
