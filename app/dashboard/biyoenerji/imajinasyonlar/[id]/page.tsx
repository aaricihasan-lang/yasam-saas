"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import ImajinasyonlarDetail from "../../components/ImajinasyonlarDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import BiyoenerjiSearchHighlight from "../../components/BiyoenerjiSearchHighlight";
import { safeImaginationId } from "@/lib/bioenergy/imaginationsRoutes";

export default function ImajinasyonlarDetailPage() {
  const t = useTranslations("bioenergy.pages");
  const params = useParams();
  const safeId = safeImaginationId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      activeSection="imajinasyonlar"
      detailCrumb={t("imajinasyonlar.detail.detailCrumb")}
      badge={t("imajinasyonlar.detail.badge")}
      title={t("imajinasyonlar.detail.title")}
      subtitle={t("imajinasyonlar.detail.subtitle")}
    >
      <div className="w-full min-w-0 max-w-3xl">
        <BiyoenerjiSearchHighlight recordKey={`imajinasyonlar:${safeId ?? ""}`}>
          <ImajinasyonlarDetail id={safeId} />
        </BiyoenerjiSearchHighlight>
      </div>
    </BiyoenerjiSectionShell>
  );
}
