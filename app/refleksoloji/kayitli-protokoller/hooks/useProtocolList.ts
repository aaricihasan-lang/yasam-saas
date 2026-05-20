"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ReflexologyProtocolRecord } from "../types";

export function useProtocolList() {
  const [protocols, setProtocols] = useState<ReflexologyProtocolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadErrorMessage(null);

    const { data, error } = await supabase
      .from("reflexology_protocols")
      .select("*")
      .order("title");

    setLoading(false);

    if (error) {
      setLoadErrorMessage(`Protokoller okunamadı: ${error.message}`);
      setProtocols([]);
      return;
    }

    setProtocols((data || []) as ReflexologyProtocolRecord[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteProtocol = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("reflexology_protocols").delete().eq("id", id);
      if (error) return false;
      await refresh();
      return true;
    },
    [refresh],
  );

  return { protocols, loading, loadErrorMessage, refresh, deleteProtocol };
}
