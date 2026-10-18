import AtlasCenterCard from "./AtlasCenterCard";
import CosmicAgendaCenterCard from "./CosmicAgendaCenterCard";
import ModuleVisibility from "./ModuleVisibility";
import AnalysisCenterHero from "./_components/AnalysisCenterHero";
import AnalysisModuleCard from "./_components/AnalysisModuleCard";
import type { AnalysisModuleVariant } from "./_components/analysisModuleThemes";

// 2026-10-17: alt kart yalnız ilgili modül yetkisi olan kullanıcıya görünür (adres → yetki anahtarları; TR alias dahil).
const SUB_MODULE_KEYS: Record<string, readonly string[]> = {
  "/numeroloji": ["numerology", "numeroloji"],
  "/human-design": ["human_design"],
};

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
        {/* Başlık (hero) — görünüm AnalysisCenterHero'da; metinler burada. */}
        <AnalysisCenterHero
          eyebrow="Yaşam Sistemi"
          title="Yaşam Analiz Merkezi"
          description="Numeroloji, Human Design ve Kozmik Ajanda analiz araçları"
        />

        {/* Modül kartları — kart tasarımı AnalysisModuleCard + analysisModuleThemes'ta (tek kaynak). */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:gap-5">
          {subModules.map((mod) => (
            <ModuleVisibility key={mod.href} keys={SUB_MODULE_KEYS[mod.href]}>
              <AnalysisModuleCard variant={mod.variant} title={mod.title} description={mod.desc} href={mod.href} />
            </ModuleVisibility>
          ))}
          {/* 2026-10-17: Yaşam Takvimi / Kozmik Ajanda — yalnız cosmic_calendar yetkisi olan kullanıcıya görünür. */}
          <CosmicAgendaCenterCard />
          {/* 2026-10-15: Gökyüzü Atlası — yalnız erişimi doğrulanan kullanıcıya görünür (AtlasCenterCard). */}
          <AtlasCenterCard />
        </div>
      </div>
    </main>
  );
}
