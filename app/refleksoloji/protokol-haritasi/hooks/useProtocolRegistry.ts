"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import {
  draftToSavedProtocol,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "../lib/protocolStorage";

export function useProtocolRegistry() {
  const [protocols, setProtocols] = useState<SavedProtocol[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProtocols(loadProtocolsFromStorage());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: SavedProtocol[]) => {
    setProtocols(next);
    saveProtocolsToStorage(next);
  }, []);

  const saveProtocol = useCallback(
    (draft: ProtocolFormDraft, editId?: string | null): SavedProtocol | null => {
      const previous = editId ? protocols.find((p) => p.id === editId) : undefined;
      const ids = new Set(protocols.filter((p) => p.id !== editId).map((p) => p.id));
      const saved = draftToSavedProtocol(draft, {
        id: editId ?? undefined,
        previous,
        existingIds: ids,
      });
      if (!saved) return null;

      if (editId) {
        persist(protocols.map((p) => (p.id === editId ? saved : p)));
      } else {
        persist([...protocols, saved]);
      }
      return saved;
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

  return {
    protocols,
    hydrated,
    saveProtocol,
    deleteProtocol,
  };
}
