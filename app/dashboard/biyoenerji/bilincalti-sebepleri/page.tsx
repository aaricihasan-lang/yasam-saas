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
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <BilincaltiSebepleri />
      </div>
    </BiyoenerjiSectionShell>
  );
}
