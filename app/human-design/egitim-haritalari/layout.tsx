import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isEducationCatalogEnabled } from "@/lib/human-design/education/educationAccess";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN kabuğu (FAZ 2-B3) · Server Component.
 *   1) Hazırlık kapısı (HD_EDUCATION_CATALOG_ENABLED === "true") KAPALIYSA (varsayılan) DB'ye gitmeden notFound().
 *   2) Oturum istemcide olduğundan (HD/Astroloji ile aynı mimari) sayfa, sunucu erişim yoklamasından
 *      (/api/hd/education/access) 200 almadan HİÇBİR içerik çizmez; red → tek tip "Sayfa bulunamadı".
 *   3) Veri yetkisi HER API çağrısında sunucuda verilir (requireEducationViewer: uzman + demo değil + premium + HD izni +
 *      owner'ın kişi bazlı etkin yetkisi; doğrudan URL / tahmin edilen kimlik → 404 no-store). Bu kabuk o kapının yerine geçmez.
 */
export default function EducationCatalogLayout({ children }: { children: ReactNode }) {
  if (!isEducationCatalogEnabled()) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
