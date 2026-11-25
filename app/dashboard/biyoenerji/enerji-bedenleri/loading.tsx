import { useTranslations } from "next-intl";
import EnerjiBedenleriShell from "@/app/_premium/biyoenerji/enerji-bedenleri/EnerjiBedenleriShell";

function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-violet-100/60 ${className}`} />;
}

// Premium kabukla aynı yerleşimde hafif iskelet (rota geçişinde düzen sıçraması olmaz).
export default function Loading() {
  const t = useTranslations("bioenergy.pages");
  return (
    <EnerjiBedenleriShell
      badge={t("enerji-bedenleri.badge")}
      title={t("enerji-bedenleri.title")}
      subtitle={t("enerji-bedenleri.subtitle")}
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
