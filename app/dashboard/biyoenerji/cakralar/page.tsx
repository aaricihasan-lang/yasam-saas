import Cakralar from "../components/Cakralar";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function CakralarPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · ÇAKRA KÜTÜPHANESİ"
      title="Çakra Kütüphanesi"
      subtitle="Enerji merkezleri, organlar, renkler ve çakra notları"
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-6 lg:px-8">
        <Cakralar />
      </div>
    </BiyoenerjiSectionShell>
  );
}
