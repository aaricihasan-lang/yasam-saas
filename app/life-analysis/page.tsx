import AtlasCenterCard from "./AtlasCenterCard";
import CosmicAgendaCenterCard from "./CosmicAgendaCenterCard";
import ModuleVisibility from "./ModuleVisibility";
import AnalysisCenterHero from "./_components/AnalysisCenterHero";
import AnalysisModuleCard, { type AnalysisModuleVariant } from "./_components/AnalysisModuleCard";
import styles from "./_components/premium/analizMerkezi.module.css";

// 2026-10-17: alt kart yalnız ilgili modül yetkisi olan kullanıcıya görünür (adres → yetki anahtarları; TR alias dahil).
const SUB_MODULE_KEYS: Record<string, readonly string[]> = {
  "/numeroloji-merkezi": ["numerology", "numeroloji"],
  "/human-design": ["human_design"],
};

// 2026-10-16: kart görünümü merkezî (_components): burada yalnız variant + metin + adres.
const subModules: { variant: AnalysisModuleVariant; title: string; desc: string; href: string }[] = [
  {
    variant: "numerology",
    title: "Numeroloji",
    desc: "Bütüncül Numeroloji veya Klasik Numeroloji yöntemiyle kişisel sayıları hesapla, kayıtları karşılaştır, rapor oluştur.",
    href: "/numeroloji-merkezi",
  },
  {
    variant: "humanDesign",
    title: "Human Design",
    desc: "Bilgi bankasına yüklediğiniz içeriklerle danışanlara kişiye özel Human Design raporları oluşturun.",
    href: "/human-design",
  },
];

/** Silik yörünge halkaları (dekor): ince altın / lila çizgiler, noktalar ve çentikler. */
function OrbitRings() {
  return (
    <svg viewBox="0 0 400 400" focusable="false">
      <g fill="none">
        <circle cx="200" cy="200" r="196" stroke="#c4b5fd" strokeOpacity="0.55" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="160" stroke="#d9a95a" strokeOpacity="0.45" strokeWidth="0.7" strokeDasharray="2 6" />
        <circle cx="200" cy="200" r="118" stroke="#c4b5fd" strokeOpacity="0.45" strokeWidth="0.7" />
        <circle cx="200" cy="200" r="70" stroke="#d9a95a" strokeOpacity="0.35" strokeWidth="0.7" strokeDasharray="1 5" />
        <path d="M200 4 V396 M4 200 H396" stroke="#c4b5fd" strokeOpacity="0.22" strokeWidth="0.6" />
        <path d="M61 61 L339 339 M339 61 L61 339" stroke="#d9a95a" strokeOpacity="0.16" strokeWidth="0.6" />
      </g>
      <circle cx="361" cy="113" r="3.2" fill="#d9a95a" fillOpacity="0.6" />
      <circle cx="82" cy="314" r="2.6" fill="#a78bfa" fillOpacity="0.6" />
      <circle cx="318" cy="200" r="2.2" fill="#d9a95a" fillOpacity="0.5" />
    </svg>
  );
}

export default function LifeAnalysisPage() {
  return (
    <main className={styles.page}>
      {/* 2026-10-21 açık premium: kartlar dışındaki boşlukları dolduran silik dekor (içerik değil; tıklamayı engellemez). */}
      <div className={styles.decor} aria-hidden="true">
        <span className={styles.glowA} />
        <span className={styles.glowB} />
        <span className={styles.dust} />
        <span className={`${styles.ring} ${styles.ringA}`}>
          <OrbitRings />
        </span>
        <span className={`${styles.ring} ${styles.ringB}`}>
          <OrbitRings />
        </span>
        <span className={`${styles.ring} ${styles.ringC}`}>
          <OrbitRings />
        </span>
      </div>

      <div className={styles.container}>
        {/* Başlık (hero) — görünüm AnalysisCenterHero'da; metinler burada. */}
        <AnalysisCenterHero
          eyebrow="Yaşam Sistemi"
          title="Yaşam Analiz Merkezi"
          description="Numeroloji, Human Design ve Kozmik Ajanda analiz araçları"
        />

        {/* Modül kartları — kart AnalysisModuleCard, stil premium/analizMerkezi.module.css (tek kaynak). */}
        <div className={styles.grid}>
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
