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

export default function SistemSagligiNumerolojiPage() {
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
    const result = await loadTenantMetricSummary("numerology_analyses");
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
      title="Toplam Numeroloji Analizi"
      description="Numeroloji analiz kayıt sayıları — analiz içeriği veya yorumlar gösterilmez."
      headerGradient="from-slate-900 via-fuchsia-900 to-pink-800"
      loading={loading}
      loadingLabel="Numeroloji metrikleri yükleniyor…"
      error={loadError}
      onRetry={() => void loadData()}
      tableBadge="numerology_analyses tablosu · sayısal özet"
    >
      <section
        aria-label="Numeroloji özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <SummaryStatCard label="Toplam analiz" value={total} tone="violet" />
        <SummaryStatCard
          label="Tenant sayısı"
          value={distinctTenants}
          tone="rose"
          sublabel="Analizi olan çalışma alanları"
        />
      </section>

      <TenantBreakdownSection
        title="Tenant bazlı analiz sayısı"
        subtitle="Her tenant için numeroloji kayıt adedi"
        total={total}
        rows={tenantRows}
        emptyLabel="Analiz kaydı veya tenant bilgisi yok."
      />
    </SistemSagligiDetailShell>
  );
}
