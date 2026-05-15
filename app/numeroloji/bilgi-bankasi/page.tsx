import Link from "next/link";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";

const navLinkClass =
  "inline-flex items-center gap-2 rounded-2xl border border-white/85 bg-white/80 px-6 py-3 text-sm font-bold text-violet-900 shadow-[0_8px_26px_-8px_rgba(91,33,182,0.38)] ring-1 ring-violet-200/55 backdrop-blur-md transition hover:scale-[1.03] hover:border-violet-300/90 hover:bg-white hover:text-violet-950 hover:shadow-[0_14px_36px_-8px_rgba(91,33,182,0.45)] no-underline";

export default function NumerolojiBilgiBankasiPage() {
  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-7xl">
      <div className="mb-8 rounded-[32px] border border-white/75 bg-white/55 px-7 py-9 shadow-[0_18px_52px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 lg:py-12">
        <div className="mb-5 flex flex-wrap gap-3 sm:mb-6">
          <Link href="/numeroloji" className={navLinkClass}>
            ← Modül seçimi
          </Link>
          <Link href="/numeroloji/analiz" className={navLinkClass}>
            Numeroloji Analizi
          </Link>
          <Link href="/numeroloji/liste" className={navLinkClass}>
            Kayıtlı Analizler
          </Link>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
          Bilgi Bankası
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      <div className="rounded-[32px] border border-dashed border-violet-200/90 bg-white/70 px-8 py-16 text-center shadow-[0_12px_40px_-12px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md sm:px-12 sm:py-20">
        <p className="mx-auto max-w-xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
          Bu bölüm sonraki aşamada eğitim ve bilgi verileriyle doldurulacak.
        </p>
      </div>
    </NumerolojiPremiumShell>
  );
}
