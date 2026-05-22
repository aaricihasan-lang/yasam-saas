import EnerjiBedenleri from "../components/EnerjiBedenleri";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function EnerjiBedenleriPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · KATMAN"
      title="Enerji Bedenleri"
      subtitle="Aura, eterik, astral ve enerji katman bilgileri — kayıt seçin, detayları okuyun ve düzenleyin"
    >
      <EnerjiBedenleri />
    </BiyoenerjiSectionShell>
  );
}
