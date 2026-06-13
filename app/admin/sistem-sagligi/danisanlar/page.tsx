"use client";

import { useCallback, useEffect, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  AccessDeniedScreen,
  loadTenantMetricSummary,
  LoadingScreen,
  SistemSagligiDetailShell,
  SummaryStatCard,
  TenantBreakdownSection,
  useSistemSagligiAdminGate,
  type TenantIdCount,
} from "../detail-shared";

export default function SistemSagligiDanisanlarPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [tenantRows, setTenantRows] = useState<TenantIdCount[]>([]);
  const [distinctTenants, setDistinctTenants] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadTenantMetricSummary("clients");
    if (result.error) {
      setLoadError(result.error);
      setTotal(0);
      setTenantRows([]);
      setDistinctTenants(0);
    } else {
      setTotal(result.total);
      setTenantRows(result.tenantRows);
      setDistinctTenants(result.distinctTenants);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadData();
  }, [checked, allowed, loadData]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Toplam Danışan"
      description="Danışan kayıt sayıları — yalnızca clients tablosu metrikleri; isim veya not gösterilmez."
      headerGradient="from-slate-900 via-blue-900 to-indigo-800"
      loading={loading}
      loadingLabel="Danışan metrikleri yükleniyor…"
      error={loadError}
      onRetry={() => void loadData()}
      tableBadge="clients tablosu · sayısal özet"
    >
      <section
        aria-label="Danışan özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <SummaryStatCard label="Toplam danışan" value={total} tone="indigo" />
        <SummaryStatCard
          label="Tenant sayısı"
          value={distinctTenants}
          tone="violet"
          sublabel="Danışanı olan çalışma alanları"
        />
      </section>

      <TenantBreakdownSection
        title="Tenant bazlı danışan sayısı"
        subtitle="Her tenant için kayıt adedi — yalnızca sayısal dağılım"
        total={total}
        rows={tenantRows}
        emptyLabel="Danışan kaydı veya tenant bilgisi yok."
      />
    </SistemSagligiDetailShell>
  );
}
