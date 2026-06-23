"use client";

import { useCallback, useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
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
import { supabase } from "@/lib/supabase";
import type { ReflexologyProtocolRecord } from "../types";

function buildDemoProtocolList(): ReflexologyProtocolRecord[] {
  const local = loadProtocolsFromStorage().map(savedProtocolToRecord);
  return [...local, ...DEMO_SEED_PROTOCOLS];
}

export function useProtocolList() {
  const isDemo = readYasamUser()?.is_demo_account === true;

  const [protocols, setProtocols] = useState<ReflexologyProtocolRecord[]>([]);
  const [loading, setLoading] = useState(!isDemo);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setProtocols(buildDemoProtocolList());
      setLoading(false);
      return;
    }

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

      const tid = tenantId ?? (await getSyncedTenantId());
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
    [isDemo, refresh, tenantId],
  );

  return { protocols, loading, loadErrorMessage, refresh, deleteProtocol, isDemo };
}
