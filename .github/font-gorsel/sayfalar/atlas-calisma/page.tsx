"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Atlas "new" (Yeni Analiz) görünümünün çalışma çubuğu: gerçek AtlasWorkBar.
import { AtlasWorkBar, ap } from "@/app/admin/astroloji/_components/atlas/premium/AtlasPremium";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

export default function Page() {
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden ${ap.page}`}>
      <AtlasWorkBar onNavigate={() => {}} />
    </main>
  );
}
