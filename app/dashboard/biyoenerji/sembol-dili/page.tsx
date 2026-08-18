import SembolDili from "../components/SembolDili";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function SembolDiliPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      activeSection="sembol-dili"
      badge="BİYOENERJİ · SEMBOL DİLİ KÜTÜPHANESİ"
      title="Sembol Dili Kütüphanesi"
      subtitle="Semboller, anlamlar ve bilinçaltı mesajları"
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <SembolDili />
      </div>
    </BiyoenerjiSectionShell>
  );
}
