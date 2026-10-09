"use client";

import { useParams } from "next/navigation";
import ImajinasyonlarDetail from "../../components/ImajinasyonlarDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import BiyoenerjiSearchHighlight from "../../components/BiyoenerjiSearchHighlight";
import { safeImaginationId } from "@/lib/bioenergy/imaginationsRoutes";

export default function ImajinasyonlarDetailPage() {
  const params = useParams();
  const safeId = safeImaginationId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      activeSection="imajinasyonlar"
      detailCrumb="Kayıt detayı"
      badge="BİYOENERJİ · İMAJİNASYON KÜTÜPHANESİ"
      title="İmajinasyonlar"
      subtitle="Kayıt detayı — metin, not ve kaynak"
    >
      <div className="w-full min-w-0 max-w-3xl">
        <BiyoenerjiSearchHighlight recordKey={`imajinasyonlar:${safeId ?? ""}`}>
          <ImajinasyonlarDetail id={safeId} />
        </BiyoenerjiSearchHighlight>
      </div>
    </BiyoenerjiSectionShell>
  );
}
