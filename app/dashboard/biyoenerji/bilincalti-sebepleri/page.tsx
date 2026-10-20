import BilincaltiSebepleri from "../components/BilincaltiSebepleri";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function BilincaltiSebepleriPage() {
  return (
    <BiyoenerjiPremiumShell
      badge="BİYOENERJİ · BİLİNÇALTI KÜTÜPHANESİ"
      titleHead="Bilinçaltı Sebepleri "
      titleAccent="Kütüphanesi"
      subtitle="Arama yapın, karttan detayı açın — kök nedenler ve dönüşüm notları"
      heroSrc="/premium/biyoenerji/bilincalti-hero.webp"
      heroWidth={1212}
      heroHeight={412}
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <BilincaltiSebepleri />
      </div>
    </BiyoenerjiPremiumShell>
  );
}
