"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";

type ModuleAccessDeniedProps = {
  reason?: "permission" | "membership";
};

export default function ModuleAccessDenied({
  reason = "permission",
}: ModuleAccessDeniedProps) {
  const isMembership = reason === "membership";
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#fff1f2_100%)] px-6 py-12 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-violet-300/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[380px] w-[380px] rounded-full bg-rose-200/30 blur-[110px]" />

      <div className="relative z-10 w-full max-w-xl rounded-[32px] border-2 border-white/90 bg-white/95 p-10 text-center shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-violet-600 text-white shadow-lg">
          <ShieldX className="h-10 w-10" aria-hidden />
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-violet-700">
          Erişim kısıtlı
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
          {isMembership ? "Üyelik Süresi Doldu" : "Yetkiniz Bulunmuyor"}
        </h1>
        <p className="mt-4 text-base font-medium leading-relaxed text-slate-600 md:text-lg">
          {isMembership ? (
            <>
              Deneme süreniz sona erdi veya üyeliğiniz aktif değil.
              <br />
              Modüllere erişim için yöneticiniz ile görüşün.
            </>
          ) : (
            <>
              Bu modül hesabınızda aktif değil.
              <br />
              Lütfen yöneticiniz ile görüşün.
            </>
          )}
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 px-8 text-base font-black text-violet-950 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:from-violet-100 hover:to-indigo-100 hover:shadow-lg no-underline"
        >
          Ana Panele Dön
        </Link>
      </div>
    </main>
  );
}
