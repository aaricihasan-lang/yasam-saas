import { useTranslations } from "next-intl";
import { BiyoenerjiListLoading } from "../components/BiyoenerjiSkeleton";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiListLoading
      badge={t("cakralar.badge")}
      title={t("cakralar.title")}
      subtitle={t("cakralar.loadingSubtitle")}
    />
  );
}
