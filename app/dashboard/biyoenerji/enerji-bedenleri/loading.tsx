import EnerjiBedenleriShell from "../components/EnerjiBedenleriShell";

function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-violet-100/60 ${className}`} />;
}

// Premium kabukla aynı yerleşimde hafif iskelet (rota geçişinde düzen sıçraması olmaz).
export default function Loading() {
  return (
    <EnerjiBedenleriShell
      badge="BİYOENERJİ · KATMAN"
      title="Enerji Bedenleri"
      subtitle="Aura, eterik, astral ve enerji katman bilgileri — kayıt seçin, detayları okuyun ve düzenleyin"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(300px,440px)_minmax(0,1fr)] lg:gap-4">
        <Line className="h-[84px]" />
        <Line className="h-[84px]" />
        <Line className="h-[320px]" />
        <Line className="hidden h-[320px] lg:block" />
      </div>
    </EnerjiBedenleriShell>
  );
}
