import BilincaltiSebepleri from "../components/BilincaltiSebepleri";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function BilincaltiSebepleriPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · BİLİNÇALTI KÜTÜPHANESİ"
      title="Bilinçaltı Sebepleri Kütüphanesi"
      subtitle="Arama yapın, karttan detayı açın — kök nedenler ve dönüşüm notları"
    >
      <BilincaltiSebepleri />
    </BiyoenerjiSectionShell>
  );
}
