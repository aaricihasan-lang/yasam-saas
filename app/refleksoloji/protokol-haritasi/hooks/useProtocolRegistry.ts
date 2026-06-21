"use client";

import { useCallback, useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { supabase } from "@/lib/supabase";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import {
  draftToSavedProtocol,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "../lib/protocolStorage";

export type SaveProtocolResult =
  | { saved: SavedProtocol; storageOk: boolean }
  | { saved: null; storageOk: true };

async function syncProtocolToSupabase(saved: SavedProtocol): Promise<string | null> {
  try {
    const tid = await getSyncedTenantId();
    if (!tid) return "Bulut eşitleme için oturum bulunamadı.";

    const { error } = await supabase.from("reflexology_protocols").insert({
      id: crypto.randomUUID(),
      tenant_id: tid,
      source_uid: saved.id,
      title: saved.title,
      target_problem: saved.description || null,
      organs: saved.organs.length > 0 ? saved.organs.join(" | ") : null,
      application_notes: saved.notes || null,
      raw_json: saved as Record<string, unknown>,
      created_at: saved.createdAt,
    });

    if (error) return "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";
    return null;
  } catch {
    return "Protokol buluta eşitlenemedi. Kayıt cihazınızda mevcut.";
  }
}

export function useProtocolRegistry() {
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

      if (!editId) {
        // Fire-and-forget Supabase sync for new protocols
        void syncProtocolToSupabase(saved).then((errMsg) => {
          if (errMsg) setSyncErrorMessage(errMsg);
        });
      }

      return { saved, storageOk };
    },
    [protocols, persist],
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
