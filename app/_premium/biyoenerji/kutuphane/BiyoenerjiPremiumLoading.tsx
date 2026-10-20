import BiyoenerjiPremiumShell from "./BiyoenerjiPremiumShell";

type ShellProps = Omit<Parameters<typeof BiyoenerjiPremiumShell>[0], "children">;

function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-violet-100/60 ${className}`} />;
}

/** Premium kabukla aynı yerleşimde hafif iskelet (rota geçişinde eski sekme/breadcrumb görünmez). Veri yüklemez. */
export default function BiyoenerjiPremiumLoading(props: ShellProps) {
  return (
    <BiyoenerjiPremiumShell {...props}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Line className="h-[84px]" />
        <Line className="h-[84px]" />
        <Line className="h-[84px]" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Line className="h-[210px]" />
        <Line className="h-[210px]" />
        <Line className="hidden h-[210px] lg:block" />
      </div>
    </BiyoenerjiPremiumShell>
  );
}
