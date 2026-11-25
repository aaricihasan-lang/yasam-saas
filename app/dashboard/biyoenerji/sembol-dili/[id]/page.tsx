"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import SembolDiliDetail from "../../components/SembolDiliDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import BiyoenerjiSearchHighlight from "../../components/BiyoenerjiSearchHighlight";
import { safeSymbolLanguageId } from "@/lib/bioenergy/symbolLanguageRoutes";

export default function SembolDiliDetailPage() {
  const t = useTranslations("bioenergy.pages");
  const params = useParams();
  const safeId = safeSymbolLanguageId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      activeSection="sembol-dili"
      detailCrumb={t("sembol-dili.detail.detailCrumb")}
      badge={t("sembol-dili.detail.badge")}
      title={t("sembol-dili.detail.title")}
      subtitle={t("sembol-dili.detail.subtitle")}
    >
      <div className="w-full min-w-0 max-w-3xl">
        <BiyoenerjiSearchHighlight recordKey={`sembol-dili:${safeId ?? ""}`}>
          <SembolDiliDetail id={safeId} />
        </BiyoenerjiSearchHighlight>
      </div>
    </BiyoenerjiSectionShell>
  );
}
