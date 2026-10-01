"use client";

import { useCallback, useEffect, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  AccessDeniedScreen,
  LoadingScreen,
  PremiumPlaceholderPanel,
  probeSistemSagligiTables,
  SistemSagligiDetailShell,
  useSistemSagligiAdminGate,
} from "../detail-shared";

export default function SistemSagligiYedeklerPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [tableAvailable, setTableAvailable] = useState(false);

  const probeTables = useCallback(async () => {
    setLoading(true);
    // AA-2: aday tablolar sunucuda (admin route) yoklanır; tarayıcıdan tablo erişimi YOK.
    const found = await probeSistemSagligiTables("backups");
    setTableAvailable(found);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void probeTables();
  }, [checked, allowed, probeTables]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Son Yedek Tarihi"
      description="Yedekleme geçmişi ve son başarılı yedekleme bilgisi."
      headerGradient="from-slate-900 via-sky-900 to-cyan-800"
      loading={loading}
      loadingLabel="Yedekleme altyapısı kontrol ediliyor…"
    >
      {tableAvailable ? (
        <PremiumPlaceholderPanel
          title="Yedekleme tablosu algılandı"
          description="Tablo mevcut; yedekleme listesi bir sonraki aşamada bu ekrana bağlanacak."
        />
      ) : (
        <PremiumPlaceholderPanel
          title="Yedekleme altyapısı sonraki aşamada bağlanacak"
          description="Supabase üzerinde tanımlı bir yedekleme tablosu bulunamadı. Yedekleme geçmişi ve otomatik yedek özeti ilerleyen sürümde eklenecek."
        />
      )}
    </SistemSagligiDetailShell>
  );
}
