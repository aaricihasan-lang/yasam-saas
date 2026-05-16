"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProtocolProblem, ProtocolProblemDraft } from "../types";
import {
  draftToProblem,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "../lib/protocolStorage";

export function useProtocolCatalog() {
  const [protocols, setProtocols] = useState<ProtocolProblem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProtocols(loadProtocolsFromStorage());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: ProtocolProblem[]) => {
    setProtocols(next);
    saveProtocolsToStorage(next);
  }, []);

  const addProtocol = useCallback(
    (draft: ProtocolProblemDraft): ProtocolProblem | null => {
      const ids = new Set(protocols.map((p) => p.id));
      const created = draftToProblem(draft, { existingIds: ids });
      if (!created) return null;
      persist([...protocols, created]);
      return created;
    },
    [protocols, persist],
  );

  const updateProtocol = useCallback(
    (id: string, draft: ProtocolProblemDraft): ProtocolProblem | null => {
      const previous = protocols.find((p) => p.id === id);
      if (!previous) return null;
      const ids = new Set(protocols.filter((p) => p.id !== id).map((p) => p.id));
      const updated = draftToProblem(draft, {
        id,
        previous,
        existingIds: ids,
      });
      if (!updated) return null;
      persist(protocols.map((p) => (p.id === id ? updated : p)));
      return updated;
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
    addProtocol,
    updateProtocol,
    deleteProtocol,
  };
}
