import { useTranslations } from "next-intl";
import BiyoenerjiPremiumLoading from "@/app/_premium/biyoenerji/kutuphane/BiyoenerjiPremiumLoading";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiPremiumLoading
      badge={t("imajinasyonlar.badge")}
      titleHead={t("imajinasyonlar.titleHead")}
      titleAccent={t("imajinasyonlar.titleAccent")}
      subtitle={t("imajinasyonlar.subtitle")}
      heroSrc="/premium/biyoenerji/imajinasyon-hero.webp"
      heroWidth={1436}
      heroHeight={412}
    />
  );
}
