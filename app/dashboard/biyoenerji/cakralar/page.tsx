import Cakralar from "../components/Cakralar";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function CakralarPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      hideModuleNav
      badge="BİYOENERJİ · ÇAKRA KÜTÜPHANESİ"
      title="Çakra Kütüphanesi"
      subtitle="Çakralara ait temel bilgiler ve uzman içerikleri"
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-6 lg:px-8">
        <Cakralar />
      </div>
    </BiyoenerjiSectionShell>
  );
}
