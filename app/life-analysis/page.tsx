import { Brain } from "lucide-react";
import AtlasCenterCard from "./AtlasCenterCard";
import AnalysisModuleCard from "./_components/AnalysisModuleCard";
import type { AnalysisModuleVariant } from "./_components/analysisModuleThemes";

// 2026-10-16: kart görünümü merkezî (_components): burada yalnız variant + metin + adres.
const subModules: { variant: AnalysisModuleVariant; title: string; desc: string; href: string }[] = [
  {
    variant: "numerology",
    title: "Numeroloji",
    desc: "Doğum tarihinden kişisel sayıları hesapla, çakra analizini görüntüle, PDF raporu oluştur.",
    href: "/numeroloji",
  },
  {
    variant: "humanDesign",
    title: "Human Design",
    desc: "Bilgi bankasına yüklediğiniz içeriklerle danışanlara kişiye özel Human Design raporları oluşturun.",
    href: "/human-design",
  },
];

export default function LifeAnalysisPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-violet-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-[15%] h-80 w-80 rounded-full bg-purple-300/12 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-16 lg:px-8 xl:px-10">
        {/* Başlık */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-md">
              <Brain className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                Yaşam Sistemi
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Yaşam Analiz Merkezi
              </h1>
            </div>
          </div>
          <p className="mt-2.5 max-w-lg text-sm font-medium text-slate-600 sm:text-base">
            Numeroloji ve Human Design analiz araçları
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-violet-200/80 via-purple-200/60 to-transparent" />
        </div>

        {/* Modül kartları — kart tasarımı AnalysisModuleCard + analysisModuleThemes'ta (tek kaynak). */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:gap-5">
          {subModules.map((mod) => (
            <AnalysisModuleCard key={mod.href} variant={mod.variant} title={mod.title} description={mod.desc} href={mod.href} />
          ))}
          {/* 2026-10-15: Gökyüzü Atlası — yalnız erişimi doğrulanan kullanıcıya görünür (AtlasCenterCard). */}
          <AtlasCenterCard />
        </div>
      </div>
    </main>
  );
}
