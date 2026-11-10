// KANIT SAYFASI (yalnız CI runner'ında app/zz-ekran altına kopyalanır; ürüne girmez).
// app/life-analysis/page.tsx'in birebir düzeni ve metinleri; yetki sarmalayıcıları (ModuleVisibility / erişim kontrolü) olmadan
// dört kart da gösterilir. Veri / istek / oturum yok.
import AnalysisCenterHero from "@/app/life-analysis/_components/AnalysisCenterHero";
import AnalysisModuleCard from "@/app/life-analysis/_components/AnalysisModuleCard";
import styles from "@/app/life-analysis/_components/premium/analizMerkezi.module.css";

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

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.decor} aria-hidden="true">
        <span className={styles.glowA} />
        <span className={styles.glowB} />
        <span className={styles.dust} />
        <span className={`${styles.ring} ${styles.ringA}`}><OrbitRings /></span>
        <span className={`${styles.ring} ${styles.ringB}`}><OrbitRings /></span>
        <span className={`${styles.ring} ${styles.ringC}`}><OrbitRings /></span>
      </div>
      <div className={styles.container}>
        <AnalysisCenterHero eyebrow="Yaşam Sistemi" title="Yaşam Analiz Merkezi" description="Numeroloji, Human Design ve Kozmik Ajanda analiz araçları" />
        <div className={styles.grid}>
          <AnalysisModuleCard variant="numerology" title="Numeroloji" description="Bütüncül Numeroloji veya Klasik Numeroloji yöntemiyle kişisel sayıları hesapla, kayıtları karşılaştır, rapor oluştur." href="/numeroloji-merkezi" />
          <AnalysisModuleCard variant="humanDesign" title="Human Design" description="Bilgi bankasına yüklediğiniz içeriklerle danışanlara kişiye özel Human Design raporları oluşturun." href="/human-design" />
          <AnalysisModuleCard variant="cosmicAgenda" href="/cosmic-calendar" title="Yaşam Takvimi / Kozmik Ajanda" description="Hicri takvim, hacamat günleri, ay evreleri ve günlük kozmik akış." status="Aktif" arrow />
          <AnalysisModuleCard variant="skyAtlas" href="/astroloji" title="Gökyüzü Atlası" description="Tüm astroloji analizleri, danışan arşivi ve haritalı Word / PDF raporları." />
        </div>
      </div>
    </main>
  );
}
