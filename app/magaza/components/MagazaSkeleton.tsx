/**
 * app/magaza/components/MagazaSkeleton.tsx — Doğal Pazar (YÖN B) rota geçiş iskeletleri.
 * Saf sunum (server component). Storefront tasarım dilini korur — layout shift olmaz.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#e7ddca] ${className}`} />;
}

function HeaderBar() {
  return (
    <div className="border-b border-[#e7dfd0] bg-[#fbf8f2]">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Bar className="h-6 w-40" />
        <Bar className="hidden h-5 w-64 lg:block" />
        <Bar className="h-8 w-28 rounded-full" />
      </div>
    </div>
  );
}

export function StorefrontLoading() {
  return (
    <div className="min-h-screen bg-[#f5f0e6]" aria-busy="true">
      <div className="bg-[#2f2a24] py-1.5" />
      <HeaderBar />
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-5 sm:px-6 lg:px-8">
        <Bar className="h-[320px] w-full rounded-2xl sm:h-[400px] lg:h-[440px]" />
        <div className="mt-11 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Bar key={i} className="aspect-[3/2] w-full rounded-2xl" />)}
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[#e7dfd0] bg-[#fbf8f2]">
              <Bar className="aspect-[3/4] w-full rounded-none" />
              <div className="space-y-2 p-4"><Bar className="h-3 w-20" /><Bar className="h-4 w-3/4" /><Bar className="mt-2 h-5 w-24" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailLoading() {
  return (
    <div className="min-h-screen bg-[#f5f0e6]" aria-busy="true">
      <div className="bg-[#2f2a24] py-1.5" />
      <HeaderBar />
      <div className="mx-auto w-full max-w-[1280px] px-4 py-9 sm:px-6 lg:px-8">
        <Bar className="h-4 w-40" />
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[55%_45%] lg:gap-12">
          <Bar className="aspect-[4/5] w-full rounded-2xl" />
          <div className="space-y-4 pt-2">
            <Bar className="h-3 w-28" /><Bar className="h-9 w-3/4" /><Bar className="h-7 w-40" />
            <Bar className="h-4 w-full" /><Bar className="h-4 w-5/6" /><Bar className="mt-4 h-28 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
