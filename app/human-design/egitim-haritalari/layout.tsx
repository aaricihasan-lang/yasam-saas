import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { isEducationCatalogOpen } from "@/lib/human-design/education/educationAccess";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN kabuğu (FAZ 2-B3) · Server Component.
 *   1) Katalog kapısı (owner panelindeki anahtar; owner kararı 31.10.2026 — bkz. isEducationCatalogOpen) KAPALIYSA notFound().
 *   2) Oturum istemcide olduğundan (HD/Astroloji ile aynı mimari) sayfa, sunucu erişim yoklamasından
 *      (/api/hd/education/access) 200 almadan HİÇBİR içerik çizmez; red → tek tip "Sayfa bulunamadı".
 *   3) Veri yetkisi HER API çağrısında sunucuda verilir (requireEducationViewer: uzman + demo değil + premium + HD izni +
 *      owner'ın kişi bazlı etkin yetkisi; doğrudan URL / tahmin edilen kimlik → 404 no-store). Bu kabuk o kapının yerine geçmez.
 */
export default async function EducationCatalogLayout({ children }: { children: ReactNode }) {
  let open = false;
  try { open = await isEducationCatalogOpen(getServerDb()); } catch { open = false; }
  if (!open) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
