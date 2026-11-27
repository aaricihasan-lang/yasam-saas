import type { ReactNode } from "react";
import SifaRehberi from "@/components/sifa-rehberi-f3/SifaRehberi";
import { sifaEkranAcik } from "@/lib/sifa-rehberi-v2/server/realRoute";
import { getServerDb } from "@/lib/supabase-server";

/**
 * Şifa Rehberi — ürün ekranı (F3: onaylı F2 Revizyon 7 tasarımı). Kişisel kütüphane; tüm alt yollar bu ekrandır
 * (ekran içi gezinme adres çubuğunun # kısmıyla yapılır).
 * SIFA_REHBERI_V2_ENABLED=1 değilse ekran ve API'si kapalıdır (acil durum anahtarı; API de 404 döner).
 * Bayrak açık olsa bile üç F3 migration'ı tamamlanmadan (sifa_v2_f3_hazir() yok) ekran "bakımda" kalır (F4-R2).
 */
export const dynamic = "force-dynamic";

export default async function SifaRehberiLayout({ children }: { children: ReactNode }) {
  void children;
  if (await sifaEkranAcik(getServerDb())) return <SifaRehberi />;
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px", fontSize: 16, lineHeight: 1.6 }} data-testid="sifa-kapali">
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Şifa Rehberi</h1>
      <p>Şifa Rehberi şu anda bakımda. Kayıtlarınız korunuyor; kısa süre sonra yeniden kullanılabilir olacak.</p>
    </main>
  );
}
