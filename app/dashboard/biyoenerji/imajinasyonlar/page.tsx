import Imajinasyonlar from "../components/Imajinasyonlar";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function ImajinasyonlarPage() {
  return (
    <BiyoenerjiPremiumShell
      badge="BİYOENERJİ · İMAJİNASYON KÜTÜPHANESİ"
      titleHead="İmajinasyon "
      titleAccent="Kütüphanesi"
      subtitle="Görselleştirme, rehberli çalışmalar ve seans imgeleri"
      heroSrc="/premium/biyoenerji/imajinasyon-hero.webp"
      heroWidth={1436}
      heroHeight={412}
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <Imajinasyonlar />
      </div>
    </BiyoenerjiPremiumShell>
  );
}
