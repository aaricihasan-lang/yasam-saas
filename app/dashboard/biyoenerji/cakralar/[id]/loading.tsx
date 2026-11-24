import { useTranslations } from "next-intl";
import { BiyoenerjiDetailLoading } from "../../components/BiyoenerjiSkeleton";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiDetailLoading
      badge={t("cakralar.detail.badge")}
      title={t("cakralar.detail.title")}
      subtitle={t("cakralar.detail.subtitle")}
    />
  );
}
