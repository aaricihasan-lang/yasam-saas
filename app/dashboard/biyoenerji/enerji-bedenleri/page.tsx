import EnerjiBedenleri from "../components/EnerjiBedenleri";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function EnerjiBedenleriPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · KATMAN"
      title="Enerji Bedenleri"
      subtitle="Aura, eterik, astral ve enerji katman bilgileri — kayıt seçin, detayları okuyun ve düzenleyin"
    >
      <BfcacheRefreshHandler />
      <EnerjiBedenleri />
    </BiyoenerjiSectionShell>
  );
}
