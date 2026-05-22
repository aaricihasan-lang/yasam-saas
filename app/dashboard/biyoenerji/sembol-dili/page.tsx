import SembolDili from "../components/SembolDili";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function SembolDiliPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · SEMBOL DİLİ KÜTÜPHANESİ"
      title="Sembol Dili Kütüphanesi"
      subtitle="Semboller, anlamlar ve bilinçaltı mesajları"
    >
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <SembolDili />
      </div>
    </BiyoenerjiSectionShell>
  );
}
