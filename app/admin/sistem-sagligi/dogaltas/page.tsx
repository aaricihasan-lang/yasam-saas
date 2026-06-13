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

export default function SistemSagligiDogaltasPage() {
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
    const result = await loadTenantMetricSummary("stones");
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
      title="Toplam Doğaltaş Kaydı"
      description="Taş envanteri kayıt sayıları — özel not veya içerik gösterilmez."
      headerGradient="from-slate-900 via-cyan-900 to-teal-800"
      loading={loading}
      loadingLabel="Doğaltaş metrikleri yükleniyor…"
      error={loadError}
      onRetry={() => void loadData()}
      tableBadge="stones tablosu · sayısal özet"
    >
      <section
        aria-label="Doğaltaş özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <SummaryStatCard label="Toplam taş kaydı" value={total} tone="cyan" />
        <SummaryStatCard
          label="Tenant sayısı"
          value={distinctTenants}
          tone="emerald"
          sublabel="Taş kaydı olan çalışma alanları"
        />
      </section>

      <TenantBreakdownSection
        title="Tenant bazlı taş kayıt sayısı"
        subtitle="Her tenant için stones tablosu kayıt adedi"
        total={total}
        rows={tenantRows}
        emptyLabel="Taş kaydı veya tenant bilgisi yok."
      />
    </SistemSagligiDetailShell>
  );
}
