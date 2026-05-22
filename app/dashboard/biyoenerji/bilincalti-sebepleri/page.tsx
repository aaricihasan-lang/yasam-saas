import BilincaltiSebepleri from "../components/BilincaltiSebepleri";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function BilincaltiSebepleriPage() {
  return (
    <BiyoenerjiSectionShell
      badge="BİYOENERJİ · BİLİNÇALTI"
      title="Bilinçaltı Sebepleri"
      subtitle="Kök nedenler, içsel bloklar ve dönüşüm notları"
    >
      <BilincaltiSebepleri />
    </BiyoenerjiSectionShell>
  );
}
