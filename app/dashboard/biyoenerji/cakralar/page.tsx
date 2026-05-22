import Cakralar from "../components/Cakralar";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function CakralarPage() {
  return (
    <BiyoenerjiSectionShell
      badge="BİYOENERJİ · ÇAKRA"
      title="Çakralar"
      subtitle="Enerji merkezleri, denge alanları ve çakra notları"
    >
      <Cakralar />
    </BiyoenerjiSectionShell>
  );
}
