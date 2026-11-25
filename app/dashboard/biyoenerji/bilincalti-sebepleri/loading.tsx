import { useTranslations } from "next-intl";
import BiyoenerjiPremiumLoading from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumLoading";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumLoading
      badge={t("bilincalti-sebepleri.badge")}
      titleHead={t("bilincalti-sebepleri.titleHead")}
      titleAccent={t("bilincalti-sebepleri.titleAccent")}
      subtitle={t("bilincalti-sebepleri.subtitle")}
      heroSrc="/premium/biyoenerji/bilincalti-hero.webp"
      heroWidth={1212}
      heroHeight={412}
    />
  );
}
