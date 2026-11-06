import type { Metadata } from "next";
import { premiumFontVars } from "@/app/_premium/fonts";
import styles from "./kampanya.module.css";
import KampanyaPanel from "./_panel/KampanyaPanel";

// Kampanya Merkezi — Owner paneli (KM-2). Erişim layout.tsx'te (katı owner → aksi notFound); veri yetkisi her API çağrısında.
export const metadata: Metadata = { title: "Kampanya Merkezi · Yaşam Sistemi", robots: { index: false, follow: false } };

export default function KampanyaMerkeziPage() {
  return (
    <div className={`${styles.km} ${premiumFontVars}`}>
      <KampanyaPanel />
    </div>
  );
}
