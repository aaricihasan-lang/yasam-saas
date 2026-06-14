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
      headerVariant="detail"
      badge="BİYOENERJİ · SEMBOL DİLİ KÜTÜPHANESİ"
      title="Sembol Dili"
      subtitle="Kayıt detayı — anlam ve bilinçaltı mesajı"
    >
      <div className="w-full min-w-0 max-w-4xl">
        <SembolDiliDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
