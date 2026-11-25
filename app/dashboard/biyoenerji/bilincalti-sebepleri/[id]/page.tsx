"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import BilincaltiSebepleriDetail from "../../components/BilincaltiSebepleriDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import BiyoenerjiSearchHighlight from "../../components/BiyoenerjiSearchHighlight";
import { safeSubconsciousCauseId } from "@/lib/bioenergy/subconsciousCausesRoutes";

export default function BilincaltiSebepleriDetailPage() {
  const t = useTranslations("bioenergy.pages");
  const params = useParams();
  const safeId = safeSubconsciousCauseId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      activeSection="bilincalti-sebepleri"
      detailCrumb={t("bilincalti-sebepleri.detail.detailCrumb")}
      badge={t("bilincalti-sebepleri.detail.badge")}
      title={t("bilincalti-sebepleri.detail.title")}
      subtitle={t("bilincalti-sebepleri.detail.subtitle")}
    >
      <div className="w-full min-w-0 max-w-3xl">
        <BiyoenerjiSearchHighlight recordKey={`bilincalti-sebepleri:${safeId ?? ""}`}>
          <BilincaltiSebepleriDetail id={safeId} />
        </BiyoenerjiSearchHighlight>
      </div>
    </BiyoenerjiSectionShell>
  );
}
