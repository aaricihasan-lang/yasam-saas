import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "İletişim — Yaşam Sistemi",
  description: "Yaşam Sistemi ile iletişime geçin.",
};

export default function IletisimPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <h1 className="mt-4 text-3xl font-black text-slate-950">İletişim</h1>
      <p className="mt-3 text-base text-slate-600">
        Sorularınız, destek talepleriniz veya üyelik işlemleri için bize ulaşabilirsiniz.
      </p>

      <div className="mt-10 space-y-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-6 py-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            Destek & Yönetici
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Şifre sıfırlama, üyelik ve modül erişimi için sistem yöneticinizle
            doğrudan iletişime geçin.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-6 py-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            Teknik Destek
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Teknik sorunlar ve hata bildirimleri için yöneticinize iletebilirsiniz.
          </p>
        </div>
      </div>
    </main>
  );
}
