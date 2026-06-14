"use client";

import { useParams } from "next/navigation";
import BilincaltiSebepleriDetail from "../../components/BilincaltiSebepleriDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";
import { safeSubconsciousCauseId } from "@/lib/bioenergy/subconsciousCausesRoutes";

export default function BilincaltiSebepleriDetailPage() {
  const params = useParams();
  const safeId = safeSubconsciousCauseId(params?.id);

  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      badge="BİYOENERJİ · BİLİNÇALTI KÜTÜPHANESİ"
      title="Bilinçaltı Sebepleri"
      subtitle="Kayıt detayı — içerik ve notlar"
    >
      <div className="w-full min-w-0 max-w-4xl">
        <BilincaltiSebepleriDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
