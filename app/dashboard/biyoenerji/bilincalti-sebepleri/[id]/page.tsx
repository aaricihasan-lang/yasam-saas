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
      headerVariant="premium"
      badge="BİYOENERJİ · BİLİNÇALTI KÜTÜPHANESİ"
      title="Bilinçaltı Sebepleri"
      subtitle="Kayıt detayı — içerik ve notlar"
    >
      <div className="mx-auto w-full max-w-[1500px] px-1 sm:px-0">
        <BilincaltiSebepleriDetail id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
