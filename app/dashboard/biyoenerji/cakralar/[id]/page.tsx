"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import CakralarDetail from "../../components/CakralarDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import BiyoenerjiSearchHighlight from "../../components/BiyoenerjiSearchHighlight";
import { safeChakraId } from "@/lib/bioenergy/chakrasRoutes";

export default function CakralarDetailPage() {
  const t = useTranslations("bioenergy.pages");
  const params = useParams();
  const safeId = safeChakraId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      badge={t("cakralar.detail.badge")}
      title={t("cakralar.detail.title")}
      subtitle={t("cakralar.detail.subtitle")}
    >
      <div className="w-full min-w-0 max-w-6xl">
        <BiyoenerjiSearchHighlight recordKey={`cakralar:${safeId ?? ""}`}>
          <CakralarDetail id={safeId} />
        </BiyoenerjiSearchHighlight>
      </div>
    </BiyoenerjiSectionShell>
  );
}
