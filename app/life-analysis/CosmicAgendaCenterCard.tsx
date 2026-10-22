"use client";

/**
 * Yaşam Analiz Merkezi → Yaşam Takvimi / Kozmik Ajanda kartı (2026-10-17 owner kararı: modül ana panelde ayrı kart
 * değil, bu merkezin içinde). Adres DEĞİŞMEDİ: /cosmic-calendar (eski bağlantılar ve yer imleri çalışır); hesaplama ve
 * iş mantığına dokunulmadı.
 *
 * Görünürlük yalnız kullanıcının GERÇEK cosmic_calendar yetkisiyle (sistem sahibi her zaman görür). Canlı
 * module_permissions syncYasamUserFromDb ile kesinleşmeden kart çizilmez (fail-closed, yanıp sönme yok). Bu yalnız
 * görünürlüktür: sayfa ModuleRouteGuard (routeModuleAccess /cosmic-calendar kuralı), API'ler requireModuleAccess
 * ("cosmic_calendar") ile ayrıca korunur.
 *
 * 2026-10-21 görünüm: ortak AnalysisModuleCard (variant "cosmicAgenda") — "Aktif" etiketi ve sağ alt ok korunur.
 */
import { useEffect, useState } from "react";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb } from "@/lib/auth/yasamUser";
import AnalysisModuleCard from "./_components/AnalysisModuleCard";

export default function CosmicAgendaCenterCard() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setAllowed(hasModulePermission(fresh ?? cached ?? null, "cosmic_calendar"));
      })
      .catch(() => {
        if (!cancelled) setAllowed(hasModulePermission(cached ?? null, "cosmic_calendar"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) return null;

  return (
    <AnalysisModuleCard
      variant="cosmicAgenda"
      href="/cosmic-calendar"
      title="Yaşam Takvimi / Kozmik Ajanda"
      description="Hicri takvim, hacamat günleri, ay evreleri ve günlük kozmik akış."
      status="Aktif"
      arrow
      testId="life-analysis-cosmic-card"
    />
  );
}
