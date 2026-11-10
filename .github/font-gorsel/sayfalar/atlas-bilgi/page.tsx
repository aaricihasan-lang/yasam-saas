"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Atlas "kb" (Bilgi Bankası) görünümü: gerçek AtlasPremiumHero, sayfadaki metinler.
import { AtlasPremiumHero, ap } from "@/app/admin/astroloji/_components/atlas/premium/AtlasPremium";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const bos = () => {};

export default function Page() {
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden ${ap.page}`}>
      <AtlasPremiumHero
        view="kb"
        onNavigate={bos}
        skyToolsHref="/zz-ekran/atlas-giris"
        scene="bilgi"
        eyebrow="Çalışma alanı"
        title="Bilgi Bankası"
        sub="Kendi yorumlarınız ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir."
      />
    </main>
  );
}
