import Link from "next/link";

type RefleksolojiModulePlaceholderProps = {
  title: string;
  description: string;
};

export function RefleksolojiModulePlaceholder({ title, description }: RefleksolojiModulePlaceholderProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#f5f0ff_0%,#ede9fe_32%,#faf5ff_68%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href="/dashboard/refleksoloji"
          className="mb-8 inline-flex w-fit items-center gap-2 rounded-2xl border border-violet-200/90 bg-white/90 px-5 py-3 text-sm font-black text-violet-900 shadow-md ring-1 ring-violet-100/80 transition hover:border-violet-300 hover:bg-white hover:shadow-lg"
        >
          <span aria-hidden>←</span>
          Refleksoloji Ana Menü
        </Link>

        <section className="flex flex-1 flex-col justify-center rounded-[28px] border border-white/90 bg-white/75 p-8 shadow-[0_20px_56px_-20px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/60 backdrop-blur-md sm:p-10 lg:p-12">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700/90">Refleksoloji Modülü</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-600 sm:text-lg">{description}</p>
          <p className="mt-8 rounded-2xl border border-dashed border-violet-200/80 bg-violet-50/50 px-5 py-4 text-sm font-medium leading-relaxed text-violet-900/85 sm:text-base">
            Bu alan masaüstü refleksoloji yapısına göre adım adım aktarılacaktır.
          </p>
        </section>
      </div>
    </main>
  );
}
