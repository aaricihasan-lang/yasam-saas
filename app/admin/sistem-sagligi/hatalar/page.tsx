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

export default function SistemSagligiHatalarPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [tableAvailable, setTableAvailable] = useState(false);

  const probeTables = useCallback(async () => {
    setLoading(true);
    // AA-2: aday tablolar sunucuda (admin route) yoklanır; tarayıcıdan tablo erişimi YOK.
    const found = await probeSistemSagligiTables("errors");
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
      title="Son Hata Kaydı"
      description="Sistem hata ve kritik olay kayıtlarının yönetimsel özeti."
      headerGradient="from-slate-900 via-rose-900 to-red-800"
      loading={loading}
      loadingLabel="Hata altyapısı kontrol ediliyor…"
    >
      {tableAvailable ? (
        <PremiumPlaceholderPanel
          title="Hata tablosu algılandı"
          description="Tablo mevcut; detaylı hata listesi bir sonraki aşamada bu ekrana bağlanacak. Şimdilik yalnızca altyapı kontrolü yapıldı."
        />
      ) : (
        <PremiumPlaceholderPanel
          title="Hata kayıt tablosu henüz bağlanmadı"
          description="Supabase üzerinde tanımlı bir hata günlüğü tablosu bulunamadı. Gerçek hata kayıtları sonraki aşamada bu modüle eklenecek."
        />
      )}
    </SistemSagligiDetailShell>
  );
}
