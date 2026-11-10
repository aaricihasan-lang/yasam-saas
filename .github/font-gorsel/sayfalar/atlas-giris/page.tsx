"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). app/admin/astroloji/page.tsx "home" görünümünün birebir sarmalayıcısı +
// gerçek AtlasHero; geri çağrılar boş (gezinme / veri / istek yok). Horary ve Gökyüzü Araçları bağlantıları da çizilir.
import AtlasHero from "@/app/admin/astroloji/_components/atlas/AtlasHero";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const bos = () => {};

export default function Page() {
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden bg-[#f7f4fb]`}>
      <AtlasHero onNavigate={bos} onRecent={bos} onNewProfile={bos} onSoon={bos} onHorary={bos} skyToolsHref="/zz-ekran/atlas-giris" />
    </main>
  );
}
