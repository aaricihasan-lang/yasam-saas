import BiyoenerjiPremiumLoading from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumLoading";

export default function Loading() {
  return (
    <BiyoenerjiPremiumLoading
      badge="BİYOENERJİ · SEMBOL DİLİ KÜTÜPHANESİ"
      titleHead="Sembol Dili "
      titleAccent="Kütüphanesi"
      subtitle="Semboller, anlamlar ve bilinçaltı mesajları"
      heroSrc="/premium/biyoenerji/sembol-hero.webp"
      heroWidth={1624}
      heroHeight={384}
    />
  );
}
