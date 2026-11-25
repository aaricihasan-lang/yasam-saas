import { useTranslations } from "next-intl";
import BiyoenerjiPremiumLoading from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumLoading";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumLoading
      badge={t("seanslar.badge")}
      titleHead={t("seanslar.titleHead")}
      subtitle={t("seanslar.subtitle")}
      heroSrc="/premium/biyoenerji/seanslar-hero.webp"
      heroWidth={1848}
      heroHeight={408}
    />
  );
}
