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

export default function SistemSagligiArsivPage() {
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
    const result = await loadTenantMetricSummary("personal_archives");
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
      title="Kişisel Arşiv Kayıtları"
      description="Arşiv kayıt sayıları — dosya adı, not veya içerik gösterilmez."
      headerGradient="from-slate-900 via-orange-900 to-amber-800"
      loading={loading}
      loadingLabel="Arşiv metrikleri yükleniyor…"
      error={loadError}
      onRetry={() => void loadData()}
      tableBadge="personal_archives tablosu · sayısal özet"
    >
      <section
        aria-label="Arşiv özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <SummaryStatCard label="Toplam arşiv kaydı" value={total} tone="amber" />
        <SummaryStatCard
          label="Tenant sayısı"
          value={distinctTenants}
          tone="slate"
          sublabel="Arşiv kaydı olan çalışma alanları"
        />
      </section>

      <TenantBreakdownSection
        title="Tenant bazlı arşiv sayısı"
        subtitle="Her tenant için personal_archives kayıt adedi"
        total={total}
        rows={tenantRows}
        emptyLabel="Arşiv kaydı veya tenant bilgisi yok."
      />
    </SistemSagligiDetailShell>
  );
}
