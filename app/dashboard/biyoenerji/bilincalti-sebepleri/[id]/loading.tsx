import { useTranslations } from "next-intl";
import { BiyoenerjiDetailLoading } from "../../components/BiyoenerjiSkeleton";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiDetailLoading
      badge={t("bilincalti-sebepleri.detail.badge")}
      title={t("bilincalti-sebepleri.detail.title")}
      subtitle={t("bilincalti-sebepleri.detail.subtitle")}
    />
  );
}
