import BiyoenerjiSectionShell from "./BiyoenerjiSectionShell";

/**
 * Rota geçişlerinde (loading.tsx) gösterilen hafif iskelet.
 *
 * Amaç: Biyoenerji iç modüllerine ve detay sayfalarına tıklandığında ANINDA
 * görsel geri bildirim vermek — boş beyaz bekleme olmaz. Next.js bu iskeleti
 * Suspense fallback olarak prefetch eder; dinamik detay rotalarında ([id])
 * kısmi prefetch'i de etkinleştirir (aksi halde prefetch atlanır).
 *
 * Salt sunum; veri yüklemez, tasarım dilini (violet/cyan, yuvarlak, pulse) korur.
 */

function Line({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

/** Liste sayfaları için iskelet (arama alanı + kart/satır yer tutucular). */
export function BiyoenerjiListSkeleton() {
  return (
    <section className="rounded-3xl border border-violet-100/70 bg-white/70 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-violet-100/60 pb-4">
        <Line className="h-10 w-full max-w-md" />
        <div className="flex gap-2">
          <Line className="h-4 w-24" />
          <Line className="h-4 w-20" />
          <Line className="h-4 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-[180px] flex-col gap-3 rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm"
          >
            <Line className="h-5 w-24 rounded-full" />
            <Line className="h-4 w-3/4" />
            <Line className="h-3 w-full" />
            <Line className="h-3 w-5/6" />
            <div className="mt-auto">
              <Line className="h-8 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Detay sayfaları için iskelet (başlık + içerik bölümleri yer tutucu). */
export function BiyoenerjiDetailSkeleton() {
  return (
    <div className="w-full min-w-0 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0 flex-1 space-y-3">
          <Line className="h-5 w-28 rounded-full" />
          <Line className="h-9 w-2/3" />
          <Line className="h-3 w-32" />
        </div>
        <div className="flex gap-2">
          <Line className="h-10 w-24 rounded-xl" />
          <Line className="h-10 w-20 rounded-xl" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <section key={i} className="border-t border-slate-200/60 py-5">
          <Line className="h-3 w-28" />
          <div className="mt-3 space-y-2">
            <Line className="h-3.5 w-full" />
            <Line className="h-3.5 w-11/12" />
            <Line className="h-3.5 w-4/5" />
          </div>
        </section>
      ))}
    </div>
  );
}

/** Liste rotası loading.tsx için tam ekran (shell + iskelet). */
export function BiyoenerjiListLoading({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle: string;
}) {
  return (
    <BiyoenerjiSectionShell headerVariant="premium" badge={badge} title={title} subtitle={subtitle}>
      <BiyoenerjiListSkeleton />
    </BiyoenerjiSectionShell>
  );
}

/** Detay rotası loading.tsx için tam ekran (shell + iskelet). */
export function BiyoenerjiDetailLoading({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle: string;
}) {
  return (
    <BiyoenerjiSectionShell headerVariant="detail" badge={badge} title={title} subtitle={subtitle}>
      <div className="w-full min-w-0 max-w-5xl">
        <BiyoenerjiDetailSkeleton />
      </div>
    </BiyoenerjiSectionShell>
  );
}
