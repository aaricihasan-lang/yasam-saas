import { useTranslations } from "next-intl";
import Cakralar from "../components/Cakralar";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function CakralarPage() {
  const t = useTranslations("bioenergy.pages");
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      hideModuleNav
      badge={t("cakralar.badge")}
      title={t("cakralar.title")}
      subtitle={t("cakralar.subtitle")}
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-6 lg:px-8">
        <Cakralar />
      </div>
    </BiyoenerjiSectionShell>
  );
}
