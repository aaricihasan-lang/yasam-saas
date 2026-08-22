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
const SYNC_ERR = "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";

// SavedProtocol → server satır alanları (id/tenant hariç; sunucu üretir/zorlar).
function protocolFields(saved: SavedProtocol): Record<string, unknown> {
  return {
    title: saved.title,
    target_problem: saved.description || null,
    organs: saved.organs.length > 0 ? saved.organs.join(" | ") : null,
    application_notes: saved.notes || null,
    raw_json: saved as Record<string, unknown>,
  };
}

async function syncProtocolToSupabase(saved: SavedProtocol): Promise<string | null> {
  try {
    // Sunucu: tenant_id oturumdan, id/created_at DB default'undan üretir; istemci
    // yalnız source_uid + içerik alanlarını gönderir (mass-assignment izin listesi).
    const res = await fetch("/api/refleksoloji/protocols", {
      method: "POST",
      headers: { ...userHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        source_uid: saved.id,
        ...protocolFields(saved),
      }),
    });
    if (!res.ok) return SYNC_ERR;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!json?.ok) return SYNC_ERR;
    return null;
  } catch {
    return SYNC_ERR;
  }
}

// P1-2: düzenleme → source_uid ile server satırını güncelle (yoksa oluştur).
async function syncProtocolUpdate(saved: SavedProtocol): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/refleksoloji/protocols/by-uid/${encodeURIComponent(saved.id)}`,
      {
        method: "PUT",
        headers: { ...userHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(protocolFields(saved)),
      },
    );
    if (!res.ok) return SYNC_ERR;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!json?.ok) return SYNC_ERR;
    return null;
  } catch {
    return SYNC_ERR;
  }
}

// P1-2: silme → source_uid ile server satırını sil (zombie protokol engellenir).
async function syncProtocolDelete(sourceUid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/refleksoloji/protocols/by-uid/${encodeURIComponent(sourceUid)}`,
      { method: "DELETE", headers: userHeaders() },
    );
    if (!res.ok) return SYNC_ERR;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!json?.ok) return SYNC_ERR;
    return null;
  } catch {
    return SYNC_ERR;
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

      if (!isDemo) {
        // Fire-and-forget Supabase sync (demo'da atlanır).
        // Yeni kayıt → POST; düzenleme → PUT by-uid (P1-2, artık local kalmıyor).
        const sync = editId ? syncProtocolUpdate(saved) : syncProtocolToSupabase(saved);
        void sync.then((errMsg) => {
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
      // P1-2: server'dan da sil (fire-and-forget) → zombie protokol engellenir.
      if (!isDemo) {
        void syncProtocolDelete(id).then((errMsg) => {
          if (errMsg) setSyncErrorMessage(errMsg);
        });
      }
      return true;
    },
    [protocols, persist, isDemo],
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
