/** Ayrı okuma sayfası iskeleti (route geçişinde anlık boş ekran yerine sade yükleniyor). */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#faf6f0] px-0 py-3 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="border-y border-amber-100/90 bg-white/95 p-4 sm:p-5 lg:rounded-2xl lg:border lg:p-7">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-64 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
