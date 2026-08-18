import BiyoenerjiSeanslari from "../components/BiyoenerjiSeanslari";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function BiyoenerjiSeanslarPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      activeSection="seanslar"
      badge="BİYOENERJİ · SEANS"
      title="Biyoenerji Seansları"
      subtitle="Enerji analizleri, seans kayıtları ve çalışma notları"
    >
      <BfcacheRefreshHandler />
      <BiyoenerjiSeanslari />
    </BiyoenerjiSectionShell>
  );
}
