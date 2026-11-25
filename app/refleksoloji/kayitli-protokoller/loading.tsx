import { useTranslations } from "next-intl";
import { RefleksolojiListLoading } from "../components/RefleksolojiSkeleton";

export default function Loading() {
  const t = useTranslations("system.loading.refleksoloji");
  return (
    <RefleksolojiListLoading badge={t("savedProtocolsBadge")} title={t("savedProtocols")} />
  );
}
