import SembolDili from "../components/SembolDili";
import BiyoenerjiSectionShell from "../components/BiyoenerjiSectionShell";

export default function SembolDiliPage() {
  return (
    <BiyoenerjiSectionShell
      badge="BİYOENERJİ · SEMBOL"
      title="Sembol Dili"
      subtitle="Semboller, anlamlar ve enerji dili sözlüğü"
    >
      <SembolDili />
    </BiyoenerjiSectionShell>
  );
}
