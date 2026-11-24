import { useTranslations } from "next-intl";
import { BiyoenerjiDetailLoading } from "../../components/BiyoenerjiSkeleton";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiDetailLoading
      badge={t("imajinasyonlar.detail.badge")}
      title={t("imajinasyonlar.detail.title")}
      subtitle={t("imajinasyonlar.detail.subtitle")}
    />
  );
}
