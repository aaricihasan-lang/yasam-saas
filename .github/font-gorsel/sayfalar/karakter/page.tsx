// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Önceki CI raporundaki 12 font kullanım farkını KARAKTER düzeyinde
// açıklamak için: Unbounded (Atlas başlık yazısı) her karakter ayrı öğede; Playfair Display (Analiz Merkezi kart başlığı)
// gerçek AnalysisModuleCard ile, her kartın başlığı tek karakter. CDP her öğe için çizen fontu raporlar.
import AnalysisModuleCard from "@/app/life-analysis/_components/AnalysisModuleCard";
import styles from "@/app/life-analysis/_components/premium/analizMerkezi.module.css";
import { atlasDisplay } from "@/app/admin/astroloji/_components/atlas/fonts";

const KARAKTERLER = ["P", "a", "ğ", "ı", "ş", "İ", "Ğ", "Ş", "Ç", "Ö", "Ü", "ç", "ö", "ü", "0", "₺", "€", "‰", "†", "_", "ǖ", "“", "”"];

export default function Page() {
  return (
    <main className={atlasDisplay.variable} style={{ padding: 16, background: "#fff", color: "#111" }}>
      {[300, 400, 600].map((w) => (
        <div key={w} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {KARAKTERLER.map((c) => (
            <span key={c} data-k={`unbounded ${w} ${c}`} style={{ fontFamily: "var(--font-atlas-display)", fontWeight: w, fontSize: 26 }}>{c}</span>
          ))}
        </div>
      ))}
      <div className={styles.grid}>
        {KARAKTERLER.map((c) => (
          <div key={c} data-k={`playfair 600 ${c}`}>
            <AnalysisModuleCard variant="numerology" title={c} description="—" href="/numeroloji-merkezi" />
          </div>
        ))}
      </div>
    </main>
  );
}
