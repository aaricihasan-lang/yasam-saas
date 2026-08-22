/**
 * Rota geçişlerinde (loading.tsx) gösterilen hafif iskeletler.
 *
 * Amaç: Refleksoloji hub'ına, iç modüllerine ve detay sayfalarına tıklandığında
 * ANINDA görsel geri bildirim vermek — boş beyaz/donmuş bekleme olmaz. Next.js
 * bu iskeleti Suspense fallback olarak prefetch eder; dinamik detay rotalarında
 * ([id]) loading.tsx olmadan atlanan kısmi prefetch'i de etkinleştirir.
 *
 * Salt sunum; veri yüklemez, ağ çağrısı yapmaz, tasarım dilini (violet/fuchsia
 * gradyan, yuvarlak köşe, pulse) korur. Sunucu bileşeni — ekstra client JS yok.
 */

const PAGE_BG =
  "bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-violet-200/60 ${className}`} />;
}

/** Ortak dekoratif arka plan halkaları (gerçek sayfalarla aynı his). */
function GlowLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
      <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
    </div>
  );
}

/** Hub (ana menü) iskeleti — başlık + 5 modül kartı yer tutucusu. */
export function RefleksolojiHubLoading() {
  return (
    <main
      className={`relative min-h-screen w-full overflow-x-hidden ${PAGE_BG} text-slate-900 antialiased`}
      aria-busy="true"
    >
      <GlowLayer />
      <div className="relative z-10 w-full px-3 py-4 sm:px-5 xl:px-8">
        <div className="space-y-2">
          <Bar className="h-3 w-40" />
          <Bar className="h-8 w-64" />
          <Bar className="h-4 w-80 max-w-full" />
        </div>
        <section className="mt-5 rounded-2xl border border-white/70 bg-white/40 p-3 shadow-sm ring-1 ring-white/50 backdrop-blur-xl sm:p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[190px] flex-col items-center justify-center gap-3 rounded-2xl border border-violet-100/70 bg-white/60 p-5"
              >
                <Bar className="h-9 w-9 rounded-xl" />
                <Bar className="h-5 w-28" />
                <Bar className="h-3 w-40" />
                <Bar className="h-8 w-28 rounded-full" />
              </div>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:mx-auto lg:w-[92%]">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[160px] flex-col items-center justify-center gap-3 rounded-2xl border border-violet-100/70 bg-white/60 p-5"
              >
                <Bar className="h-9 w-9 rounded-xl" />
                <Bar className="h-5 w-28" />
                <Bar className="h-3 w-36" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/** Liste sayfaları iskeleti — başlık + arama + kart ızgarası yer tutucular. */
export function RefleksolojiListLoading({
  badge = "REFLEKSOLOJİ",
  title = "Yükleniyor…",
}: {
  badge?: string;
  title?: string;
}) {
  return (
    <main
      className={`relative flex min-h-screen w-full flex-col overflow-x-hidden ${PAGE_BG} text-slate-900 antialiased`}
      aria-busy="true"
    >
      <GlowLayer />
      <div className="relative z-10 w-full px-3 py-3 lg:px-6 xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Bar className="h-3 w-40" />
            <Bar className="h-7 w-56" />
            <p className="sr-only">{`${badge} · ${title}`}</p>
          </div>
          <Bar className="h-9 w-44 rounded-xl" />
        </div>
        <Bar className="mt-3 h-9 w-full max-w-full rounded-lg" />
        <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex h-[170px] flex-col gap-3 rounded-2xl border border-violet-100/70 bg-white/70 p-4 shadow-sm"
            >
              <Bar className="h-5 w-24 rounded-full" />
              <Bar className="h-4 w-3/4" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-5/6" />
              <div className="mt-auto">
                <Bar className="h-8 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

/** Detay sayfaları iskeleti — gezinti + başlık + içerik bölümleri yer tutucular. */
export function RefleksolojiDetailLoading() {
  return (
    <main
      className={`relative flex min-h-screen w-full flex-col overflow-x-hidden ${PAGE_BG} text-slate-900 antialiased`}
      aria-busy="true"
    >
      <GlowLayer />
      <div className="relative z-10 w-full px-4 py-3 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex flex-wrap gap-2 rounded-xl border border-violet-200/50 bg-white/70 p-2.5 backdrop-blur-md">
          <Bar className="h-8 w-36 rounded-lg" />
          <Bar className="h-8 w-28 rounded-lg" />
          <Bar className="ml-auto h-8 w-32 rounded-lg" />
        </div>
        <div className="mt-3 rounded-xl border border-violet-200/50 bg-white/70 p-3 shadow-sm">
          <Bar className="h-3 w-32" />
          <Bar className="mt-2 h-7 w-2/3" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Bar className="h-5 w-24 rounded-full" />
            <Bar className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[58%_42%]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200/70 bg-white/85 p-4 shadow-sm">
                <Bar className="h-3 w-28" />
                <div className="mt-3 space-y-2">
                  <Bar className="h-3.5 w-full" />
                  <Bar className="h-3.5 w-11/12" />
                  <Bar className="h-3.5 w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden rounded-[28px] border-2 border-violet-200/80 bg-white/60 p-4 xl:block">
            <Bar className="h-5 w-40" />
            <Bar className="mt-4 h-[420px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Editör sayfaları iskeleti (Bölge/Protokol Haritası) — araç çubuğu + tuval + yan panel. */
export function RefleksolojiEditorLoading() {
  return (
    <main
      className={`relative flex min-h-screen w-full flex-col overflow-x-hidden ${PAGE_BG} text-slate-900 antialiased`}
      aria-busy="true"
    >
      <GlowLayer />
      <div className="relative z-10 w-full px-3 py-3 lg:px-6 xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Bar className="h-3 w-40" />
            <Bar className="h-7 w-56" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-9 w-28 rounded-xl" />
            <Bar className="h-9 w-24 rounded-xl" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[28px] border-2 border-violet-200/80 bg-white/60 p-4">
            <Bar className="h-[520px] w-full rounded-2xl" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-violet-100/70 bg-white/70 p-4 shadow-sm">
                <Bar className="h-4 w-32" />
                <Bar className="mt-3 h-3 w-full" />
                <Bar className="mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
