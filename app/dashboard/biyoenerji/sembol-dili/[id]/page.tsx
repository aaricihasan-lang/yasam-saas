"use client";

import { useParams } from "next/navigation";
import SembolDiliDetail from "../../components/SembolDiliDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import { safeSymbolLanguageId } from "@/lib/bioenergy/symbolLanguageRoutes";

export default function SembolDiliDetailPage() {
  const params = useParams();
  const safeId = safeSymbolLanguageId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · SEMBOL DİLİ KÜTÜPHANESİ"
      title="Sembol Dili"
      subtitle="Kayıt detayı — anlam ve bilinçaltı mesajı"
    >
      <div className="w-full min-w-0 max-w-none px-4 sm:px-6 lg:px-12">
        <SembolDiliDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
