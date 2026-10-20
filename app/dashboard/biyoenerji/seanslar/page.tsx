import BiyoenerjiSeanslari from "../components/BiyoenerjiSeanslari";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function BiyoenerjiSeanslarPage() {
  return (
    <BiyoenerjiPremiumShell
      badge="BİYOENERJİ · SEANS"
      titleHead="Biyoenerji Seansları"
      subtitle="Enerji analizleri, seans kayıtları ve çalışma notları"
      heroSrc="/premium/biyoenerji/seanslar-hero.webp"
      heroWidth={1848}
      heroHeight={408}
    >
      <BfcacheRefreshHandler />
      <BiyoenerjiSeanslari />
    </BiyoenerjiPremiumShell>
  );
}
