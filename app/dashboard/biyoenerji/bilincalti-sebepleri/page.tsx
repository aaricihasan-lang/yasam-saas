import { useTranslations } from "next-intl";
import BilincaltiSebepleri from "../components/BilincaltiSebepleri";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function BilincaltiSebepleriPage() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumShell
      badge={t("bilincalti-sebepleri.badge")}
      titleHead={t("bilincalti-sebepleri.titleHead")}
      titleAccent={t("bilincalti-sebepleri.titleAccent")}
      subtitle={t("bilincalti-sebepleri.subtitle")}
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
