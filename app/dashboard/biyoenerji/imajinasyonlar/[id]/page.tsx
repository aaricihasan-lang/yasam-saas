"use client";

import { useParams } from "next/navigation";
import ImajinasyonlarDetail from "../../components/ImajinasyonlarDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import { safeImaginationId } from "@/lib/bioenergy/imaginationsRoutes";

export default function ImajinasyonlarDetailPage() {
  const params = useParams();
  const safeId = safeImaginationId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      badge="BİYOENERJİ · İMAJİNASYON KÜTÜPHANESİ"
      title="İmajinasyonlar"
      subtitle="Kayıt detayı — metin, not ve kaynak"
    >
      <div className="w-full min-w-0 max-w-5xl">
        <ImajinasyonlarDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
