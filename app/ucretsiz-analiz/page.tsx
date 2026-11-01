import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { premiumFontVars } from "@/app/_premium/fonts";
import { getServerDb } from "@/lib/supabase-server";
import { loadVisitorState, publicEnabled } from "@/lib/campaign/visitor/publicState";
import styles from "@/app/admin/kampanya-merkezi/kampanya.module.css";
import VisitorApp from "./_ziyaretci/VisitorApp";

// Ücretsiz analiz kampanyası — herkese açık ziyaretçi sayfası (KM-3). Ortam kapısı (CAMPAIGN_PUBLIC_ENABLED) kapalıyken
// sayfa YOK (404). Kapı açık + kampanya kapalıysa nazik "şu anda kampanya yok" görünümü. Durum her istekte sunucudan okunur.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ücretsiz Analiz · Yaşam Sistemi",
  description: "Yaşam Sistemi'nin profesyonel analiz altyapısını sınırlı kontenjanla ücretsiz deneyin.",
};

export default async function UcretsizAnalizPage() {
  if (!publicEnabled()) notFound();
  const state = await loadVisitorState(getServerDb());
  return (
    <div className={`${styles.km} ${premiumFontVars}`}>
      <VisitorApp initial={state} />
    </div>
  );
}
