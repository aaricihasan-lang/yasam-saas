import { useTranslations } from "next-intl";
import SembolDili from "../components/SembolDili";
import BiyoenerjiPremiumShell from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function SembolDiliPage() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumShell
      badge={t("sembol-dili.badge")}
      titleHead={t("sembol-dili.titleHead")}
      titleAccent={t("sembol-dili.titleAccent")}
      subtitle={t("sembol-dili.subtitle")}
      heroSrc="/premium/biyoenerji/sembol-hero.webp"
      heroWidth={1624}
      heroHeight={384}
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <SembolDili />
      </div>
    </BiyoenerjiPremiumShell>
  );
}
