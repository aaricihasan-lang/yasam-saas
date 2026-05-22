import BiyoenerjiSeanslari from "../components/BiyoenerjiSeanslari";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function BiyoenerjiSeanslarPage() {
  return (
    <BiyoenerjiSectionShell
      badge="BİYOENERJİ · SEANS"
      title="Biyoenerji Seansları"
      subtitle="Enerji analizleri, seans kayıtları ve çalışma notları"
    >
      <BiyoenerjiSeanslari />
    </BiyoenerjiSectionShell>
  );
}
