"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Atlas "archive" görünümü: gerçek AtlasPremiumHero + AtlasMetrics,
// sayfadaki metinlerle; metrik değerleri SENTETİK (gerçek danışan verisi yok).
import { CalendarDays, ScrollText, Users } from "lucide-react";
import { AtlasMetric, AtlasMetrics, AtlasPremiumHero, ap } from "@/app/admin/astroloji/_components/atlas/premium/AtlasPremium";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const bos = () => {};

export default function Page() {
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden ${ap.page}`}>
      <AtlasPremiumHero
        view="archive"
        onNavigate={bos}
        skyToolsHref="/zz-ekran/atlas-giris"
        scene="genel"
        eyebrow="Kayıtlar"
        title="Analiz Arşivi"
        sub="Kayıtlı analizi olan danışanlar; bir satıra basarak danışan dosyasını açın."
        aside={
          <AtlasMetrics columns={3}>
            <AtlasMetric icon={<Users className="h-5 w-5" />} label="Toplam danışan" value={12} />
            <AtlasMetric icon={<ScrollText className="h-5 w-5" />} label="Toplam analiz" value={37} />
            <AtlasMetric icon={<CalendarDays className="h-5 w-5" />} label="Son analiz" value="08.11.2026" />
          </AtlasMetrics>
        }
      />
    </main>
  );
}
