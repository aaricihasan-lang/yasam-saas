import EnerjiBedenleri from "../components/EnerjiBedenleri";
import EnerjiBedenleriShell from "@/app/_premium/biyoenerji/enerji-bedenleri/EnerjiBedenleriShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function EnerjiBedenleriPage() {
  return (
    <EnerjiBedenleriShell
      badge="BİYOENERJİ · KATMAN"
      title="Enerji Bedenleri"
      subtitle="Aura, eterik, astral ve enerji katman bilgileri — kayıt seçin, detayları okuyun ve düzenleyin"
    >
      <BfcacheRefreshHandler />
      <EnerjiBedenleri />
    </EnerjiBedenleriShell>
  );
}
