import { useTranslations } from "next-intl";
import BiyoenerjiPremiumLoading from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumLoading";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumLoading
      badge={t("sembol-dili.badge")}
      titleHead={t("sembol-dili.titleHead")}
      titleAccent={t("sembol-dili.titleAccent")}
      subtitle={t("sembol-dili.subtitle")}
      heroSrc="/premium/biyoenerji/sembol-hero.webp"
      heroWidth={1624}
      heroHeight={384}
    />
  );
}
