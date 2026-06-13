import Imajinasyonlar from "../components/Imajinasyonlar";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function ImajinasyonlarPage() {
  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · İMAJİNASYON KÜTÜPHANESİ"
      title="İmajinasyon Kütüphanesi"
      subtitle="Görselleştirme, rehberli çalışmalar ve seans imgeleri"
    >
      <BfcacheRefreshHandler />
      <div className="w-full min-w-0 max-w-none px-0 sm:px-2 lg:px-4 xl:px-6 2xl:px-8">
        <Imajinasyonlar />
      </div>
    </BiyoenerjiSectionShell>
  );
}
