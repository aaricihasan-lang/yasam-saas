"use client";

/**
 * Yaşam Analiz Merkezi → Gökyüzü Atlası kartı (2026-10-15 owner kararı: Atlas ana panelde ayrı kart değil, merkezin
 * içinde). Görünürlük SUNUCUNUN erişim yoklamasıyla belirlenir (fail-closed): /api/astroloji/access yalnız sistem
 * sahibine ve Astroloji yetkisi açık uzmana 200 döner; diğer herkese tek tip 404 → kart hiç çizilmez (modülün varlığı
 * sızmaz, yanıp sönme yok). Sayfa ve API ayrıca kendi kapılarıyla korunur; bu yalnız görünürlüktür.
 * Adres değişmedi: /astroloji (eski bağlantılar ve yer imleri çalışır).
 *
 * 2026-10-16 görünüm: ortak AnalysisModuleCard (variant "skyAtlas") — renk/dekor/3D tek kaynakta (_components).
 * 2026-10-21: kart zemini referans görselinden (premium/analizMerkezi.module.css + public/premium/analiz-merkezi). Kart diğer modül kartlarıyla AYNI genişlikte (tek hücre).
 */
import { useEffect, useState } from "react";
import { probeAstroAccess } from "@/app/admin/astroloji/_lib/api";
import AnalysisModuleCard from "./_components/AnalysisModuleCard";

export default function AtlasCenterCard() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    // D8: demo hesabı salt okunur örnek görünümüyle kartı görür (probeAstroAccess demo dalı).
    void probeAstroAccess().then((r) => {
      if (alive) setAllowed(r.ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!allowed) return null;
  return (
    <AnalysisModuleCard
      variant="skyAtlas"
      href="/astroloji"
      title="Gökyüzü Atlası"
      description="Tüm astroloji analizleri, danışan arşivi ve haritalı Word / PDF raporları."
      testId="life-analysis-atlas-card"
    />
  );
}
