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
      badge="BİYOENERJİ · ÇAKRA KÜTÜPHANESİ"
      title="Çakralar"
      subtitle="Kayıt detayı — organ, renk, taş ve enerji notları"
    >
      <div className="w-full min-w-0 max-w-none px-4 sm:px-6 lg:px-8 xl:px-12">
        <CakralarDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
