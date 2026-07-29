/**
 * Aromaterapi V2 iskelet (skeleton) bileşenleri.
 *
 * Rota geçişlerinde (loading.tsx) ve bölüm içi bekleme durumlarında ANINDA
 * görsel geri bildirim verir — boş beyaz bekleme olmaz. Salt sunum; veri
 * yüklemez. Aşırı shimmer yok (tek pulse), layout shift azaltmak için sabit
 * yükseklikli yer tutucular kullanır.
 */

function Line({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Liste bölümleri için iskelet (arama alanı + kart yer tutucular). */
export function AromaterapiListSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <section className="rounded-[20px] border border-amber-100/70 bg-white/75 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-amber-100/60 pb-4">
        <Line className="h-10 w-full max-w-md" />
        <div className="flex gap-2">
          <Line className="h-4 w-24" />
          <Line className="h-4 w-20" />
          <Line className="h-4 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="flex h-[176px] flex-col gap-3 rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm"
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

/** Detay bölümleri için iskelet (başlık + içerik bölümleri yer tutucu). */
export function AromaterapiDetailSkeleton({ sections = 4 }: { sections?: number }) {
  return (
    <div className="w-full min-w-0">
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
      {Array.from({ length: sections }).map((_, i) => (
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

/**
 * Gelecekteki içerik bloklarını gösteren kontrollü bölüm-iskelet kartı.
 * "Yakında" sayfalarında sahte veri yerine, sayfanın ileride alacağı yapıyı
 * profesyonelce betimlemek için kullanılır.
 */
export function AromaterapiSectionSkeletonCard({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <section className="rounded-[20px] border border-amber-100/70 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-amber-100/60 pb-3">
        <h3 className="text-[13px] font-black tracking-tight text-slate-800">{title}</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
          Hazırlanıyor
        </span>
      </div>
      <p className="mt-3 text-[12px] font-medium leading-relaxed text-slate-500">{hint}</p>
      <div className="mt-4 space-y-2" aria-hidden>
        <Line className="h-3.5 w-full" />
        <Line className="h-3.5 w-11/12" />
        <Line className="h-3.5 w-3/4" />
      </div>
    </section>
  );
}
