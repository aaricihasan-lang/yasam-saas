import Link from "next/link";

export default function StokYonetimiPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] px-4 py-10 text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-[400px] w-[400px] rounded-full bg-cyan-300/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full bg-violet-300/15 blur-[120px]" />

      <section className="relative z-10 w-full max-w-xl rounded-3xl border-2 border-violet-300/50 bg-white/80 p-6 text-center shadow-xl backdrop-blur-xl sm:p-10">
        <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-violet-700">
          DOĞALTAŞ
        </span>

        <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-violet-100 text-4xl ring-1 ring-cyan-200/70">
          📦
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Stok Yönetimi
          </h1>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-black text-amber-700">
            Yakında
          </span>
        </div>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
          Stok yönetimi özelliği yakında aktif olacak. Taş envanterinizi,
          miktarlarını ve fiyatlarını tek ekrandan kolayca yönetebileceksiniz.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <Link
            href="/dogaltas"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:brightness-110 sm:w-auto"
          >
            Doğaltaş Paneline Dön
          </Link>
          <Link
            href="/dogaltas/dogaltas-listesi"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
          >
            Doğaltaş Listesi
          </Link>
        </div>
      </section>
    </main>
  );
}
