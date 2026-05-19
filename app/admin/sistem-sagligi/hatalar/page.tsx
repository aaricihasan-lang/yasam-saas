"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AccessDeniedScreen,
  LoadingScreen,
  PremiumPlaceholderPanel,
  probeSupabaseTable,
  SistemSagligiDetailShell,
  useSistemSagligiAdminGate,
} from "../detail-shared";

const ERROR_TABLE_CANDIDATES = [
  "error_logs",
  "system_errors",
  "app_error_logs",
  "hata_kayitlari",
] as const;

export default function SistemSagligiHatalarPage() {
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [tableAvailable, setTableAvailable] = useState(false);

  const probeTables = useCallback(async () => {
    setLoading(true);
    let found = false;
    for (const table of ERROR_TABLE_CANDIDATES) {
      if (await probeSupabaseTable(table)) {
        found = true;
        break;
      }
    }
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
