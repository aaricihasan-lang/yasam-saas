import { useTranslations } from "next-intl";
import BiyoenerjiSeanslari from "../components/BiyoenerjiSeanslari";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function BiyoenerjiSeanslarPage() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumShell
      badge={t("seanslar.badge")}
      titleHead={t("seanslar.titleHead")}
      subtitle={t("seanslar.subtitle")}
      heroSrc="/premium/biyoenerji/seanslar-hero.webp"
      heroWidth={1848}
      heroHeight={408}
    >
      <BfcacheRefreshHandler />
      <BiyoenerjiSeanslari />
    </BiyoenerjiPremiumShell>
  );
}
