import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isPrivateEducationEnabled } from "@/lib/human-design/education/private/privateAccess";

/**
 * Human Design Eğitim Merkezi — eğitmen kabuğu (FAZ 7) · Server Component.
 *   1) Hazırlık kapısı (HD_PRIVATE_EDUCATION_ENABLED === "true") KAPALIYSA (varsayılan) DB'ye gitmeden notFound()
 *      → gerçek 404 (soft-404 değil): sayfa HTML'i ve istemci paketi gönderilmez.
 *   2) Oturum istemcide (HD ile aynı mimari): sayfa, sunucu erişim yoklamasından 200 almadan içerik çizmez.
 *   3) Veri yetkisi HER API çağrısında sunucuda ve DB'de verilir (requirePrivateTrainer + hd_edu_priv_* RPC).
 */
export default function EducationCenterLayout({ children }: { children: ReactNode }) {
  if (!isPrivateEducationEnabled()) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
