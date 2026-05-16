"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedProtocol } from "@/app/refleksoloji/protokol-haritasi/types";
import { loadProtocolsFromStorage } from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";
import { deleteProtocolById } from "../lib/protocolActions";

export function useProtocolList() {
  const [protocols, setProtocols] = useState<SavedProtocol[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    try {
      setProtocols(loadProtocolsFromStorage());
    } catch {
      setProtocols([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const deleteProtocol = useCallback(
    (id: string) => {
      const ok = deleteProtocolById(id);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  return { protocols, hydrated, refresh, deleteProtocol };
}
