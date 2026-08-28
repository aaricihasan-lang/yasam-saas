import Link from "next/link";
import { STORE_BRAND_NAME } from "@/lib/store/types";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-[linear-gradient(180deg,#f7f5ef_0%,#f1f5ee_46%,#fbfaf6_100%)] px-6 text-stone-900 antialiased">
      <div className="max-w-md rounded-[28px] border border-stone-200/70 bg-white/75 px-8 py-14 text-center shadow-sm backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M24 40c0-9 5-16 14-18-2 10-7 15-14 18Z" strokeLinejoin="round" />
            <path d="M24 40c0-7-4-12-11-13 1.5 8 5 11 11 13Z" strokeLinejoin="round" />
            <path d="M24 40V22" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-black text-stone-900">Ürün bulunamadı</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-stone-500">
          Aradığınız ürün yayından kaldırılmış ya da hiç var olmamış olabilir.
        </p>
        <Link
          href="/magaza"
          className="mt-6 inline-flex rounded-full bg-emerald-700 px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-emerald-800"
        >
          {STORE_BRAND_NAME}
          {"'a dön"}
        </Link>
      </div>
    </main>
  );
}
