"use client";

import { useParams } from "next/navigation";
import CakralarDetail from "../../components/CakralarDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import { safeChakraId } from "@/lib/bioenergy/chakrasRoutes";

export default function CakralarDetailPage() {
  const params = useParams();
  const safeId = safeChakraId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      activeSection="cakralar"
      detailCrumb="Kayıt detayı"
      badge="BİYOENERJİ · ÇAKRA KÜTÜPHANESİ"
      title="Çakralar"
      subtitle="Kayıt detayı — organ, renk, taş ve enerji notları"
    >
      <div className="w-full min-w-0 max-w-3xl">
        <CakralarDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
