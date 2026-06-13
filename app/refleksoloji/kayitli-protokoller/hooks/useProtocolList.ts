"use client";

import { useCallback, useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import type { ReflexologyProtocolRecord } from "../types";

export function useProtocolList() {
  const [protocols, setProtocols] = useState<ReflexologyProtocolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadErrorMessage(null);

    const tid = await getSyncedTenantId();
    if (!tid) {
      setLoadErrorMessage("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
      setProtocols([]);
      setLoading(false);
      return;
    }

    setTenantId(tid);

    // GÜVENLIK: tenant_id filtresi zorunlu — yalnızca aktif kullanıcının protokolleri
    const { data, error } = await supabase
      .from("reflexology_protocols")
      .select("*")
      .eq("tenant_id", tid)
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
      const tid = tenantId ?? await getSyncedTenantId();
      if (!tid) return false;
      // GÜVENLIK: hem id hem tenant_id filtresi
      const { error } = await supabase
        .from("reflexology_protocols")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tid);
      if (error) return false;
      await refresh();
      return true;
    },
    [refresh, tenantId],
  );

  return { protocols, loading, loadErrorMessage, refresh, deleteProtocol };
}
