import { useTranslations } from "next-intl";
import { BiyoenerjiDetailLoading } from "../../components/BiyoenerjiSkeleton";

export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiDetailLoading
      badge={t("sembol-dili.detail.badge")}
      title={t("sembol-dili.detail.title")}
      subtitle={t("sembol-dili.detail.subtitle")}
    />
  );
}
