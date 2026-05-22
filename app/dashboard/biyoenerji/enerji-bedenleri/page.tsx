import EnerjiBedenleri from "../components/EnerjiBedenleri";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function EnerjiBedenleriPage() {
  return (
    <BiyoenerjiSectionShell
      badge="BİYOENERJİ · KATMAN"
      title="Enerji Bedenleri"
      subtitle="Aura, eterik, astral ve enerji katman bilgileri"
    >
      <EnerjiBedenleri />
    </BiyoenerjiSectionShell>
  );
}
